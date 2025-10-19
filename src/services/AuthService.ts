import * as vscode from "vscode";
import { ApiClient } from "./ApiClient";

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
}

export class AuthService {
  private static readonly API_KEY_STORAGE_KEY = "berth.apiKey";
  private static readonly USER_KEY = "berth.user";

  private currentUser: User | null = null;
  private apiKey: string | null = null;

  constructor(
    private secretStorage: vscode.SecretStorage,
    private context: vscode.ExtensionContext,
  ) {}

  public getApiKey(): string | null {
    return this.apiKey;
  }

  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return this.currentUser !== null && this.apiKey !== null;
  }

  public async initializeFromStorage(): Promise<boolean> {
    try {
      const apiKey = await this.secretStorage.get(
        AuthService.API_KEY_STORAGE_KEY,
      );
      const userJson = await this.secretStorage.get(AuthService.USER_KEY);

      if (!apiKey || !userJson) {
        return false;
      }

      this.apiKey = apiKey;
      this.currentUser = JSON.parse(userJson);

      await vscode.commands.executeCommand(
        "setContext",
        "berth.authenticated",
        true,
      );

      return true;
    } catch (error) {
      return false;
    }
  }

  public async setApiKey(apiKey: string): Promise<AuthResponse> {
    try {
      if (!apiKey.startsWith("brth_")) {
        return {
          success: false,
          message:
            'Invalid API key format. API keys should start with "brth_".',
        };
      }

      this.apiKey = apiKey;
      const apiClient = new ApiClient();
      apiClient.setAuthToken(this.apiKey);

      const response = await apiClient.get("/api/v1/profile");

      if (response.ok) {
        const data = (await response.json()) as any;
        this.currentUser = data;

        await this.saveApiKeyToStorage(this.apiKey);
        if (this.currentUser) {
          await this.saveUserToStorage(this.currentUser);
        }

        await vscode.commands.executeCommand(
          "setContext",
          "berth.authenticated",
          true,
        );

        return {
          success: true,
          message: "Authentication successful",
          user: this.currentUser || undefined,
        };
      } else {
        this.apiKey = null;
        this.currentUser = null;

        const errorData = (await response.json()) as any;
        return {
          success: false,
          message:
            errorData.message ||
            "Invalid API key. Please check your API key and try again.",
        };
      }
    } catch (error) {
      this.apiKey = null;
      this.currentUser = null;

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      return {
        success: false,
        message: `Network error: ${errorMessage}. Please check your connection and server URL.`,
      };
    }
  }

  public async logout(): Promise<void> {
    try {
      this.currentUser = null;
      this.apiKey = null;

      await this.clearApiKeyFromStorage();
      await this.removeUserFromStorage();

      await vscode.commands.executeCommand(
        "setContext",
        "berth.authenticated",
        false,
      );
    } catch (error) {
      this.currentUser = null;
      this.apiKey = null;
    }
  }

  public async checkAuthStatus(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        return false;
      }

      const apiClient = new ApiClient();
      apiClient.setAuthToken(this.apiKey);

      const response = await apiClient.get("/api/v1/profile");

      if (response.ok) {
        const data = (await response.json()) as any;
        this.currentUser = data;
        if (this.currentUser) {
          await this.saveUserToStorage(this.currentUser);
        }
        return true;
      } else if (response.status === 401) {
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

  private async saveApiKeyToStorage(apiKey: string): Promise<void> {
    await this.secretStorage.store(AuthService.API_KEY_STORAGE_KEY, apiKey);
  }

  private async clearApiKeyFromStorage(): Promise<void> {
    await this.secretStorage.delete(AuthService.API_KEY_STORAGE_KEY);
  }

  private async saveUserToStorage(user: User): Promise<void> {
    await this.secretStorage.store(AuthService.USER_KEY, JSON.stringify(user));
  }

  private async removeUserFromStorage(): Promise<void> {
    await this.secretStorage.delete(AuthService.USER_KEY);
  }
}
