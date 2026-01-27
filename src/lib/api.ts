import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import * as vscode from "vscode";
import * as https from "https";

let authToken: string | undefined;

export function setAuthToken(token: string | undefined): void {
  authToken = token;
}

export function getAuthToken(): string | undefined {
  return authToken;
}

function getConfig() {
  return vscode.workspace.getConfiguration("berth");
}

function createAxiosInstance() {
  const config = getConfig();
  const baseURL = config.get<string>("serverUrl", "https://localhost:8080");
  const trustSelfSigned = config.get<boolean>(
    "trustSelfSignedCertificates",
    true,
  );
  const customHeaders = config.get<Record<string, string>>("customHeaders", {});

  const instance = axios.create({
    baseURL,
    headers: {
      "Content-Type": "application/json",
      ...customHeaders,
    },
    httpsAgent: trustSelfSigned
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined,
  });

  instance.interceptors.request.use((reqConfig) => {
    if (authToken) {
      reqConfig.headers["Authorization"] = `Bearer ${authToken}`;
    }
    return reqConfig;
  });

  return instance;
}

let axiosInstance = createAxiosInstance();

vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration("berth")) {
    axiosInstance = createAxiosInstance();
  }
});

export const apiClient = <T>(
  config: AxiosRequestConfig,
): Promise<AxiosResponse<T>> => {
  if (config.responseType === "blob") {
    return axiosInstance
      .request<Buffer>({ ...config, responseType: "arraybuffer" })
      .then((response) => {
        const data = response.data;
        const uint8Array = new Uint8Array(
          data.buffer,
          data.byteOffset,
          data.byteLength,
        );
        const blob = new Blob([uint8Array]);
        return {
          ...response,
          data: blob as unknown as T,
        };
      });
  }
  return axiosInstance.request<T>(config);
};
