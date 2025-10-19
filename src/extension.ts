import * as vscode from "vscode";
import { AuthService } from "./services/AuthService";
import { ApiClient } from "./services/ApiClient";
import { FilesService } from "./services/FilesService";
import { BerthTreeDataProvider } from "./providers/BerthTreeDataProvider";
import { BerthFileSystemProvider } from "./providers/BerthFileSystemProvider";
import { BerthFileDecorationProvider } from "./providers/BerthFileDecorationProvider";
import { AuthCommands } from "./commands/AuthCommands";

export async function activate(context: vscode.ExtensionContext) {
  const apiClient = new ApiClient();
  const authService = new AuthService(context.secrets, context);
  const treeDataProvider = new BerthTreeDataProvider(authService, apiClient);
  const fileSystemProvider = new BerthFileSystemProvider(apiClient);
  const authCommands = new AuthCommands(
    authService,
    apiClient,
    treeDataProvider,
  );

  const syncApiKeyToApiClient = () => {
    const apiKey = authService.getApiKey();
    if (apiKey) {
      apiClient.setAuthToken(apiKey);
    } else {
      apiClient.clearAuthToken();
    }
    fileSystemProvider.refresh();
  };

  authCommands.setAuthStateChangeCallback(syncApiKeyToApiClient);

  const treeView = vscode.window.createTreeView("berthServers", {
    treeDataProvider: treeDataProvider,
    showCollapseAll: true,
  });

  const fileSystemProviderDisposable =
    vscode.workspace.registerFileSystemProvider("berth", fileSystemProvider, {
      isCaseSensitive: true,
    });

  async function handleExplorerCommand(
    command: string,
    uri: vscode.Uri,
  ): Promise<void> {
    try {
      const pathParts = uri.path.split("/").filter((p) => p);

      if (pathParts.length < 1) {
        vscode.window.showErrorMessage("Invalid berth URI format");
        return;
      }

      const serverId = parseInt(uri.authority);
      const stackName = pathParts[0];
      const filePath = pathParts.slice(1).join("/");

      let isDirectory = false;
      let fileStats = null;
      try {
        fileStats = await vscode.workspace.fs.stat(uri);
        isDirectory = (fileStats.type & vscode.FileType.Directory) !== 0;
      } catch (error) {
        isDirectory = false;
      }

      let realFileEntry = null;
      if (
        command === "chmodFile" ||
        command === "chownFile" ||
        command === "deleteFile" ||
        command === "renameFile"
      ) {
        try {
          const filesService = new FilesService(apiClient);

          const apiKey = authService.getApiKey();
          if (apiKey) {
            apiClient.setAuthToken(apiKey);
          }

          const parentPath = filePath.split("/").slice(0, -1).join("/");
          const fileName = uri.path.split("/").pop() || "";

          const listing = await filesService.listDirectory(
            serverId,
            stackName,
            parentPath || undefined,
          );

          if (listing && listing.entries) {
            realFileEntry = listing.entries.find(
              (entry) => entry.name === fileName,
            );
          }
        } catch (error) {}
      }

      const mockTreeItem = {
        data: {
          type: "file" as const,
          server: {
            id: serverId,
            name: "Unknown",
            host: "",
            port: 0,
            status: "",
          },
          stack: {
            name: stackName,
            status: "",
            serverId: serverId,
            services: [],
          },
          fileEntry: realFileEntry || {
            name: uri.path.split("/").pop() || "",
            path: filePath,
            isDirectory: isDirectory,
            size: fileStats?.size || 0,
            displaySize: fileStats?.size ? `${fileStats.size} B` : "0 B",
            modTime: fileStats?.mtime
              ? new Date(fileStats.mtime).toISOString()
              : "",
            mode: "0644",
          },
        },
      };

      switch (command) {
        case "createFile":
          await treeDataProvider.createFile(mockTreeItem as any);
          break;
        case "createFolder":
          await treeDataProvider.createFolder(mockTreeItem as any);
          break;
        case "deleteFile":
          await treeDataProvider.deleteFile(mockTreeItem as any);
          break;
        case "renameFile":
          await treeDataProvider.renameFile(mockTreeItem as any);
          break;
        case "uploadFile":
          await treeDataProvider.uploadFile(mockTreeItem as any);
          break;
        case "downloadFile":
          await treeDataProvider.downloadFile(mockTreeItem as any);
          break;
        case "chmodFile":
          await treeDataProvider.chmodFile(mockTreeItem as any);
          break;
        case "chownFile":
          await treeDataProvider.chownFile(mockTreeItem as any);
          break;
        default:
          vscode.window.showErrorMessage(`Unknown command: ${command}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Error executing ${command}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  const commands = [
    vscode.commands.registerCommand("berth.login", () => authCommands.login()),
    vscode.commands.registerCommand("berth.logout", () =>
      authCommands.logout(),
    ),
    vscode.commands.registerCommand("berth.refreshStacks", () =>
      treeDataProvider.refresh(),
    ),

    vscode.commands.registerCommand("berth.createFile", async (item) => {
      if (item instanceof vscode.Uri) {
        await handleExplorerCommand("createFile", item);
      } else if (item && item.fileEntry && item.fileEntry.isDirectory) {
        await treeDataProvider.createFile(item);
      } else {
        await treeDataProvider.createFile();
      }
    }),

    vscode.commands.registerCommand("berth.createFolder", async (item) => {
      if (item instanceof vscode.Uri) {
        await handleExplorerCommand("createFolder", item);
      } else if (item && item.fileEntry && item.fileEntry.isDirectory) {
        await treeDataProvider.createFolder(item);
      } else {
        await treeDataProvider.createFolder();
      }
    }),

    vscode.commands.registerCommand("berth.deleteFile", async (item) => {
      if (item instanceof vscode.Uri) {
        await handleExplorerCommand("deleteFile", item);
      } else if (item) {
        await treeDataProvider.deleteFile(item);
      }
    }),

    vscode.commands.registerCommand("berth.renameFile", async (item) => {
      if (item instanceof vscode.Uri) {
        await handleExplorerCommand("renameFile", item);
      } else if (item) {
        await treeDataProvider.renameFile(item);
      }
    }),

    vscode.commands.registerCommand("berth.uploadFile", async (item) => {
      if (item instanceof vscode.Uri) {
        await handleExplorerCommand("uploadFile", item);
      } else if (item && item.fileEntry && item.fileEntry.isDirectory) {
        await treeDataProvider.uploadFile(item);
      } else {
        await treeDataProvider.uploadFile();
      }
    }),

    vscode.commands.registerCommand("berth.downloadFile", async (item) => {
      if (item instanceof vscode.Uri) {
        await handleExplorerCommand("downloadFile", item);
      } else if (item) {
        await treeDataProvider.downloadFile(item);
      }
    }),

    vscode.commands.registerCommand("berth.openFile", (fileEntry) => {
      authCommands.openFile(fileEntry);
    }),

    vscode.commands.registerCommand("berth.chmodFile", async (item) => {
      if (item instanceof vscode.Uri) {
        await handleExplorerCommand("chmodFile", item);
      } else if (item) {
        await treeDataProvider.chmodFile(item);
      }
    }),

    vscode.commands.registerCommand("berth.chownFile", async (item) => {
      if (item instanceof vscode.Uri) {
        await handleExplorerCommand("chownFile", item);
      } else if (item) {
        await treeDataProvider.chownFile(item);
      }
    }),

    vscode.commands.registerCommand(
      "berth.openStackInExplorer",
      (server, stack) => {
        authCommands.openStackInExplorer(server, stack);
      },
    ),
  ];

  const fileDecorationProvider = new BerthFileDecorationProvider(apiClient);
  const fileDecorationProviderDisposable =
    vscode.window.registerFileDecorationProvider(fileDecorationProvider);
  context.subscriptions.push(fileDecorationProviderDisposable);

  const configChangeHandler = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (
        event.affectsConfiguration("berth.serverUrl") ||
        event.affectsConfiguration("berth.trustSelfSignedCertificates")
      ) {
        const newApiClient = new ApiClient();
        if (authService.getApiKey()) {
          newApiClient.setAuthToken(authService.getApiKey()!);
        }
        vscode.window.showInformationMessage(
          "Configuration updated. Please restart the extension for changes to take effect.",
        );
      }
    },
  );

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );

  const updateStatusBar = () => {
    if (authService.isAuthenticated()) {
      const user = authService.getCurrentUser();

      let statusText = `$(server) Berth: ${user?.username}`;
      statusBarItem.text = statusText;
      statusBarItem.tooltip =
        "Connected to Berth - Browse servers and stacks in the Berth panel";
      statusBarItem.command = "workbench.view.extension.berth";
    } else {
      statusBarItem.text = "$(server) Berth: Not connected";
      statusBarItem.tooltip = "Click to login to Berth";
      statusBarItem.command = "berth.login";
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
      syncApiKeyToApiClient();
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
    ...commands,
  );
}

export function deactivate() {}
