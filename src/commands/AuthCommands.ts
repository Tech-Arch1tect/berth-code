import * as vscode from 'vscode';
import { AuthService } from '../services/AuthService';
import { ApiClient } from '../services/ApiClient';
import { StackTreeDataProvider } from '../providers/StackTreeDataProvider';
import { Server, Stack } from '../types';

export class AuthCommands {
    constructor(
        private authService: AuthService,
        private apiClient: ApiClient,
        private treeDataProvider: StackTreeDataProvider
    ) {}

    public async login(): Promise<void> {
        try {
            
            const config = vscode.workspace.getConfiguration('berth');
            const serverUrl = config.get<string>('serverUrl', 'https://localhost:8080');

            const username = await vscode.window.showInputBox({
                prompt: `Enter username for ${serverUrl}`,
                placeHolder: 'username'
            });

            if (!username) {
                return;
            }

            const password = await vscode.window.showInputBox({
                prompt: 'Enter password',
                password: true
            });

            if (!password) {
                return;
            }

            
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Logging in to Berth...',
                cancellable: false
            }, async () => {
                const result = await this.authService.login(username, password);

                if (result.success) {
                    if (result.totpRequired && result.temporaryToken) {
                        
                        await this.handleTOTPVerification(result.temporaryToken);
                    } else {
                        const token = this.authService.getAccessToken();
                        if (token) {
                            this.apiClient.setAuthToken(token);
                        }

                        vscode.window.showInformationMessage('Successfully logged in to Berth');
                        this.treeDataProvider.refresh();
                    }
                } else {
                    vscode.window.showErrorMessage(`Login failed: ${result.message}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Login error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async handleTOTPVerification(temporaryToken: string): Promise<void> {
        const totpCode = await vscode.window.showInputBox({
            prompt: 'Enter your 6-digit TOTP code',
            placeHolder: '123456',
            validateInput: (value) => {
                if (!/^\d{6}$/.test(value)) {
                    return 'TOTP code must be 6 digits';
                }
                return null;
            }
        });

        if (!totpCode) {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Verifying TOTP code...',
            cancellable: false
        }, async () => {
            const result = await this.authService.verifyTOTP(temporaryToken, totpCode);

            if (result.success) {
                const token = this.authService.getAccessToken();
                if (token) {
                    this.apiClient.setAuthToken(token);
                }

                vscode.window.showInformationMessage('Successfully logged in to Berth');
                this.treeDataProvider.refresh();
            } else {
                vscode.window.showErrorMessage(`TOTP verification failed: ${result.message}`);
            }
        });
    }

    public async logout(): Promise<void> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Logging out...',
                cancellable: false
            }, async () => {
                await this.authService.logout();
            });

            this.apiClient.clearAuthToken();

            vscode.window.showInformationMessage('Successfully logged out from Berth');
            this.treeDataProvider.refresh();
        } catch (error) {
            vscode.window.showErrorMessage(`Logout error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async selectServer(): Promise<void> {
        if (!this.authService.isAuthenticated()) {
            vscode.window.showErrorMessage('Please login first');
            return;
        }

        try {
            
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

            if (servers.length === 0) {
                vscode.window.showInformationMessage('No servers available');
                return;
            }

            const serverItems = servers.map(server => ({
                label: server.name,
                description: `${server.host}:${server.port}`,
                detail: server.description || '',
                server: server
            }));

            const selected = await vscode.window.showQuickPick(serverItems, {
                placeHolder: 'Select a server'
            });

            if (selected) {
                this.treeDataProvider.setCurrentServer(selected.server);
                vscode.window.showInformationMessage(`Selected server: ${selected.server.name}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load servers: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async selectStack(): Promise<void> {
        if (!this.authService.isAuthenticated()) {
            vscode.window.showErrorMessage('Please login first');
            return;
        }

        const currentServer = this.treeDataProvider.getCurrentServer();
        if (!currentServer) {
            vscode.window.showErrorMessage('Please select a server first');
            return;
        }

        try {
            const response = await this.apiClient.get(`/api/v1/servers/${currentServer.id}/stacks`);

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
                vscode.window.showInformationMessage('No stacks available on this server');
                return;
            }

            const stackItems = stacks.map(stack => ({
                label: stack.name,
                description: stack.status || 'Unknown',
                detail: `${stack.services ? stack.services.length : 0} service(s)`,
                stack: stack
            }));

            const selected = await vscode.window.showQuickPick(stackItems, {
                placeHolder: 'Select a stack'
            });

            if (selected) {
                this.treeDataProvider.setCurrentStack(selected.stack);
                vscode.window.showInformationMessage(`Selected stack: ${selected.stack.name}`);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load stacks: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async openFile(fileEntry: any): Promise<void> {
        const currentServer = this.treeDataProvider.getCurrentServer();
        const currentStack = this.treeDataProvider.getCurrentStack();

        if (!currentServer || !currentStack) {
            vscode.window.showErrorMessage('No server or stack selected');
            return;
        }

        if (fileEntry.isDirectory) {
            return;
        }

        try {
            const uri = vscode.Uri.parse(`berth://${currentServer.id}/${currentStack.name}/${fileEntry.path}`);
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}