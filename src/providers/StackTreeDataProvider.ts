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
            this.tooltip = `${fileEntry.name}\nSize: ${fileEntry.displaySize}\nModified: ${fileEntry.modTime}\nPermissions: ${fileEntry.mode}`;
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

    public setCurrentStack(stack: Stack): void {
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
}