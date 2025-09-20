import * as vscode from 'vscode';

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

export interface WriteFileRequest {
    path: string;
    content: string;
    mode?: string;
    ownerId?: number;
    groupId?: number;
}

export interface CreateDirectoryRequest {
    path: string;
    mode?: string;
    ownerId?: number;
    groupId?: number;
}

export interface DeleteRequest {
    path: string;
}

export interface RenameRequest {
    oldPath: string;
    newPath: string;
}

export interface CopyRequest {
    sourcePath: string;
    targetPath: string;
}

export interface ChmodRequest {
    path: string;
    mode: string;
    recursive: boolean;
}

export interface ChownRequest {
    path: string;
    owner_id?: number;
    group_id?: number;
    recursive: boolean;
}

export interface DirectoryStats {
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
    mostCommonMode?: string;
    mostCommonOwner?: number;
    mostCommonGroup?: number;
}

export type BerthTreeItem = ServerTreeItem | StackTreeItem | FileTreeItem;

export interface ServerTreeItem {
    type: 'server';
    server: Server;
}

export interface StackTreeItem {
    type: 'stack';
    server: Server;
    stack: Stack;
}

export interface FileTreeItem {
    type: 'file';
    server: Server;
    stack: Stack;
    fileEntry: FileEntry;
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
    services: Service[];
}

export interface Service {
    name: string;
    status: string;
    image: string;
    ports: string[];
}


export interface BerthConfig {
    serverUrl: string;
    currentServer?: Server;
    currentStack?: Stack;
}