import * as vscode from "vscode";
import { FilesService } from "../services/FilesService";

export class BerthFileDecorationProvider
  implements vscode.FileDecorationProvider
{
  private _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[]
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  private filesService: FilesService;

  constructor() {
    this.filesService = new FilesService();
  }

  async provideFileDecoration(
    uri: vscode.Uri,
  ): Promise<vscode.FileDecoration | null> {
    if (uri.scheme !== "berth") {
      return null;
    }

    try {
      const pathParts = uri.path.split("/").filter((part) => part.length > 0);

      if (pathParts.length < 2) {
        return null;
      }

      const serverId = parseInt(uri.authority);
      const stackName = pathParts[0];
      const filePath = pathParts.slice(1).join("/");

      if (isNaN(serverId)) {
        return null;
      }

      const tooltip = await this.getRichTooltip(serverId, stackName, filePath);

      return {
        tooltip: tooltip,
        propagate: false,
      };
    } catch (error) {
      return null;
    }
  }

  refresh(uri?: vscode.Uri | vscode.Uri[]): void {
    this._onDidChangeFileDecorations.fire(uri || []);
  }

  private async getRichTooltip(
    serverId: number,
    stackName: string,
    filePath: string,
  ): Promise<string> {
    try {
      const parentPath = filePath.split("/").slice(0, -1).join("/");
      const fileName = filePath.split("/").pop() || "";

      const listing = await this.filesService.listDirectory(
        serverId,
        stackName,
        parentPath || undefined,
      );
      const entry = listing.entries.find((e) => e.name === fileName);

      if (!entry) {
        return "File not found";
      }

      const permissions = entry.mode;
      let permissionDisplay = permissions;

      if (permissions && permissions.match(/^[d-][rwx-]{9}$/)) {
        const numericMode = this.convertSymbolicToNumeric(permissions);
        permissionDisplay = `${permissions} (${numericMode})`;
      }

      let tooltip = `${entry.name}\nSize: ${entry.displaySize}\nModified: ${entry.modTime}\nPermissions: ${permissionDisplay}`;

      if (
        entry.ownerId !== undefined ||
        entry.groupId !== undefined ||
        entry.owner ||
        entry.group
      ) {
        let ownerInfo = "";
        let groupInfo = "";

        if (entry.owner && entry.ownerId !== undefined) {
          ownerInfo = `${entry.owner} (${entry.ownerId})`;
        } else if (entry.owner) {
          ownerInfo = entry.owner;
        } else if (entry.ownerId !== undefined) {
          ownerInfo = `uid:${entry.ownerId}`;
        } else {
          ownerInfo = "unknown";
        }

        if (entry.group && entry.groupId !== undefined) {
          groupInfo = `${entry.group} (${entry.groupId})`;
        } else if (entry.group) {
          groupInfo = entry.group;
        } else if (entry.groupId !== undefined) {
          groupInfo = `gid:${entry.groupId}`;
        } else {
          groupInfo = "unknown";
        }

        tooltip += `\nOwner: ${ownerInfo}\nGroup: ${groupInfo}`;
      }

      return tooltip;
    } catch (error) {
      return "Error loading file information";
    }
  }

  private convertSymbolicToNumeric(symbolic: string): string {
    if (!symbolic || symbolic.length !== 10) {
      return "unknown";
    }

    const permissions = symbolic.slice(1);
    let numeric = "";

    for (let i = 0; i < 9; i += 3) {
      let value = 0;

      if (permissions[i] === "r") {
        value += 4;
      }

      if (permissions[i + 1] === "w") {
        value += 2;
      }

      if (
        permissions[i + 2] === "x" ||
        permissions[i + 2] === "s" ||
        permissions[i + 2] === "t"
      ) {
        value += 1;
      }

      numeric += value.toString();
    }

    return "0" + numeric;
  }
}
