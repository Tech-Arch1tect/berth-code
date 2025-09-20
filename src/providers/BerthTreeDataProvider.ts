import * as vscode from 'vscode';
import { AuthService } from '../services/AuthService';
import { ApiClient } from '../services/ApiClient';
import { FilesService } from '../services/FilesService';
import { Server, Stack, BerthTreeItem, ServerTreeItem, StackTreeItem, FileTreeItem, FileEntry } from '../types';

export class BerthTreeItemImpl extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly data: BerthTreeItem,
        public readonly contextValue?: string
    ) {
        super(label, collapsibleState);

        if (data.type === 'server') {
            this.iconPath = new vscode.ThemeIcon('server');
            this.contextValue = 'server';
            this.tooltip = `${data.server.name}\n${data.server.host}:${data.server.port}`;
        } else if (data.type === 'stack') {
            this.iconPath = new vscode.ThemeIcon('layers');
            this.contextValue = 'stack';
            this.tooltip = `${data.stack.name}\nServer: ${data.server.name}\nStatus: ${data.stack.status || 'Unknown'}`;
            this.command = {
                command: 'berth.openStackInExplorer',
                title: 'Open Stack in Explorer',
                arguments: [data.server, data.stack]
            };
        } else if (data.type === 'file') {
            this.contextValue = data.fileEntry.isDirectory ? 'folder' : 'file';
            this.iconPath = data.fileEntry.isDirectory
                ? new vscode.ThemeIcon('folder')
                : this.getFileIcon(data.fileEntry.extension);

            
            const permissions = data.fileEntry.mode;
            let permissionDisplay = permissions;

            if (permissions && permissions.match(/^[d-][rwx-]{9}$/)) {
                const numericMode = BerthTreeItemImpl.convertSymbolicToNumeric(permissions);
                permissionDisplay = `${permissions} (${numericMode})`;
            }

            let tooltip = `${data.fileEntry.name}\nSize: ${data.fileEntry.displaySize}\nModified: ${data.fileEntry.modTime}\nPermissions: ${permissionDisplay}`;

            if (data.fileEntry.ownerId !== undefined || data.fileEntry.groupId !== undefined || data.fileEntry.owner || data.fileEntry.group) {
                let ownerInfo = '';
                let groupInfo = '';

                if (data.fileEntry.owner && data.fileEntry.ownerId !== undefined) {
                    ownerInfo = `${data.fileEntry.owner} (${data.fileEntry.ownerId})`;
                } else if (data.fileEntry.owner) {
                    ownerInfo = data.fileEntry.owner;
                } else if (data.fileEntry.ownerId !== undefined) {
                    ownerInfo = `uid:${data.fileEntry.ownerId}`;
                } else {
                    ownerInfo = 'unknown';
                }

                if (data.fileEntry.group && data.fileEntry.groupId !== undefined) {
                    groupInfo = `${data.fileEntry.group} (${data.fileEntry.groupId})`;
                } else if (data.fileEntry.group) {
                    groupInfo = data.fileEntry.group;
                } else if (data.fileEntry.groupId !== undefined) {
                    groupInfo = `gid:${data.fileEntry.groupId}`;
                } else {
                    groupInfo = 'unknown';
                }

                tooltip += `\nOwner: ${ownerInfo}\nGroup: ${groupInfo}`;
            }

            this.tooltip = tooltip;
            this.description = data.fileEntry.isDirectory ? '' : data.fileEntry.displaySize;

            if (!data.fileEntry.isDirectory) {
                this.command = {
                    command: 'berth.openFile',
                    title: 'Open File',
                    arguments: [data.fileEntry, data.server, data.stack]
                };
            }
        }
    }

    private getFileIcon(extension?: string): vscode.ThemeIcon {
        if (!extension) {return new vscode.ThemeIcon('file');}

        switch (extension.toLowerCase()) {
            case 'js':
            case 'ts':
            case 'jsx':
            case 'tsx':
                return new vscode.ThemeIcon('file-code');
            case 'json':
                return new vscode.ThemeIcon('json');
            case 'md':
                return new vscode.ThemeIcon('markdown');
            case 'py':
                return new vscode.ThemeIcon('snake');
            case 'go':
                return new vscode.ThemeIcon('go');
            case 'rs':
                return new vscode.ThemeIcon('rust');
            case 'yml':
            case 'yaml':
                return new vscode.ThemeIcon('settings');
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

export class BerthTreeDataProvider implements vscode.TreeDataProvider<BerthTreeItemImpl> {
    private _onDidChangeTreeData: vscode.EventEmitter<BerthTreeItemImpl | undefined | null | void> = new vscode.EventEmitter<BerthTreeItemImpl | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<BerthTreeItemImpl | undefined | null | void> = this._onDidChangeTreeData.event;

    private filesService: FilesService;

    constructor(
        private authService: AuthService,
        private apiClient: ApiClient
    ) {
        this.filesService = new FilesService(apiClient);
    }

    private currentServer: Server | null = null;
    private currentStack: Stack | null = null;

    public getCurrentServer(): Server | null {
        return this.currentServer;
    }

    public getCurrentStack(): Stack | null {
        return this.currentStack;
    }

    public setCurrentServer(server: Server | null): void {
        this.currentServer = server;
    }

    public setCurrentStack(stack: Stack | null): void {
        this.currentStack = stack;
    }

    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    public async createFile(parentItem?: BerthTreeItemImpl): Promise<void> {
        
        let targetServer: Server | null = null;
        let targetStack: Stack | null = null;
        let parentPath = '';

        if (parentItem?.data) {
            if (parentItem.data.type === 'file' && parentItem.data.fileEntry.isDirectory) {
                
                targetServer = parentItem.data.server;
                targetStack = parentItem.data.stack;
                parentPath = parentItem.data.fileEntry.path;
            } else if (parentItem.data.type === 'stack') {
                
                targetServer = parentItem.data.server;
                targetStack = parentItem.data.stack;
                parentPath = '';
            }
        }

        if (!targetServer || !targetStack) {
            vscode.window.showErrorMessage('Please select a stack or folder to create the file in');
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

            const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;

            await this.filesService.writeFile(targetServer.id, targetStack.name, {
                path: filePath,
                content: ''
            });

            this.refresh();
            vscode.window.showInformationMessage(`File "${fileName}" created successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async createFolder(parentItem?: BerthTreeItemImpl): Promise<void> {
        
        let targetServer: Server | null = null;
        let targetStack: Stack | null = null;
        let parentPath = '';

        if (parentItem?.data) {
            if (parentItem.data.type === 'file' && parentItem.data.fileEntry.isDirectory) {
                
                targetServer = parentItem.data.server;
                targetStack = parentItem.data.stack;
                parentPath = parentItem.data.fileEntry.path;
            } else if (parentItem.data.type === 'stack') {
                
                targetServer = parentItem.data.server;
                targetStack = parentItem.data.stack;
                parentPath = '';
            }
        }

        if (!targetServer || !targetStack) {
            vscode.window.showErrorMessage('Please select a stack or folder to create the folder in');
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

            const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;

            await this.filesService.createDirectory(targetServer.id, targetStack.name, {
                path: folderPath
            });

            this.refresh();
            vscode.window.showInformationMessage(`Folder "${folderName}" created successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create folder: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async deleteFile(item: BerthTreeItemImpl): Promise<void> {
        if (!item?.data || item.data.type !== 'file') {
            vscode.window.showErrorMessage('Please select a file or folder to delete');
            return;
        }

        const fileEntry = item.data.fileEntry;
        const server = item.data.server;
        const stack = item.data.stack;

        const confirmation = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${fileEntry.name}"?`,
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

            await this.filesService.deleteFile(server.id, stack.name, {
                path: fileEntry.path
            });

            this.refresh();
            vscode.window.showInformationMessage(`"${fileEntry.name}" deleted successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async renameFile(item: BerthTreeItemImpl): Promise<void> {
        if (!item?.data || item.data.type !== 'file') {
            vscode.window.showErrorMessage('Please select a file or folder to rename');
            return;
        }

        const fileEntry = item.data.fileEntry;
        const server = item.data.server;
        const stack = item.data.stack;

        const newName = await vscode.window.showInputBox({
            prompt: 'Enter new name',
            value: fileEntry.name
        });

        if (!newName || newName === fileEntry.name) {
            return;
        }

        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            const pathSegments = fileEntry.path.split('/');
            pathSegments[pathSegments.length - 1] = newName;
            const newPath = pathSegments.join('/');

            await this.filesService.renameFile(server.id, stack.name, {
                oldPath: fileEntry.path,
                newPath: newPath
            });

            this.refresh();
            vscode.window.showInformationMessage(`Renamed to "${newName}" successfully`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to rename: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async uploadFile(parentItem?: BerthTreeItemImpl): Promise<void> {
        
        let targetServer: Server | null = null;
        let targetStack: Stack | null = null;
        let parentPath = '';

        if (parentItem?.data) {
            if (parentItem.data.type === 'file' && parentItem.data.fileEntry.isDirectory) {
                
                targetServer = parentItem.data.server;
                targetStack = parentItem.data.stack;
                parentPath = parentItem.data.fileEntry.path;
            } else if (parentItem.data.type === 'stack') {
                
                targetServer = parentItem.data.server;
                targetStack = parentItem.data.stack;
                parentPath = '';
            }
        }

        if (!targetServer || !targetStack) {
            vscode.window.showErrorMessage('Please select a stack or folder to upload files to');
            return;
        }

        
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        const defaultUri = homeDir ? vscode.Uri.file(homeDir) : undefined;

        const files = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            openLabel: 'Upload',
            defaultUri: defaultUri,
            title: 'Select local files to upload'
        });

        if (!files || files.length === 0) {
            return;
        }

        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            for (const fileUri of files) {
                const fileName = fileUri.path.split('/').pop() || 'unknown';
                const fileData = await vscode.workspace.fs.readFile(fileUri);

                const file = new File([fileData], fileName);

                await this.filesService.uploadFile(
                    targetServer.id,
                    targetStack.name,
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

    public async downloadFile(item: BerthTreeItemImpl): Promise<void> {
        if (!item?.data || item.data.type !== 'file' || item.data.fileEntry.isDirectory) {
            vscode.window.showErrorMessage('Please select a file to download');
            return;
        }

        const fileEntry = item.data.fileEntry;
        const server = item.data.server;
        const stack = item.data.stack;

        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            const saveUri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(fileEntry.name),
                saveLabel: 'Download'
            });

            if (!saveUri) {
                return;
            }

            const fileData = await this.filesService.downloadFile(
                server.id,
                stack.name,
                fileEntry.path,
                fileEntry.name
            );

            await vscode.workspace.fs.writeFile(saveUri, new Uint8Array(fileData));
            vscode.window.showInformationMessage(`File downloaded to ${saveUri.fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async chmodFile(item: BerthTreeItemImpl): Promise<void> {
        if (!item?.data || item.data.type !== 'file') {
            vscode.window.showErrorMessage('Please select a file or folder to change permissions');
            return;
        }

        const fileEntry = item.data.fileEntry;
        const server = item.data.server;
        const stack = item.data.stack;

        const currentMode = fileEntry.mode || '0644';
        
        const currentModeNumeric = currentMode.match(/^[d-][rwx-]{9}$/)
            ? BerthTreeItemImpl.convertSymbolicToNumeric(currentMode)
            : currentMode;

        const newMode = await vscode.window.showInputBox({
            prompt: `Enter new permissions for "${fileEntry.name}"`,
            placeHolder: 'e.g., 0755, 644, 755',
            value: currentModeNumeric,
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
        if (fileEntry.isDirectory) {
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

            await this.filesService.chmodFile(server.id, stack.name, {
                path: fileEntry.path,
                mode: newMode.startsWith('0') ? newMode : `0${newMode}`,
                recursive: recursive
            });

            this.refresh();
            vscode.window.showInformationMessage(
                `Permissions changed to ${newMode} for "${fileEntry.name}"${recursive ? ' (recursive)' : ''}`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to change permissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async chownFile(item: BerthTreeItemImpl): Promise<void> {
        if (!item?.data || item.data.type !== 'file') {
            vscode.window.showErrorMessage('Please select a file or folder to change ownership');
            return;
        }

        const fileEntry = item.data.fileEntry;
        const server = item.data.server;
        const stack = item.data.stack;

        const currentOwner = fileEntry.owner || `uid:${fileEntry.ownerId || 'unknown'}`;
        const currentGroup = fileEntry.group || `gid:${fileEntry.groupId || 'unknown'}`;

        const ownerInput = await vscode.window.showInputBox({
            prompt: `Enter new owner ID for "${fileEntry.name}" (leave empty to keep current: ${currentOwner})`,
            placeHolder: 'e.g., 1000',
            value: fileEntry.ownerId?.toString() || ''
        });

        if (ownerInput === undefined) {
            return;
        }

        const groupInput = await vscode.window.showInputBox({
            prompt: `Enter new group ID for "${fileEntry.name}" (leave empty to keep current: ${currentGroup})`,
            placeHolder: 'e.g., 100',
            value: fileEntry.groupId?.toString() || ''
        });

        if (groupInput === undefined) {
            return;
        }

        if (!ownerInput.trim() && !groupInput.trim()) {
            vscode.window.showInformationMessage('At least one of owner or group must be specified');
            return;
        }

        let recursive = false;
        if (fileEntry.isDirectory) {
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

            await this.filesService.chownFile(server.id, stack.name, {
                path: fileEntry.path,
                owner_id: ownerId,
                group_id: groupId,
                recursive: recursive
            });

            this.refresh();
            const changes = [];
            if (ownerId !== undefined) { changes.push(`owner: ${ownerId}`); }
            if (groupId !== undefined) { changes.push(`group: ${groupId}`); }

            vscode.window.showInformationMessage(
                `Ownership changed (${changes.join(', ')}) for "${fileEntry.name}"${recursive ? ' (recursive)' : ''}`
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to change ownership: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    getTreeItem(element: BerthTreeItemImpl): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: BerthTreeItemImpl): Promise<BerthTreeItemImpl[]> {
        if (!this.authService.isAuthenticated()) {
            return [];
        }

        if (!element) {
            return this.getServers();
        }

        if (element.data.type === 'server') {
            return this.getStacks(element.data.server);
        }

        if (element.data.type === 'stack') {
            return this.getFiles(element.data.server, element.data.stack);
        }

        if (element.data.type === 'file' && element.data.fileEntry.isDirectory) {
            return this.getFiles(element.data.server, element.data.stack, element.data.fileEntry.path);
        }

        return [];
    }

    private async getServers(): Promise<BerthTreeItemImpl[]> {
        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            const response = await this.apiClient.get('/api/v1/servers');
            if (!response.ok) {
                throw new Error(`Failed to fetch servers: ${response.status}`);
            }

            const responseData = await response.json() as any;
            let servers: Server[];
            if (Array.isArray(responseData)) {
                servers = responseData;
            } else {
                servers = responseData.servers || [];
            }

            return servers.map(server => new BerthTreeItemImpl(
                server.name,
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'server', server }
            ));
        } catch (error) {
            return [new BerthTreeItemImpl(
                `Error loading servers: ${error instanceof Error ? error.message : 'Unknown error'}`,
                vscode.TreeItemCollapsibleState.None,
                { type: 'server', server: { id: -1, name: 'Error', host: '', port: 0, status: 'error' } }
            )];
        }
    }

    private async getStacks(server: Server): Promise<BerthTreeItemImpl[]> {
        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            const response = await this.apiClient.get(`/api/v1/servers/${server.id}/stacks`);
            if (!response.ok) {
                throw new Error(`Failed to fetch stacks: ${response.status}`);
            }

            const responseData = await response.json() as any;
            let stacks: Stack[];
            if (Array.isArray(responseData)) {
                stacks = responseData;
            } else {
                stacks = responseData.stacks || [];
            }

            if (!stacks || stacks.length === 0) {
                return [new BerthTreeItemImpl(
                    'No stacks available',
                    vscode.TreeItemCollapsibleState.None,
                    { type: 'stack', server, stack: { name: 'none', status: 'none', serverId: server.id, services: [] } }
                )];
            }

            return stacks.map(stack => new BerthTreeItemImpl(
                stack.name,
                vscode.TreeItemCollapsibleState.Collapsed,
                { type: 'stack', server, stack }
            ));
        } catch (error) {
            return [new BerthTreeItemImpl(
                `Error loading stacks: ${error instanceof Error ? error.message : 'Unknown error'}`,
                vscode.TreeItemCollapsibleState.None,
                { type: 'stack', server, stack: { name: 'error', status: 'error', serverId: server.id, services: [] } }
            )];
        }
    }

    private async getFiles(server: Server, stack: Stack, path?: string): Promise<BerthTreeItemImpl[]> {
        try {
            const token = this.authService.getAccessToken();
            if (token) {
                this.apiClient.setAuthToken(token);
            }

            const listing = await this.filesService.listDirectory(server.id, stack.name, path);

            if (!listing || !listing.entries || listing.entries.length === 0) {
                return [];
            }

            const sortedEntries = listing.entries.sort((a, b) => {
                if (a.isDirectory && !b.isDirectory) {return -1;}
                if (!a.isDirectory && b.isDirectory) {return 1;}
                return a.name.localeCompare(b.name);
            });

            return sortedEntries.map(entry => {
                const collapsibleState = entry.isDirectory
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None;

                return new BerthTreeItemImpl(
                    entry.name,
                    collapsibleState,
                    { type: 'file', server, stack, fileEntry: entry }
                );
            });
        } catch (error) {
            return [new BerthTreeItemImpl(
                `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                vscode.TreeItemCollapsibleState.None,
                { type: 'file', server, stack, fileEntry: {
                    name: 'error', path: '', isDirectory: false, size: 0,
                    displaySize: '0 B', modTime: '', mode: '0000'
                } }
            )];
        }
    }
}