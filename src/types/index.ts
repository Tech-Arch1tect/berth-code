export type { UserInfo, RoleInfo } from "berth-api-client/models";

import type { FileEntry as FileEntryType } from "../services/FilesService";
export type FileEntry = FileEntryType;

export type BerthTreeItem = ServerTreeItem | StackTreeItem | FileTreeItem;

export interface ServerTreeItem {
  type: "server";
  server: Server;
}

export interface StackTreeItem {
  type: "stack";
  server: Server;
  stack: Stack;
}

export interface FileTreeItem {
  type: "file";
  server: Server;
  stack: Stack;
  fileEntry: FileEntryType;
}

export interface Server {
  id: number;
  name: string;
  description?: string;
  host: string;
  port: number;
  status: string;
}

export interface Stack {
  name: string;
  status: string;
  serverId: number;
}
