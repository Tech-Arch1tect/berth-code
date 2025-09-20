import * as vscode from 'vscode';
import { ApiClient } from './ApiClient';

export interface User {
    id: number;
    username: string;
    email: string;
    firstName?: string;
    lastName?: string;
    totpEnabled: boolean;
    emailVerified: boolean;
    permissions: string[];
}

export interface AuthResponse {
    success: boolean;
    message: string;
    user?: User;
    totpRequired?: boolean;
    temporaryToken?: string;
}

export class AuthService {
    private static readonly ACCESS_TOKEN_KEY = 'berth.accessToken';
    private static readonly REFRESH_TOKEN_KEY = 'berth.refreshToken';
    private static readonly USER_KEY = 'berth.user';

    private currentUser: User | null = null;
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private tokenRefreshCallback: (() => Promise<boolean>) | null = null;

    constructor(
        private secretStorage: vscode.SecretStorage,
        private context: vscode.ExtensionContext
    ) {}

    public setTokenRefreshCallback(callback: () => Promise<boolean>): void {
        this.tokenRefreshCallback = callback;
    }

    public getAccessToken(): string | null {
        return this.accessToken;
    }

    public getCurrentUser(): User | null {
        return this.currentUser;
    }

    public isAuthenticated(): boolean {
        return this.currentUser !== null && this.accessToken !== null;
    }

    public async initializeFromStorage(): Promise<boolean> {
        try {
            const accessToken = await this.secretStorage.get(AuthService.ACCESS_TOKEN_KEY);
            const refreshToken = await this.secretStorage.get(AuthService.REFRESH_TOKEN_KEY);
            const userJson = await this.secretStorage.get(AuthService.USER_KEY);

            if (!accessToken || !refreshToken || !userJson) {
                return false;
            }

            this.accessToken = accessToken;
            this.refreshToken = refreshToken;
            this.currentUser = JSON.parse(userJson);

            await vscode.commands.executeCommand('setContext', 'berth.authenticated', true);

            return true;
        } catch (error) {
            console.error('Failed to initialize from storage:', error);
            return false;
        }
    }

    public async login(username: string, password: string): Promise<AuthResponse> {
        try {
            const apiClient = new ApiClient();

            const response = await apiClient.post('/api/v1/auth/login', {
                username,
                password
            });

            if (response.ok) {
                const data = await response.json() as any;

                if (data.totp_required === true) {
                    return {
                        success: true,
                        message: data.message || 'Two-factor authentication required',
                        totpRequired: true,
                        temporaryToken: data.temporary_token
                    };
                }

                this.accessToken = data.access_token;
                this.refreshToken = data.refresh_token;

                if (data.user) {
                    this.currentUser = data.user;

                    if (this.accessToken && this.refreshToken) {
                        if (this.accessToken && this.refreshToken) {
                    await this.saveTokensToStorage(this.accessToken, this.refreshToken);
                }
                    }
                    if (this.currentUser) {
                        await this.saveUserToStorage(this.currentUser);
                    }

                    await vscode.commands.executeCommand('setContext', 'berth.authenticated', true);

                    return {
                        success: true,
                        message: 'Login successful',
                        user: this.currentUser || undefined
                    };
                } else {
                    return {
                        success: false,
                        message: 'Login failed - invalid response format'
                    };
                }
            } else {
                const errorData = await response.json() as any;
                return {
                    success: false,
                    message: errorData.message || 'Login failed. Please try again.'
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                message: `Network error: ${errorMessage}. Please check your connection and server URL.`
            };
        }
    }

    public async verifyTOTP(temporaryToken: string, code: string): Promise<AuthResponse> {
        try {
            const apiClient = new ApiClient();

            const response = await apiClient.post('/api/v1/auth/totp/verify',
                { code },
                { 'Authorization': `Bearer ${temporaryToken}` }
            );

            if (response.ok) {
                const data = await response.json() as any;

                this.accessToken = data.access_token;
                this.refreshToken = data.refresh_token;

                if (data.user) {
                    this.currentUser = data.user;

                    if (this.accessToken && this.refreshToken) {
                        if (this.accessToken && this.refreshToken) {
                    await this.saveTokensToStorage(this.accessToken, this.refreshToken);
                }
                    }
                    if (this.currentUser) {
                        await this.saveUserToStorage(this.currentUser);
                    }

                    
                    await vscode.commands.executeCommand('setContext', 'berth.authenticated', true);

                    return {
                        success: true,
                        message: 'Two-factor authentication successful',
                        user: this.currentUser || undefined
                    };
                } else {
                    return {
                        success: false,
                        message: 'TOTP verification failed - invalid response format'
                    };
                }
            } else {
                const errorData = await response.json() as any;
                return {
                    success: false,
                    message: errorData.message || 'Invalid TOTP code'
                };
            }
        } catch (error) {
            return {
                success: false,
                message: 'Network error. Please check your connection.'
            };
        }
    }

    public async logout(): Promise<void> {
        try {
            if (this.accessToken && this.refreshToken) {
                const apiClient = new ApiClient();
                await apiClient.post('/api/v1/auth/logout', {
                    refresh_token: this.refreshToken
                });
            }
        } catch (error) {
            
        } finally {
            this.currentUser = null;
            this.accessToken = null;
            this.refreshToken = null;

            await this.clearTokensFromStorage();
            await this.removeUserFromStorage();

            
            await vscode.commands.executeCommand('setContext', 'berth.authenticated', false);
        }
    }

    public async refreshAccessToken(): Promise<boolean> {
        if (!this.refreshToken) {
            return false;
        }

        try {
            const apiClient = new ApiClient();

            const response = await apiClient.post('/api/v1/auth/refresh', {
                refresh_token: this.refreshToken
            });

            if (response.ok) {
                const data = await response.json() as any;
                this.accessToken = data.access_token;
                this.refreshToken = data.refresh_token;

                if (this.accessToken && this.refreshToken) {
                    await this.saveTokensToStorage(this.accessToken, this.refreshToken);
                }

                return true;
            } else {
                return false;
            }
        } catch (error) {
            return false;
        }
    }

    public async checkAuthStatus(): Promise<boolean> {
        try {
            if (!this.accessToken) {
                return false;
            }

            const apiClient = new ApiClient();

            const response = await apiClient.get('/api/v1/profile');

            if (response.ok) {
                const data = await response.json() as any;
                this.currentUser = data;
                await this.saveUserToStorage(this.currentUser!);
                return true;
            } else if (response.status === 401) {
                const refreshResult = await this.refreshAccessToken();
                if (refreshResult) {
                    const retryResponse = await apiClient.get('/api/v1/profile');
                    if (retryResponse.ok) {
                        const data = await retryResponse.json() as any;
                        this.currentUser = data;
                        if (this.currentUser) {
                        await this.saveUserToStorage(this.currentUser);
                    }
                        return true;
                    }
                }

                await this.logout();
                return false;
            } else {
                await this.logout();
                return false;
            }
        } catch (error) {
            await this.logout();
            return false;
        }
    }

    private async saveTokensToStorage(accessToken: string, refreshToken: string): Promise<void> {
        await this.secretStorage.store(AuthService.ACCESS_TOKEN_KEY, accessToken);
        await this.secretStorage.store(AuthService.REFRESH_TOKEN_KEY, refreshToken);
    }

    private async clearTokensFromStorage(): Promise<void> {
        await this.secretStorage.delete(AuthService.ACCESS_TOKEN_KEY);
        await this.secretStorage.delete(AuthService.REFRESH_TOKEN_KEY);
    }

    private async saveUserToStorage(user: User): Promise<void> {
        await this.secretStorage.store(AuthService.USER_KEY, JSON.stringify(user));
    }

    private async removeUserFromStorage(): Promise<void> {
        await this.secretStorage.delete(AuthService.USER_KEY);
    }
}