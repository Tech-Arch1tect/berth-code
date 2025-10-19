import * as vscode from "vscode";
import * as https from "https";

export class ApiClient {
  private baseUrl: string;
  private authToken: string | null = null;
  private httpsAgent!: https.Agent;

  constructor() {
    this.baseUrl = this.getServerUrl();
    this.setupHttpsAgent();
  }

  private getServerUrl(): string {
    const config = vscode.workspace.getConfiguration("berth");
    return config.get<string>("serverUrl", "https://localhost:8080");
  }

  private setupHttpsAgent(): void {
    const config = vscode.workspace.getConfiguration("berth");
    const trustSelfSigned = config.get<boolean>(
      "trustSelfSignedCertificates",
      true,
    );

    this.httpsAgent = new https.Agent({
      rejectUnauthorized: !trustSelfSigned,
    });

    if (trustSelfSigned) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  }

  public setAuthToken(token: string): void {
    this.authToken = token;
  }

  public getAuthToken(): string | null {
    return this.authToken;
  }

  public clearAuthToken(): void {
    this.authToken = null;
  }

  private getHeaders(
    additionalHeaders?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    if (additionalHeaders) {
      Object.assign(headers, additionalHeaders);
    }

    return headers;
  }

  private getFetchOptions(
    additionalHeaders?: Record<string, string>,
  ): RequestInit {
    const config = vscode.workspace.getConfiguration("berth");
    const trustSelfSigned = config.get<boolean>(
      "trustSelfSignedCertificates",
      true,
    );

    const options: RequestInit = {
      headers: this.getHeaders(additionalHeaders),
    };

    if (this.baseUrl.startsWith("https://") && trustSelfSigned) {
      // @ts-ignore
      options.agent = this.httpsAgent;
      // @ts-ignore
      options.rejectUnauthorized = false;
    }

    return options;
  }

  public async get(
    endpoint: string,
    additionalHeaders?: Record<string, string>,
  ): Promise<Response> {
    return this.request("GET", endpoint, undefined, additionalHeaders);
  }

  public async post(
    endpoint: string,
    body?: any,
    additionalHeaders?: Record<string, string>,
  ): Promise<Response> {
    return this.request("POST", endpoint, body, additionalHeaders);
  }

  public async put(
    endpoint: string,
    body?: any,
    additionalHeaders?: Record<string, string>,
  ): Promise<Response> {
    return this.request("PUT", endpoint, body, additionalHeaders);
  }

  public async delete(
    endpoint: string,
    additionalHeaders?: Record<string, string>,
  ): Promise<Response> {
    return this.request("DELETE", endpoint, undefined, additionalHeaders);
  }

  public async deleteWithBody(
    endpoint: string,
    body?: any,
    additionalHeaders?: Record<string, string>,
  ): Promise<Response> {
    return this.request("DELETE", endpoint, body, additionalHeaders);
  }

  private async request(
    method: string,
    endpoint: string,
    body?: any,
    additionalHeaders?: Record<string, string>,
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const options = this.getFetchOptions(additionalHeaders);

    options.method = method;

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      throw error;
    }
  }

  public async postMultipart(
    endpoint: string,
    file: File,
    fieldName: string = "file",
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const formData = new FormData();
    formData.append(fieldName, file);

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const options: RequestInit = {
      method: "POST",
      body: formData,
      headers,
    };

    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      throw error;
    }
  }

  public async postMultipartWithFields(
    endpoint: string,
    file: File,
    fieldName: string = "file",
    additionalFields?: Record<string, string>,
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const formData = new FormData();
    formData.append(fieldName, file);

    if (additionalFields) {
      for (const [key, value] of Object.entries(additionalFields)) {
        formData.append(key, value);
      }
    }

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }

    const options: RequestInit = {
      method: "POST",
      body: formData,
      headers,
    };

    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      throw error;
    }
  }

  public async downloadFile(endpoint: string): Promise<ArrayBuffer> {
    const response = await this.get(endpoint);

    if (!response.ok) {
      throw new Error(
        `Download failed: ${response.status} ${response.statusText}`,
      );
    }

    return await response.arrayBuffer();
  }
}
