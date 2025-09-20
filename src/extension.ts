import * as vscode from 'vscode';
import { AuthService } from './services/AuthService';
import { ApiClient } from './services/ApiClient';
import { StackTreeDataProvider } from './providers/StackTreeDataProvider';
import { BerthFileSystemProvider } from './providers/BerthFileSystemProvider';
import { AuthCommands } from './commands/AuthCommands';

export async function activate(context: vscode.ExtensionContext) {

    const apiClient = new ApiClient();
    const authService = new AuthService(context.secrets, context);
    const treeDataProvider = new StackTreeDataProvider(authService, apiClient);
    const fileSystemProvider = new BerthFileSystemProvider(apiClient);
    const authCommands = new AuthCommands(authService, apiClient, treeDataProvider);

    authService.setTokenRefreshCallback(() => authService.refreshAccessToken());
    apiClient.setTokenRefreshCallback(() => authService.refreshAccessToken());

    const syncTokenToApiClient = () => {
        const token = authService.getAccessToken();
        if (token) {
            apiClient.setAuthToken(token);
        } else {
            apiClient.clearAuthToken();
        }
    };

    const treeView = vscode.window.createTreeView('berthStackExplorer', {
        treeDataProvider: treeDataProvider,
        showCollapseAll: true
    });

    const fileSystemProviderDisposable = vscode.workspace.registerFileSystemProvider('berth', fileSystemProvider, { isCaseSensitive: true });

    const commands = [
        vscode.commands.registerCommand('berth.login', () => authCommands.login()),
        vscode.commands.registerCommand('berth.logout', () => authCommands.logout()),
        vscode.commands.registerCommand('berth.selectServer', () => authCommands.selectServer()),
        vscode.commands.registerCommand('berth.selectStack', () => authCommands.selectStack()),
        vscode.commands.registerCommand('berth.selectServerAndStack', () => authCommands.selectServerAndStack()),
        vscode.commands.registerCommand('berth.refreshStacks', () => treeDataProvider.refresh()),

        vscode.commands.registerCommand('berth.createFile', (item) => {
            if (item && item.fileEntry && item.fileEntry.isDirectory) {
                treeDataProvider.createFile(item);
            } else {
                treeDataProvider.createFile();
            }
        }),

        vscode.commands.registerCommand('berth.createFolder', (item) => {
            if (item && item.fileEntry && item.fileEntry.isDirectory) {
                treeDataProvider.createFolder(item);
            } else {
                treeDataProvider.createFolder();
            }
        }),

        vscode.commands.registerCommand('berth.deleteFile', (item) => {
            if (item) {
                treeDataProvider.deleteFile(item);
            }
        }),

        vscode.commands.registerCommand('berth.renameFile', (item) => {
            if (item) {
                treeDataProvider.renameFile(item);
            }
        }),

        vscode.commands.registerCommand('berth.uploadFile', (item) => {
            if (item && item.fileEntry && item.fileEntry.isDirectory) {
                treeDataProvider.uploadFile(item);
            } else {
                treeDataProvider.uploadFile();
            }
        }),

        vscode.commands.registerCommand('berth.downloadFile', (item) => {
            if (item) {
                treeDataProvider.downloadFile(item);
            }
        }),

        vscode.commands.registerCommand('berth.openFile', (fileEntry) => {
            authCommands.openFile(fileEntry);
        })
    ];


    const configChangeHandler = vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('berth.serverUrl') ||
            event.affectsConfiguration('berth.trustSelfSignedCertificates')) {
            const newApiClient = new ApiClient();
            if (authService.getAccessToken()) {
                newApiClient.setAuthToken(authService.getAccessToken()!);
            }
            vscode.window.showInformationMessage('Configuration updated. Please restart the extension for changes to take effect.');
        }
    });

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

    const updateStatusBar = () => {
        if (authService.isAuthenticated()) {
            const user = authService.getCurrentUser();
            const server = treeDataProvider.getCurrentServer();
            const stack = treeDataProvider.getCurrentStack();

            let statusText = `$(server) Berth: ${user?.username}`;
            if (server) {
                statusText += ` @ ${server.name}`;
            }
            if (stack) {
                statusText += ` / ${stack.name}`;
            }

            statusBarItem.text = statusText;
            statusBarItem.tooltip = server && stack
                ? `Connected to ${server.name} / ${stack.name} - Click to change server/stack`
                : server
                    ? `Connected to ${server.name} - Click to select server/stack`
                    : 'Connected to Berth - Click to select server/stack';
            statusBarItem.command = 'berth.selectServerAndStack';
        } else {
            statusBarItem.text = '$(server) Berth: Not connected';
            statusBarItem.tooltip = 'Click to login to Berth';
            statusBarItem.command = 'berth.login';
        }
        statusBarItem.show();
    };

    updateStatusBar();

    treeDataProvider.onDidChangeTreeData(() => {
        updateStatusBar();
    });

    const initializeAuth = async () => {
        const isAuthenticated = await authService.initializeFromStorage();

        if (isAuthenticated) {
            syncTokenToApiClient();
            const isValid = await authService.checkAuthStatus();

            if (isValid) {
                treeDataProvider.refresh();
                updateStatusBar();
            }
        }
    };

    initializeAuth();

    context.subscriptions.push(
        treeView,
        fileSystemProviderDisposable,
        configChangeHandler,
        statusBarItem,
        ...commands
    );

}

export function deactivate() {

}
