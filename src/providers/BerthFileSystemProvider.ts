import * as vscode from 'vscode';
import { ApiClient } from '../services/ApiClient';
import { FilesService } from '../services/FilesService';

export class BerthFileSystemProvider implements vscode.FileSystemProvider {
    private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    private filesService: FilesService;

    constructor(private apiClient: ApiClient) {
        this.filesService = new FilesService(apiClient);
    }

    get onDidChangeFile(): vscode.Event<vscode.FileChangeEvent[]> {
        return this._onDidChangeFile.event;
    }

    watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[]; }): vscode.Disposable {
        return new vscode.Disposable(() => {});
    }

    stat(uri: vscode.Uri): vscode.FileStat | Thenable<vscode.FileStat> {
        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: 0
        };
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        throw new Error('Not implemented');
    }

    createDirectory(uri: vscode.Uri): void | Thenable<void> {
        throw new Error('Not implemented');
    }

    delete(uri: vscode.Uri, options: { recursive: boolean; }): void | Thenable<void> {
        throw new Error('Not implemented');
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean; }): void | Thenable<void> {
        throw new Error('Not implemented');
    }

    readFile(uri: vscode.Uri): Uint8Array | Thenable<Uint8Array> {
        return this.readFileContent(uri);
    }

    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
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

            const fileContent = await this.filesService.readFile(serverId, stackName, filePath);
            return new TextEncoder().encode(fileContent.content);
        } catch (error) {
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

}