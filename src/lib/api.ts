import axios, { AxiosRequestConfig } from "axios";
import * as vscode from "vscode";
import * as https from "https";
import { configureApiClient, type FetchLike } from "berth-api-client/client";

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

  return axios.create({
    baseURL,
    headers: {
      ...customHeaders,
    },
    httpsAgent: trustSelfSigned
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined,
  });
}

let axiosInstance = createAxiosInstance();

function headersToObject(
  headers: RequestInit["headers"],
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) {
    return result;
  }
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      result[key] = value;
    }
  } else {
    Object.assign(result, headers);
  }
  return result;
}

const axiosFetch: FetchLike = async (input, init) => {
  const config: AxiosRequestConfig = {
    url: input,
    method: init?.method ?? "GET",
    headers: headersToObject(init?.headers),
    data: init?.body,
    responseType: "arraybuffer",
    validateStatus: () => true,
  };

  const response = await axiosInstance.request<ArrayBuffer>(config);

  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const hasNoBody = [204, 205, 304].includes(response.status);
  const body = hasNoBody ? null : Buffer.from(response.data);
  return new Response(body, { status: response.status, headers });
};

configureApiClient({
  fetch: axiosFetch,
  getAccessToken: () => authToken ?? null,
});

vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration("berth")) {
    axiosInstance = createAxiosInstance();
  }
});
