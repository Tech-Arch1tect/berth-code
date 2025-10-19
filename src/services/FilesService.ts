import { ApiClient } from "./ApiClient";
import {
  DirectoryListing,
  FileContent,
  WriteFileRequest,
  CreateDirectoryRequest,
  DeleteRequest,
  RenameRequest,
  CopyRequest,
  ChmodRequest,
  ChownRequest,
  DirectoryStats,
} from "../types";

export class FilesService {
  constructor(private apiClient: ApiClient) {}

  public async listDirectory(
    serverId: number,
    stackName: string,
    path?: string,
  ): Promise<DirectoryListing> {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : "";
    const response = await this.apiClient.get(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files${queryParam}`,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to list directory");
    }

    const rawData = (await response.json()) as any;

    if (!rawData) {
      return { path: "", entries: [] };
    }

    const transformedData: DirectoryListing = {
      path: rawData.path || "",
      entries: (rawData.entries || []).map((entry: any) => ({
        name: entry.name || "",
        path: entry.path || "",
        isDirectory: entry.is_directory === true,
        size: entry.size || 0,
        displaySize: this.formatFileSize(entry.size || 0),
        modTime: entry.mod_time || new Date().toISOString(),
        mode: entry.mode || "0644",
        ownerId: entry.owner_id,
        groupId: entry.group_id,
        owner: entry.owner,
        group: entry.group,
        extension:
          entry.name && entry.name.includes(".")
            ? entry.name.split(".").pop()
            : undefined,
      })),
    };

    return transformedData;
  }

  public async readFile(
    serverId: number,
    stackName: string,
    path: string,
  ): Promise<FileContent> {
    const response = await this.apiClient.get(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files/read?path=${encodeURIComponent(path)}`,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to read file");
    }

    return (await response.json()) as FileContent;
  }

  public async writeFile(
    serverId: number,
    stackName: string,
    request: WriteFileRequest,
  ): Promise<void> {
    const response = await this.apiClient.post(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files/write`,
      request,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to write file");
    }
  }

  public async createDirectory(
    serverId: number,
    stackName: string,
    request: CreateDirectoryRequest,
  ): Promise<void> {
    const response = await this.apiClient.post(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files/mkdir`,
      request,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to create directory");
    }
  }

  public async deleteFile(
    serverId: number,
    stackName: string,
    request: DeleteRequest,
  ): Promise<void> {
    const response = await this.apiClient.deleteWithBody(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files/delete`,
      request,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to delete");
    }
  }

  public async renameFile(
    serverId: number,
    stackName: string,
    request: RenameRequest,
  ): Promise<void> {
    const apiRequest = {
      old_path: request.oldPath,
      new_path: request.newPath,
    };

    const response = await this.apiClient.post(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files/rename`,
      apiRequest,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to rename");
    }
  }

  public async copyFile(
    serverId: number,
    stackName: string,
    request: CopyRequest,
  ): Promise<void> {
    const response = await this.apiClient.post(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files/copy`,
      request,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to copy");
    }
  }

  public async uploadFile(
    serverId: number,
    stackName: string,
    path: string,
    file: File,
    filename: string,
  ): Promise<void> {
    const fields: Record<string, string> = {};
    const filePath = path ? `${path}/${filename}` : filename;
    fields["path"] = filePath;

    const response = await this.apiClient.postMultipartWithFields(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files/upload`,
      file,
      "file",
      fields,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to upload file");
    }
  }

  public async downloadFile(
    serverId: number,
    stackName: string,
    path: string,
    filename?: string,
  ): Promise<ArrayBuffer> {
    const queryParams = new URLSearchParams({ path });
    if (filename) {
      queryParams.set("filename", filename);
    }

    const response = await this.apiClient.get(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files/download?${queryParams}`,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to download file");
    }

    return await response.arrayBuffer();
  }

  public async chmodFile(
    serverId: number,
    stackName: string,
    request: ChmodRequest,
  ): Promise<void> {
    const response = await this.apiClient.post(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files/chmod`,
      request,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to change permissions");
    }
  }

  public async chownFile(
    serverId: number,
    stackName: string,
    request: ChownRequest,
  ): Promise<void> {
    const response = await this.apiClient.post(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files/chown`,
      request,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to change ownership");
    }
  }

  public async getDirectoryStats(
    serverId: number,
    stackName: string,
    path?: string,
  ): Promise<DirectoryStats> {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : "";
    const response = await this.apiClient.get(
      `/api/v1/servers/${serverId}/stacks/${stackName}/files/stats${queryParam}`,
    );

    if (!response.ok) {
      await this.handleError(response, "Failed to get directory stats");
    }

    return (await response.json()) as DirectoryStats;
  }

  private async handleError(
    response: Response,
    defaultMessage: string,
  ): Promise<never> {
    let errorMessage = defaultMessage;

    try {
      const errorData = (await response.json()) as any;
      errorMessage = errorData.error || errorData.message || defaultMessage;
    } catch {}

    if (response.status === 401) {
      errorMessage = "Authentication failed";
    } else if (response.status === 403) {
      errorMessage = "Access denied - insufficient permissions";
    } else if (response.status === 404) {
      errorMessage = "Resource not found";
    }

    throw new Error(`${errorMessage}: ${response.status}`);
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) {
      return "0 B";
    }
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }
}
