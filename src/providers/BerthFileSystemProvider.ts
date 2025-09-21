import * as vscode from 'vscode';
import { ApiClient } from '../services/ApiClient';
import { FilesService } from '../services/FilesService';

export class BerthFileSystemProvider implements vscode.FileSystemProvider {
    private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    private filesService: FilesService;

    constructor(private apiClient: ApiClient) {
        this.filesService = new FilesService(apiClient);
    }

    private isAuthenticated(): boolean {
        return this.apiClient.getAuthToken() !== null;
    }

    public refresh(): void {
        this._onDidChangeFile.fire([]);
    }

    get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
        return this._onDidChangeFile.event;
    }

    watch(): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
        if (!this.isAuthenticated()) {
            throw vscode.FileSystemError.Unavailable('Not authenticated to Berth server');
        }
        return this.getFileStat(uri);
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        if (!this.isAuthenticated()) {
            throw vscode.FileSystemError.Unavailable('Not authenticated to Berth server');
        }
        return this.readDirectoryContents(uri);
    }

    createDirectory(uri: vscode.Uri): void | Thenable<void> {
        if (!this.isAuthenticated()) {
            throw vscode.FileSystemError.Unavailable('Not authenticated to Berth server');
        }
        return this.createDirectoryAtPath(uri);
    }

    delete(uri: vscode.Uri): void | Thenable<void> {
        if (!this.isAuthenticated()) {
            throw vscode.FileSystemError.Unavailable('Not authenticated to Berth server');
        }
        return this.deleteAtPath(uri);
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri): void | Thenable<void> {
        if (!this.isAuthenticated()) {
            throw vscode.FileSystemError.Unavailable('Not authenticated to Berth server');
        }
        return this.renameAtPath(oldUri, newUri);
    }

    readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
        if (!this.isAuthenticated()) {
            throw vscode.FileSystemError.Unavailable('Not authenticated to Berth server');
        }
        return this.readFileContent(uri);
    }

    writeFile(uri: vscode.Uri, content: Uint8Array): void | Thenable<void> {
        if (!this.isAuthenticated()) {
            throw vscode.FileSystemError.Unavailable('Not authenticated to Berth server');
        }
        return this.writeFileContent(uri, content);
    }

    private async readFileContent(uri: vscode.Uri): Promise<Uint8Array> {
        try {
            const pathParts = uri.path.split('/').filter(part => part.length > 0);

            if (pathParts.length < 2) {
                throw new Error('Invalid berth URI format');
            }

            const serverId = parseInt(uri.authority);
            const stackName = pathParts[0];
            const filePath = pathParts.slice(1).join('/');

            if (isNaN(serverId)) {
                throw new Error('Invalid server ID in URI');
            }

            const stat = await this.getFileStat(uri);
            if (stat.type === vscode.FileType.Directory) {
                throw vscode.FileSystemError.FileIsADirectory(uri);
            }

            const fileContent = await this.filesService.readFile(serverId, stackName, filePath);
            return new TextEncoder().encode(fileContent.content);
        } catch (error) {
            if (error instanceof vscode.FileSystemError) {
                throw error;
            }
            throw new Error(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async writeFileContent(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        try {
            const pathParts = uri.path.split('/').filter(part => part.length > 0);

            if (pathParts.length < 2) {
                throw new Error('Invalid berth URI format');
            }

            const serverId = parseInt(uri.authority);
            const stackName = pathParts[0];
            const filePath = pathParts.slice(1).join('/');

            if (isNaN(serverId)) {
                throw new Error('Invalid server ID in URI');
            }

            const contentStr = new TextDecoder().decode(content);
            await this.filesService.writeFile(serverId, stackName, {
                path: filePath,
                content: contentStr
            });

            this._onDidChangeFile.fire([{
                type: vscode.FileChangeType.Changed,
                uri: uri
            }]);
        } catch (error) {
            throw new Error(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async getFileStat(uri: vscode.Uri): Promise<vscode.FileStat> {
        try {
            const pathParts = uri.path.split('/').filter(part => part.length > 0);

            if (pathParts.length < 1) {
                throw new Error('Invalid berth URI format');
            }

            const serverId = parseInt(uri.authority);
            const stackName = pathParts[0];

            if (isNaN(serverId)) {
                throw new Error('Invalid server ID in URI');
            }

            if (pathParts.length === 1) {
                return {
                    type: vscode.FileType.Directory,
                    ctime: Date.now(),
                    mtime: Date.now(),
                    size: 0
                };
            }

            const parentPath = pathParts.slice(1, -1).join('/');
            const fileName = pathParts[pathParts.length - 1];

            const listing = await this.filesService.listDirectory(serverId, stackName, parentPath || undefined);

            const entry = listing.entries.find(e => e.name === fileName);
            if (entry) {
                return {
                    type: entry.isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
                    ctime: new Date(entry.modTime).getTime(),
                    mtime: new Date(entry.modTime).getTime(),
                    size: entry.size
                };
            }

            throw new Error('File not found');
        } catch (error) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
    }

    private async readDirectoryContents(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        try {
            const pathParts = uri.path.split('/').filter(part => part.length > 0);

            if (pathParts.length < 1) {
                throw new Error('Invalid berth URI format');
            }

            const serverId = parseInt(uri.authority);
            const stackName = pathParts[0];
            const dirPath = pathParts.slice(1).join('/');

            if (isNaN(serverId)) {
                throw new Error('Invalid server ID in URI');
            }

            const listing = await this.filesService.listDirectory(serverId, stackName, dirPath || undefined);

            return listing.entries.map(entry => [
                entry.name,
                entry.isDirectory ? vscode.FileType.Directory : vscode.FileType.File
            ]);
        } catch (error) {
            throw new Error(`Failed to read directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async createDirectoryAtPath(uri: vscode.Uri): Promise<void> {
        try {
            const pathParts = uri.path.split('/').filter(part => part.length > 0);

            if (pathParts.length < 2) {
                throw new Error('Invalid berth URI format');
            }

            const serverId = parseInt(uri.authority);
            const stackName = pathParts[0];
            const dirPath = pathParts.slice(1).join('/');

            if (isNaN(serverId)) {
                throw new Error('Invalid server ID in URI');
            }

            await this.filesService.createDirectory(serverId, stackName, {
                path: dirPath
            });

            this._onDidChangeFile.fire([{
                type: vscode.FileChangeType.Created,
                uri: uri
            }]);
        } catch (error) {
            throw new Error(`Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async deleteAtPath(uri: vscode.Uri): Promise<void> {
        try {
            const pathParts = uri.path.split('/').filter(part => part.length > 0);

            if (pathParts.length < 2) {
                throw new Error('Invalid berth URI format');
            }

            const serverId = parseInt(uri.authority);
            const stackName = pathParts[0];
            const filePath = pathParts.slice(1).join('/');

            if (isNaN(serverId)) {
                throw new Error('Invalid server ID in URI');
            }

            await this.filesService.deleteFile(serverId, stackName, {
                path: filePath
            });

            this._onDidChangeFile.fire([{
                type: vscode.FileChangeType.Deleted,
                uri: uri
            }]);
        } catch (error) {
            throw new Error(`Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async renameAtPath(oldUri: vscode.Uri, newUri: vscode.Uri): Promise<void> {
        try {
            const oldPathParts = oldUri.path.split('/').filter(part => part.length > 0);
            const newPathParts = newUri.path.split('/').filter(part => part.length > 0);

            if (oldPathParts.length < 2 || newPathParts.length < 2) {
                throw new Error('Invalid berth URI format');
            }

            const serverId = parseInt(oldUri.authority);
            const stackName = oldPathParts[0];
            const oldPath = oldPathParts.slice(1).join('/');
            const newPath = newPathParts.slice(1).join('/');

            if (isNaN(serverId)) {
                throw new Error('Invalid server ID in URI');
            }

            
            if (oldUri.authority !== newUri.authority || oldPathParts[0] !== newPathParts[0]) {
                throw new Error('Cannot move files between different servers or stacks');
            }

            if (!oldPath || !newPath) {
                throw new Error('Invalid file paths for rename operation');
            }

            const renameRequest = {
                oldPath: oldPath,
                newPath: newPath
            };

            await this.filesService.renameFile(serverId, stackName, renameRequest);

            this._onDidChangeFile.fire([
                {
                    type: vscode.FileChangeType.Deleted,
                    uri: oldUri
                },
                {
                    type: vscode.FileChangeType.Created,
                    uri: newUri
                }
            ]);
        } catch (error) {
            throw new Error(`Failed to rename/move: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

}