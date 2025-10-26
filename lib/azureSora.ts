const getEnv = (): Record<string, string | undefined> => {
  const globalProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return globalProcess?.env ?? {};
};

const readEnv = (key: string): string | undefined => getEnv()[key]?.trim();

export type AzureSoraConfig = {
  endpoint: string;
  apiKey: string;
  apiVersion: string;
};

type QueryParams = Record<string, string | number | null | undefined>;

type JsonBody = Record<string, unknown> | Array<unknown>;

type AzureSoraBody = BodyInit | JsonBody | null | undefined;

type AzureSoraRequestInit = Omit<RequestInit, "headers" | "body"> & {
  headers?: HeadersInit;
  body?: AzureSoraBody;
  query?: QueryParams;
};

export class AzureSoraConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AzureSoraConfigError";
  }
}

const normalizeEndpoint = (value: string): string => value.replace(/\/*$/, "");

export const getAzureSoraConfig = (): AzureSoraConfig => {
  const endpoint = readEnv("AZURE_SORA_ENDPOINT");
  const apiKey = readEnv("AZURE_SORA_KEY");
  const apiVersion = readEnv("AZURE_SORA_API_VERSION") || "preview";

  if (!endpoint) {
    throw new AzureSoraConfigError("AZURE_SORA_ENDPOINT is not configured");
  }

  if (!apiKey) {
    throw new AzureSoraConfigError("AZURE_SORA_KEY is not configured");
  }

  return {
    endpoint: normalizeEndpoint(endpoint),
    apiKey,
    apiVersion,
  };
};

const buildQueryString = (query: QueryParams | undefined, apiVersion: string): string => {
  const params = new URLSearchParams();
  params.set("api-version", apiVersion);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      params.set(key, String(value));
    });
  }
  return params.toString();
};

const buildUrl = (config: AzureSoraConfig, path: string, query?: QueryParams): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const queryString = buildQueryString(query, config.apiVersion);
  return `${config.endpoint}${normalizedPath}?${queryString}`;
};

const toHeaders = (headers: HeadersInit | undefined): Headers => {
  if (headers instanceof Headers) return headers;
  return new Headers(headers);
};

const isJsonContent = (headers: Headers): boolean => {
  const contentType = headers.get("content-type");
  return !!contentType && contentType.toLowerCase().includes("application/json");
};

export const azureSoraJsonRequest = async <T = unknown>(path: string, init: AzureSoraRequestInit = {}): Promise<T> => {
  const config = getAzureSoraConfig();
  const { query, headers: providedHeaders, body, ...restInit } = init;
  const headers = toHeaders(providedHeaders);
  headers.set("api-key", config.apiKey);

  const finalInit: RequestInit = {
    ...restInit,
    headers,
  };

  let requestBody = body;
  const isFormData = requestBody instanceof FormData;
  if (requestBody && !isFormData) {
    const isString = typeof requestBody === "string";
    const isBlob = typeof Blob !== "undefined" && requestBody instanceof Blob;
    const hasArrayBuffer = typeof ArrayBuffer !== "undefined";
    const isArrayBuffer = hasArrayBuffer && requestBody instanceof ArrayBuffer;
    const isTypedArray = hasArrayBuffer && ArrayBuffer.isView(requestBody as ArrayBufferView);
    if (!isString && !isBlob && !isArrayBuffer && !isTypedArray) {
      requestBody = JSON.stringify(requestBody);
    }
  }

  if (requestBody && !isFormData) {
    if (!isJsonContent(headers)) {
      headers.set("content-type", "application/json");
    }
  }

  finalInit.body = requestBody as BodyInit | null | undefined;

  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  const url = buildUrl(config, path, query);
  const response = await fetch(url, finalInit);

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const text = await response.text();
  const payload = text && isJson ? JSON.parse(text) : text ? { raw: text } : {};

  if (!response.ok) {
    const message = (payload as { error?: { message?: string } })?.error?.message
      || (payload as { message?: string })?.message
      || response.statusText
      || "Azure Sora request failed";
    const error = new Error(message) as Error & { status?: number; payload?: unknown };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload as T;
};

export const azureSoraBinaryRequest = async (path: string, init: AzureSoraRequestInit = {}): Promise<Response> => {
  const config = getAzureSoraConfig();
  const { query, headers: providedHeaders, body, ...restInit } = init;
  const headers = toHeaders(providedHeaders);
  headers.set("api-key", config.apiKey);

  const finalInit: RequestInit = {
    ...restInit,
    headers,
  };

  if (body) {
    finalInit.body = body as BodyInit;
  }

  if (!headers.has("accept")) {
    headers.set("accept", "application/octet-stream");
  }

  const url = buildUrl(config, path, query);
  const response = await fetch(url, finalInit);
  if (!response.ok) {
    const text = await response.text();
    const message = text || response.statusText || "Azure Sora binary request failed";
    const error = new Error(message) as Error & { status?: number; payload?: unknown };
    error.status = response.status;
    error.payload = text;
    throw error;
  }

  return response;
};
