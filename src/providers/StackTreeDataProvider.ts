import * as vscode from 'vscode';
import { AuthService } from '../services/AuthService';
import { FilesService } from '../services/FilesService';
import { ApiClient } from '../services/ApiClient';
import { FileEntry, Server, Stack } from '../types';

export class StackTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly fileEntry?: FileEntry,
        public readonly contextValue?: string
    ) {
        super(label, collapsibleState);

        if (fileEntry) {
            const permissions = fileEntry.mode;
            let permissionDisplay = permissions;

            if (permissions && permissions.match(/^[d-][rwx-]{9}$/)) {
                const numericMode = StackTreeItem.convertSymbolicToNumeric(permissions);
                permissionDisplay = `${permissions} (${numericMode})`;
            }

            let tooltip = `${fileEntry.name}\nSize: ${fileEntry.displaySize}\nModified: ${fileEntry.modTime}\nPermissions: ${permissionDisplay}`;

            if (fileEntry.ownerId !== undefined || fileEntry.groupId !== undefined || fileEntry.owner || fileEntry.group) {
                let ownerInfo = '';
                let groupInfo = '';

                if (fileEntry.owner && fileEntry.ownerId !== undefined) {
                    ownerInfo = `${fileEntry.owner} (${fileEntry.ownerId})`;
                } else if (fileEntry.owner) {
                    ownerInfo = fileEntry.owner;
                } else if (fileEntry.ownerId !== undefined) {
                    ownerInfo = `uid:${fileEntry.ownerId}`;
                } else {
                    ownerInfo = 'unknown';
                }

                if (fileEntry.group && fileEntry.groupId !== undefined) {
                    groupInfo = `${fileEntry.group} (${fileEntry.groupId})`;
                } else if (fileEntry.group) {
                    groupInfo = fileEntry.group;
                } else if (fileEntry.groupId !== undefined) {
                    groupInfo = `gid:${fileEntry.groupId}`;
                } else {
                    groupInfo = 'unknown';
                }

                tooltip += `\nOwner: ${ownerInfo}\nGroup: ${groupInfo}`;
            }

            this.tooltip = tooltip;
            this.description = fileEntry.isDirectory ? '' : fileEntry.displaySize;

            if (fileEntry.isDirectory) {
                this.iconPath = new vscode.ThemeIcon('folder');
                this.contextValue = 'folder';
                this.command = undefined;
            } else {
                this.iconPath = this.getFileIcon(fileEntry.extension);
                this.contextValue = 'file';
                this.command = {
                    command: 'berth.openFile',
                    title: 'Open File',
                    arguments: [fileEntry]
                };
            }
        }
    }

    private getFileIcon(extension?: string): vscode.ThemeIcon {
        if (!extension) {return new vscode.ThemeIcon('file');}

        switch (extension.toLowerCase()) {
            case 'yml':
            case 'yaml':
                return new vscode.ThemeIcon('file-code');
            case 'json':
                return new vscode.ThemeIcon('json');
            case 'md':
            case 'readme':
                return new vscode.ThemeIcon('markdown');
            case 'txt':
                return new vscode.ThemeIcon('file-text');
            case 'sh':
            case 'bat':
                return new vscode.ThemeIcon('terminal');
            case 'js':
            case 'ts':
                return new vscode.ThemeIcon('javascript');
            case 'py':
                return new vscode.ThemeIcon('python');
            case 'dockerfile':
                return new vscode.ThemeIcon('file-code');
            case 'env':
                return new vscode.ThemeIcon('gear');
            default:
                return new vscode.ThemeIcon('file');
        }
    }

    static convertSymbolicToNumeric(symbolic: string): string {
        if (!symbolic || symbolic.length !== 10) {
            return 'unknown';
        }

        const permissions = symbolic.slice(1);

        let numeric = '';
        
        for (let i = 0; i < 9; i += 3) {
            let value = 0;

            if (permissions[i] === 'r') {
                value += 4;
            }
            
            if (permissions[i + 1] === 'w') {
                value += 2;
            }
            
            if (permissions[i + 2] === 'x' || permissions[i + 2] === 's' || permissions[i + 2] === 't') {
                value += 1;
            }

            numeric += value.toString();
        }

        return '0' + numeric;
    }
}

export class StackTreeDataProvider implements vscode.TreeDataProvider<StackTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<StackTreeItem | undefined | null | void> = new vscode.EventEmitter<StackTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<StackTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentServer: Server | null = null;
    private currentStack: Stack | null = null;
    private filesService: FilesService;

    constructor(
        private authService: AuthService,
        private apiClient: ApiClient
    ) {
        this.filesService = new FilesService(apiClient);
    }

    public setCurrentServer(server: Server): void {
        this.currentServer = server;
        this.currentStack = null;
        this.refresh();
    }

    public setCurrentStack(stack: Stack | null): void {
        this.currentStack = stack;
        this.refresh();
    }

    public getCurrentServer(): Server | null {
        return this.currentServer;
    }

    public getCurrentStack(): Stack | null {
        return this.currentStack;
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: StackTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: StackTreeItem): Promise<StackTreeItem[]> {
        if (!this.authService.isAuthenticated()) {
            return [];
        }

        if (!this.currentServer || !this.currentStack) {
            return [
                new StackTreeItem(
                    'No server or stack selected',
                    vscode.TreeItemCollapsibleState.None
                )
            ];
        }

        try {
            let path = '';
            if (element && element.fileEntry) {
                path = element.fileEntry.path;
            }

            const listing = await this.filesService.listDirectory(
                this.currentServer.id,
                this.currentStack.name,
                path || undefined
            );

            const items: StackTreeItem[] = [];

            if (!listing || !listing.entries || listing.entries.length === 0) {
                return [];
            }

            const sortedEntries = listing.entries.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) {return -1;}
                if (!a.isDirectory && b.isDirectory) {return 1;}
                return a.name.localeCompare(b.name);
            });

            for (const entry of sortedEntries) {
                if (!entry || !entry.name) {
                    continue;
                }

                const collapsibleState = entry.isDirectory
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;

                items.push(new StackTreeItem(
                    entry.name,
                    collapsibleState,
                    entry
                ));
            }

            return items;
        } catch (error) {
            return [
                new StackTreeItem(
                    `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    vscode.TreeItemCollapsibleState.None
                )
            ];
        }
    }

    public async createFile(parentItem?: StackTreeItem): Promise<void> {
        if (!this.currentServer || !this.currentStack) {
            vscode.window.showErrorMessage('No server or stack selected');
            return;
        }

        const fileName = await vscode.window.showInputBox({
            prompt: 'Enter file name',
            placeHolder: 'example.txt'
        });

        if (!fileName) {
            return;
        }

        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            let parentPath = '';
            if (parentItem && parentItem.fileEntry) {
                parentPath = parentItem.fileEntry.path;
            }

            const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;

            await this.filesService.writeFile(this.currentServer.id, this.currentStack.name, {
                path: filePath,
                content: ''
            });

            this.refresh();
            vscode.window.showInformationMessage(`File "${fileName}" created successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async createFolder(parentItem?: StackTreeItem): Promise<void> {
        if (!this.currentServer || !this.currentStack) {
            vscode.window.showErrorMessage('No server or stack selected');
            return;
        }

        const folderName = await vscode.window.showInputBox({
            prompt: 'Enter folder name',
            placeHolder: 'new-folder'
        });

        if (!folderName) {
            return;
        }

        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            let parentPath = '';
            if (parentItem && parentItem.fileEntry) {
                parentPath = parentItem.fileEntry.path;
            }

            const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;

            await this.filesService.createDirectory(this.currentServer.id, this.currentStack.name, {
                path: folderPath
            });

            this.refresh();
            vscode.window.showInformationMessage(`Folder "${folderName}" created successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async deleteFile(item: StackTreeItem): Promise<void> {
        if (!this.currentServer || !this.currentStack || !item.fileEntry) {
            return;
        }

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${item.fileEntry.name}"?`,
            { modal: true },
            'Delete'
        );

        if (confirmation !== 'Delete') {
            return;
        }

        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            await this.filesService.deleteFile(this.currentServer.id, this.currentStack.name, {
                path: item.fileEntry.path
            });

            this.refresh();
            vscode.window.showInformationMessage(`"${item.fileEntry.name}" deleted successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async renameFile(item: StackTreeItem): Promise<void> {
        if (!this.currentServer || !this.currentStack || !item.fileEntry) {
            return;
        }

        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new name',
            value: item.fileEntry.name
        });

        if (!newName || newName === item.fileEntry.name) {
            return;
        }

        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            const pathSegments = item.fileEntry.path.split('/');
            pathSegments[pathSegments.length - 1] = newName;
            const newPath = pathSegments.join('/');

            await this.filesService.renameFile(this.currentServer.id, this.currentStack.name, {
                oldPath: item.fileEntry.path,
                newPath: newPath
            });

            this.refresh();
            vscode.window.showInformationMessage(`Renamed to "${newName}" successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to rename: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async uploadFile(parentItem?: StackTreeItem): Promise<void> {
        if (!this.currentServer || !this.currentStack) {
            vscode.window.showErrorMessage('No server or stack selected');
            return;
        }

        const files = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            openLabel: 'Upload'
        });

        if (!files || files.length === 0) {
            return;
        }

        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            let parentPath = '';
            if (parentItem && parentItem.fileEntry) {
                parentPath = parentItem.fileEntry.path;
            }

            for (const fileUri of files) {
                const fileName = fileUri.path.split('/').pop() || 'unknown';
                const fileData = await vscode.workspace.fs.readFile(fileUri);

                const file = new File([fileData], fileName);

                await this.filesService.uploadFile(
                    this.currentServer.id,
                    this.currentStack.name,
                    parentPath,
                    file,
                    fileName
                );
            }

            this.refresh();
            vscode.window.showInformationMessage(`${files.length} file(s) uploaded successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to upload files: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async downloadFile(item: StackTreeItem): Promise<void> {
        if (!this.currentServer || !this.currentStack || !item.fileEntry || item.fileEntry.isDirectory) {
            return;
        }

        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(item.fileEntry.name),
                saveLabel: 'Download'
            });

            if (!saveUri) {
                return;
            }

            const fileData = await this.filesService.downloadFile(
                this.currentServer.id,
                this.currentStack.name,
                item.fileEntry.path,
                item.fileEntry.name
            );

            await vscode.workspace.fs.writeFile(saveUri, new Uint8Array(fileData));
            vscode.window.showInformationMessage(`File downloaded to ${saveUri.fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async chmodFile(item: StackTreeItem): Promise<void> {
        if (!this.currentServer || !this.currentStack || !item.fileEntry) {
            return;
        }

        const currentMode = item.fileEntry.mode || '0644';
        const newMode = await vscode.window.showInputBox({
            prompt: `Enter new permissions for "${item.fileEntry.name}"`,
            placeHolder: 'e.g., 0755, 644, 755',
            value: currentMode,
            validateInput: (value) => {
                if (!/^[0-7]{3,4}$/.test(value)) {
                    return 'Please enter valid octal permissions (e.g., 755, 0644)';
                }
                return null;
            }
        });

        if (!newMode || newMode === currentMode) {
            return;
        }

        let recursive = false;
        if (item.fileEntry.isDirectory) {
            const choice = await vscode.window.showQuickPick(
                [
                    { label: 'Apply to this folder only', value: false },
                    { label: 'Apply recursively to all contents', value: true }
                ],
                {
                    placeHolder: 'Choose how to apply permissions',
                    ignoreFocusOut: true
                }
            );

            if (!choice) {
                return;
            }
            recursive = choice.value;
        }

        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            await this.filesService.chmodFile(this.currentServer.id, this.currentStack.name, {
                path: item.fileEntry.path,
                mode: newMode.startsWith('0') ? newMode : `0${newMode}`,
                recursive: recursive
            });

            this.refresh();
            vscode.window.showInformationMessage(
                `Permissions changed to ${newMode} for "${item.fileEntry.name}"${recursive ? ' (recursive)' : ''}`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to change permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async chownFile(item: StackTreeItem): Promise<void> {
        if (!this.currentServer || !this.currentStack || !item.fileEntry) {
            return;
        }

        const currentOwner = item.fileEntry.owner || `uid:${item.fileEntry.ownerId || 'unknown'}`;
        const currentGroup = item.fileEntry.group || `gid:${item.fileEntry.groupId || 'unknown'}`;

        const ownerInput = await vscode.window.showInputBox({
            prompt: `Enter new owner ID for "${item.fileEntry.name}" (leave empty to keep current: ${currentOwner})`,
            placeHolder: 'e.g., 1000',
            value: item.fileEntry.ownerId?.toString() || ''
        });

        if (ownerInput === undefined) {
            return;
        }

        const groupInput = await vscode.window.showInputBox({
            prompt: `Enter new group ID for "${item.fileEntry.name}" (leave empty to keep current: ${currentGroup})`,
            placeHolder: 'e.g., 100',
            value: item.fileEntry.groupId?.toString() || ''
        });

        if (groupInput === undefined) {
            return;
        }

        if (!ownerInput.trim() && !groupInput.trim()) {
            vscode.window.showInformationMessage('At least one of owner or group must be specified');
            return;
        }

        let recursive = false;
        if (item.fileEntry.isDirectory) {
            const choice = await vscode.window.showQuickPick(
                [
                    { label: 'Apply to this folder only', value: false },
                    { label: 'Apply recursively to all contents', value: true }
                ],
                {
                    placeHolder: 'Choose how to apply ownership',
                    ignoreFocusOut: true
                }
            );

            if (!choice) {
                return;
            }
            recursive = choice.value;
        }

        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            const ownerId = ownerInput.trim() ? parseInt(ownerInput.trim()) : undefined;
            const groupId = groupInput.trim() ? parseInt(groupInput.trim()) : undefined;

            if (ownerInput.trim() && isNaN(ownerId!)) {
                vscode.window.showErrorMessage('Owner must be a numeric user ID');
                return;
            }

            if (groupInput.trim() && isNaN(groupId!)) {
                vscode.window.showErrorMessage('Group must be a numeric group ID');
                return;
            }


            await this.filesService.chownFile(this.currentServer.id, this.currentStack.name, {
                path: item.fileEntry.path,
                owner_id: ownerId,
                group_id: groupId,
                recursive: recursive
            });

            this.refresh();
            const changes = [];
            if (ownerId !== undefined) changes.push(`owner: ${ownerId}`);
            if (groupId !== undefined) changes.push(`group: ${groupId}`);

            vscode.window.showInformationMessage(
                `Ownership changed (${changes.join(', ')}) for "${item.fileEntry.name}"${recursive ? ' (recursive)' : ''}`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to change ownership: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

}