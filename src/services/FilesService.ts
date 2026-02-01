import {
  getApiV1ServersServeridStacksStacknameFiles,
  getApiV1ServersServeridStacksStacknameFilesRead,
  postApiV1ServersServeridStacksStacknameFilesWrite,
  postApiV1ServersServeridStacksStacknameFilesMkdir,
  deleteApiV1ServersServeridStacksStacknameFilesDelete,
  postApiV1ServersServeridStacksStacknameFilesRename,
  postApiV1ServersServeridStacksStacknameFilesCopy,
  postApiV1ServersServeridStacksStacknameFilesUpload,
  getApiV1ServersServeridStacksStacknameFilesDownload,
  postApiV1ServersServeridStacksStacknameFilesChmod,
  postApiV1ServersServeridStacksStacknameFilesChown,
  getApiV1ServersServeridStacksStacknameFilesStats,
} from "berth-api-client/files/files";
import type { FileEntry as ApiFileEntry } from "berth-api-client/models";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  displaySize: string;
  modTime: string;
  mode: string;
  ownerId?: number;
  groupId?: number;
  owner?: string;
  group?: string;
  extension?: string;
}

export interface DirectoryListing {
  path: string;
  entries: FileEntry[];
}

export interface FileContent {
  path: string;
  content: string;
  encoding: string;
  size: number;
}

export interface DirectoryStats {
  path: string;
  mostCommonMode: string;
  mostCommonOwner: number;
  mostCommonGroup: number;
  ownerName?: string;
  groupName?: string;
}

export class FilesService {
  public async listDirectory(
    serverId: number,
    stackName: string,
    path?: string,
  ): Promise<DirectoryListing> {
    const response = await getApiV1ServersServeridStacksStacknameFiles(
      serverId,
      stackName,
      path ? { filePath: path } : undefined,
    );

    const rawData = response.data.data;

    if (!rawData) {
      return { path: "", entries: [] };
    }

    return {
      path: rawData.path || "",
      entries: (rawData.entries || []).map((entry: ApiFileEntry) => ({
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
  }

  public async readFile(
    serverId: number,
    stackName: string,
    path: string,
  ): Promise<FileContent> {
    const response = await getApiV1ServersServeridStacksStacknameFilesRead(
      serverId,
      stackName,
      { filePath: path },
    );

    const data = response.data.data;
    return {
      path: data.path,
      content: data.content,
      encoding: data.encoding,
      size: data.size,
    };
  }

  public async writeFile(
    serverId: number,
    stackName: string,
    request: {
      path: string;
      content: string;
      mode?: string;
      owner_id?: number;
      group_id?: number;
    },
  ): Promise<void> {
    await postApiV1ServersServeridStacksStacknameFilesWrite(
      serverId,
      stackName,
      request,
    );
  }

  public async createDirectory(
    serverId: number,
    stackName: string,
    request: {
      path: string;
      mode?: string;
      owner_id?: number;
      group_id?: number;
    },
  ): Promise<void> {
    await postApiV1ServersServeridStacksStacknameFilesMkdir(
      serverId,
      stackName,
      request,
    );
  }

  public async deleteFile(
    serverId: number,
    stackName: string,
    request: { path: string },
  ): Promise<void> {
    await deleteApiV1ServersServeridStacksStacknameFilesDelete(
      serverId,
      stackName,
      request,
    );
  }

  public async renameFile(
    serverId: number,
    stackName: string,
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    await postApiV1ServersServeridStacksStacknameFilesRename(
      serverId,
      stackName,
      {
        old_path: oldPath,
        new_path: newPath,
      },
    );
  }

  public async copyFile(
    serverId: number,
    stackName: string,
    sourcePath: string,
    targetPath: string,
  ): Promise<void> {
    await postApiV1ServersServeridStacksStacknameFilesCopy(
      serverId,
      stackName,
      {
        source_path: sourcePath,
        target_path: targetPath,
      },
    );
  }

  public async uploadFile(
    serverId: number,
    stackName: string,
    path: string,
    file: Blob,
    filename: string,
  ): Promise<void> {
    const filePath = path ? `${path}/${filename}` : filename;
    await postApiV1ServersServeridStacksStacknameFilesUpload(
      serverId,
      stackName,
      {
        file,
        filePath,
      },
    );
  }

  public async downloadFile(
    serverId: number,
    stackName: string,
    path: string,
    filename?: string,
  ): Promise<Blob> {
    const response = await getApiV1ServersServeridStacksStacknameFilesDownload(
      serverId,
      stackName,
      { filePath: path, filename },
    );
    return response.data;
  }

  public async chmodFile(
    serverId: number,
    stackName: string,
    request: { path: string; mode: string; recursive: boolean },
  ): Promise<void> {
    await postApiV1ServersServeridStacksStacknameFilesChmod(
      serverId,
      stackName,
      request,
    );
  }

  public async chownFile(
    serverId: number,
    stackName: string,
    request: {
      path: string;
      owner_id?: number;
      group_id?: number;
      recursive: boolean;
    },
  ): Promise<void> {
    await postApiV1ServersServeridStacksStacknameFilesChown(
      serverId,
      stackName,
      request,
    );
  }

  public async getDirectoryStats(
    serverId: number,
    stackName: string,
    path?: string,
  ): Promise<DirectoryStats> {
    const response = await getApiV1ServersServeridStacksStacknameFilesStats(
      serverId,
      stackName,
      path ? { filePath: path } : undefined,
    );

    const data = response.data.data;
    return {
      path: data.path,
      mostCommonMode: data.most_common_mode,
      mostCommonOwner: data.most_common_owner,
      mostCommonGroup: data.most_common_group,
      ownerName: data.owner_name,
      groupName: data.group_name,
    };
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
