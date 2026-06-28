import * as vscode from "vscode";
import { setAuthToken, getAuthToken } from "../lib/api";
import { getApiV1Profile } from "berth-api-client/generated/profile/profile";
import type { UserInfo, UserIdentity } from "berth-api-client/generated/models";
import { isApiError } from "berth-api-client/client";
export type ProfileUser = UserInfo | UserIdentity;

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: ProfileUser;
}

export class AuthService {
  private static readonly API_KEY_STORAGE_KEY = "berth.apiKey";
  private static readonly USER_KEY = "berth.user";

  private currentUser: ProfileUser | null = null;
  private apiKey: string | null = null;

  constructor(
    private secretStorage: vscode.SecretStorage,
    private context: vscode.ExtensionContext,
  ) {}

  public getApiKey(): string | null {
    return this.apiKey;
  }

  public getCurrentUser(): ProfileUser | null {
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

      setAuthToken(this.apiKey);

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
      setAuthToken(this.apiKey);

      const response = await getApiV1Profile();
      this.currentUser = response.data;

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
    } catch (error: unknown) {
      this.apiKey = null;
      this.currentUser = null;
      setAuthToken(undefined);

      if (isApiError(error) && error.status === 401) {
        const data = error.data as { message?: string } | undefined;
        return {
          success: false,
          message:
            data?.message ||
            "Invalid API key. Please check your API key and try again.",
        };
      }

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
      setAuthToken(undefined);

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
      setAuthToken(undefined);
    }
  }

  public async checkAuthStatus(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        return false;
      }

      setAuthToken(this.apiKey);

      const response = await getApiV1Profile();
      this.currentUser = response.data;

      if (this.currentUser) {
        await this.saveUserToStorage(this.currentUser);
      }
      return true;
    } catch (error: unknown) {
      if (isApiError(error) && error.status === 401) {
        await this.logout();
        return false;
      }
      return false;
    }
  }

  private async saveApiKeyToStorage(apiKey: string): Promise<void> {
    await this.secretStorage.store(AuthService.API_KEY_STORAGE_KEY, apiKey);
  }

  private async clearApiKeyFromStorage(): Promise<void> {
    await this.secretStorage.delete(AuthService.API_KEY_STORAGE_KEY);
  }

  private async saveUserToStorage(user: ProfileUser): Promise<void> {
    await this.secretStorage.store(AuthService.USER_KEY, JSON.stringify(user));
  }

  private async removeUserFromStorage(): Promise<void> {
    await this.secretStorage.delete(AuthService.USER_KEY);
  }
}
