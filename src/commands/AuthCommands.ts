import * as vscode from "vscode";
import { AuthService } from "../services/AuthService";
import { ApiClient } from "../services/ApiClient";
import { Server, Stack } from "../types";

interface TreeDataProvider {
  refresh(): void;
  getCurrentServer(): Server | null;
  getCurrentStack(): Stack | null;
  setCurrentServer(server: Server | null): void;
  setCurrentStack(stack: Stack | null): void;
}

export class AuthCommands {
  private authStateChangeCallback: (() => void) | null = null;

  constructor(
    private authService: AuthService,
    private apiClient: ApiClient,
    private treeDataProvider: TreeDataProvider,
  ) {}

  public setAuthStateChangeCallback(callback: () => void): void {
    this.authStateChangeCallback = callback;
  }

  public async login(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration("berth");
      const serverUrl = config.get<string>(
        "serverUrl",
        "https://localhost:8080",
      );

      const apiKey = await vscode.window.showInputBox({
        prompt: `Enter Berth API key for ${serverUrl}`,
        placeHolder: "brth_...",
        password: true,
        validateInput: (value) => {
          if (!value) {
            return "API key is required";
          }
          if (!value.startsWith("brth_")) {
            return 'API key should start with "brth_"';
          }
          return null;
        },
      });

      if (!apiKey) {
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Authenticating with Berth...",
          cancellable: false,
        },
        async () => {
          const result = await this.authService.setApiKey(apiKey);

          if (result.success) {
            const token = this.authService.getApiKey();
            if (token) {
              this.apiClient.setAuthToken(token);
            }

            vscode.window.showInformationMessage(
              "Successfully authenticated with Berth",
            );
            this.treeDataProvider.refresh();
            this.authStateChangeCallback?.();
          } else {
            vscode.window.showErrorMessage(
              `Authentication failed: ${result.message}`,
            );
          }
        },
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Authentication error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async logout(): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Logging out...",
          cancellable: false,
        },
        async () => {
          await this.authService.logout();
        },
      );

      this.apiClient.clearAuthToken();

      vscode.window.showInformationMessage(
        "Successfully logged out from Berth",
      );
      this.treeDataProvider.refresh();
      this.authStateChangeCallback?.();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Logout error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async selectServer(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      vscode.window.showErrorMessage("Please login first");
      return;
    }

    try {
      const apiKey = this.authService.getApiKey();
      if (apiKey) {
        this.apiClient.setAuthToken(apiKey);
      }

      const response = await this.apiClient.get("/api/v1/servers");
      if (!response.ok) {
        throw new Error(`Failed to fetch servers: ${response.status}`);
      }

      const responseData = (await response.json()) as any;

      let servers: Server[];
      if (Array.isArray(responseData)) {
        servers = responseData;
      } else {
        servers = responseData.servers || [];
      }

      if (servers.length === 0) {
        vscode.window.showInformationMessage("No servers available");
        return;
      }

      const serverItems = servers.map((server) => ({
        label: server.name,
        description: `${server.host}:${server.port}`,
        detail: server.description || "",
        server: server,
      }));

      const selected = await vscode.window.showQuickPick(serverItems, {
        placeHolder: "Select a server",
      });

      if (selected) {
        this.treeDataProvider.setCurrentServer(selected.server);
        this.treeDataProvider.setCurrentStack(null);
        vscode.window.showInformationMessage(
          `Selected server: ${selected.server.name}`,
        );
        this.treeDataProvider.refresh();
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to load servers: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async selectStack(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      vscode.window.showErrorMessage("Please login first");
      return;
    }

    const currentServer = this.treeDataProvider.getCurrentServer();
    if (!currentServer) {
      vscode.window.showErrorMessage("Please select a server first");
      return;
    }

    try {
      const apiKey = this.authService.getApiKey();
      if (apiKey) {
        this.apiClient.setAuthToken(apiKey);
      }

      const response = await this.apiClient.get(
        `/api/v1/servers/${currentServer.id}/stacks`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch stacks: ${response.status}`);
      }

      const responseData = (await response.json()) as any;

      let stacks: Stack[];
      if (Array.isArray(responseData)) {
        stacks = responseData;
      } else {
        stacks = responseData.stacks || [];
      }

      if (!stacks || stacks.length === 0) {
        vscode.window.showInformationMessage(
          "No stacks available on this server",
        );
        return;
      }

      const stackItems = stacks.map((stack) => ({
        label: stack.name,
        description: stack.status || "Unknown",
        detail: `${stack.services ? stack.services.length : 0} service(s)`,
        stack: stack,
      }));

      const selected = await vscode.window.showQuickPick(stackItems, {
        placeHolder: "Select a stack",
      });

      if (selected) {
        this.treeDataProvider.setCurrentStack(selected.stack);
        vscode.window.showInformationMessage(
          `Selected stack: ${selected.stack.name}`,
        );
        this.treeDataProvider.refresh();
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to load stacks: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async selectServerAndStack(): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      vscode.window.showErrorMessage("Please login first");
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Loading servers and stacks...",
        cancellable: false,
      },
      async (progress) => {
        try {
          const apiKey = this.authService.getApiKey();
          if (apiKey) {
            this.apiClient.setAuthToken(apiKey);
          }

          progress.report({ increment: 20, message: "Fetching servers..." });

          const serversResponse = await this.apiClient.get("/api/v1/servers");
          if (!serversResponse.ok) {
            throw new Error(
              `Failed to fetch servers: ${serversResponse.status}`,
            );
          }

          const serversData = (await serversResponse.json()) as any;
          let servers: Server[];
          if (Array.isArray(serversData)) {
            servers = serversData;
          } else {
            servers = serversData.servers || [];
          }

          if (servers.length === 0) {
            vscode.window.showInformationMessage("No servers available");
            return;
          }

          progress.report({ increment: 30, message: "Select server..." });

          const currentServer = this.treeDataProvider.getCurrentServer();
          const serverItems = servers.map((server) => ({
            label: server.name,
            description: `${server.host}:${server.port}`,
            detail: server.description || "",
            picked: currentServer?.id === server.id,
            server: server,
          }));

          const selectedServerItem = await vscode.window.showQuickPick(
            serverItems,
            {
              placeHolder: "Select a server",
              matchOnDescription: true,
              matchOnDetail: true,
            },
          );

          if (!selectedServerItem) {
            return;
          }

          progress.report({ increment: 20, message: "Fetching stacks..." });

          const stacksResponse = await this.apiClient.get(
            `/api/v1/servers/${selectedServerItem.server.id}/stacks`,
          );
          if (!stacksResponse.ok) {
            throw new Error(`Failed to fetch stacks: ${stacksResponse.status}`);
          }

          const stacksData = (await stacksResponse.json()) as any;
          let stacks: Stack[];
          if (Array.isArray(stacksData)) {
            stacks = stacksData;
          } else {
            stacks = stacksData.stacks || [];
          }

          if (!stacks || stacks.length === 0) {
            this.treeDataProvider.setCurrentServer(selectedServerItem.server);
            this.treeDataProvider.setCurrentStack(null);
            vscode.window.showInformationMessage(
              `Selected server: ${selectedServerItem.server.name} (no stacks available)`,
            );
            this.treeDataProvider.refresh();
            return;
          }

          progress.report({ increment: 20, message: "Select stack..." });

          const currentStack = this.treeDataProvider.getCurrentStack();
          const stackItems = stacks.map((stack) => ({
            label: stack.name,
            description: stack.status || "Unknown",
            detail: `${stack.services ? stack.services.length : 0} service(s)`,
            picked: currentStack?.name === stack.name,
            stack: stack,
          }));

          const selectedStackItem = await vscode.window.showQuickPick(
            stackItems,
            {
              placeHolder: `Select a stack on ${selectedServerItem.server.name}`,
              matchOnDescription: true,
            },
          );

          if (selectedStackItem) {
            progress.report({
              increment: 10,
              message: "Updating selection...",
            });

            this.treeDataProvider.setCurrentServer(selectedServerItem.server);
            this.treeDataProvider.setCurrentStack(selectedStackItem.stack);

            vscode.window.showInformationMessage(
              `Selected: ${selectedServerItem.server.name} / ${selectedStackItem.stack.name}`,
            );

            this.treeDataProvider.refresh();
          } else if (selectedServerItem.server.id !== currentServer?.id) {
            this.treeDataProvider.setCurrentServer(selectedServerItem.server);
            this.treeDataProvider.setCurrentStack(null);
            vscode.window.showInformationMessage(
              `Selected server: ${selectedServerItem.server.name}`,
            );
            this.treeDataProvider.refresh();
          }
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to load servers and stacks: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      },
    );
  }

  public async openFile(fileEntry: any): Promise<void> {
    const currentServer = this.treeDataProvider.getCurrentServer();
    const currentStack = this.treeDataProvider.getCurrentStack();

    if (!currentServer || !currentStack) {
      vscode.window.showErrorMessage("No server or stack selected");
      return;
    }

    if (fileEntry.isDirectory) {
      return;
    }

    try {
      const uri = vscode.Uri.parse(
        `berth://${currentServer.id}/${currentStack.name}/${fileEntry.path}`,
      );
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to open file: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  public async openStackInExplorer(
    server?: Server,
    stack?: Stack,
  ): Promise<void> {
    if (!this.authService.isAuthenticated()) {
      vscode.window.showErrorMessage("Please login first");
      return;
    }

    const targetServer = server || this.treeDataProvider.getCurrentServer();
    const targetStack = stack || this.treeDataProvider.getCurrentStack();

    if (!targetServer || !targetStack) {
      vscode.window.showErrorMessage("Please select a server and stack first");
      return;
    }

    try {
      const stackUri = vscode.Uri.parse(
        `berth://${targetServer.id}/${targetStack.name}`,
      );

      const workspaceFolder: vscode.WorkspaceFolder = {
        uri: stackUri,
        name: `${targetServer.name} - ${targetStack.name}`,
        index: vscode.workspace.workspaceFolders?.length || 0,
      };

      const existingFolder = vscode.workspace.workspaceFolders?.find(
        (f) => f.uri.toString() === stackUri.toString(),
      );

      if (existingFolder) {
        vscode.window.showInformationMessage(
          `Stack "${targetStack.name}" is already open in Explorer`,
        );
        await vscode.commands.executeCommand("workbench.view.explorer");
        return;
      }

      const insertIndex = vscode.workspace.workspaceFolders?.length || 0;

      const success = vscode.workspace.updateWorkspaceFolders(
        insertIndex,
        0,
        workspaceFolder,
      );

      if (success) {
        vscode.window.showInformationMessage(
          `Stack "${targetStack.name}" opened in Explorer`,
        );

        await vscode.commands.executeCommand("workbench.view.explorer");
      } else {
        vscode.window.showErrorMessage("Failed to open stack in Explorer");
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to open stack in Explorer: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}
