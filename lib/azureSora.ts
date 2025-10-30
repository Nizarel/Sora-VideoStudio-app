const getEnv = (): Record<string, string | undefined> => {
  const globalProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return globalProcess?.env ?? {};
};

const readEnv = (key: string): string | undefined => getEnv()[key]?.trim();

const sanitizeModelKey = (model: string): string => model
  .replace(/[^a-zA-Z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .toUpperCase();

export const resolveAzureModelIdentifier = (model: string): string => {
  // Normalize accidental double hyphen variants (e.g. "sora--2" -> "sora-2")
  const normalizedModel = model.replace(/--+/g, "-");
  const specificKey = `AZURE_SORA_DEPLOYMENT_${sanitizeModelKey(model)}`;
  const specific = readEnv(specificKey);
  if (specific) return specific;

  const defaultDeployment = readEnv("AZURE_SORA_DEPLOYMENT_DEFAULT");
  if (defaultDeployment) return defaultDeployment;

  return normalizedModel;
};

export type AzureSoraConfig = {
  endpoint: string;
  apiKey: string;
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
  // Prefer dedicated Sora env vars, then fall back to shared OpenAI ones if not provided.
  let endpoint = readEnv("AZURE_SORA_ENDPOINT") || readEnv("AZURE_OPENAI_ENDPOINT");
  const apiKey = readEnv("AZURE_SORA_KEY") || readEnv("AZURE_OPENAI_API_KEY");

  if (!endpoint) {
    throw new AzureSoraConfigError("AZURE_SORA_ENDPOINT or AZURE_OPENAI_ENDPOINT must be configured");
  }
  if (!apiKey) {
    throw new AzureSoraConfigError("AZURE_SORA_KEY or AZURE_OPENAI_API_KEY must be configured");
  }

  endpoint = normalizeEndpoint(endpoint);
  // Ensure endpoint contains /openai/v1 for Sora v1 API
  if (!/\/openai\/v1$/i.test(endpoint)) {
    endpoint = `${endpoint}/openai/v1`;
  }

  const config: AzureSoraConfig = {
    endpoint,
    apiKey,
  };
  if (process.env.NODE_ENV !== "production") {
    console.debug("Azure Sora config", { endpoint: config.endpoint, hasKey: !!config.apiKey });
  }
  return config;
};

const buildQueryString = (query: QueryParams | undefined): string => {
  const params = new URLSearchParams();
  // Sora 2 uses v1 API - version is indicated by the /openai/v1/ path, not query parameter
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      params.set(key, String(value));
    });
  }
  const queryString = params.toString();
  return queryString ? queryString : "";
};

const buildUrl = (config: AzureSoraConfig, path: string, query?: QueryParams): string => {
  // The Sora endpoint already includes /openai/v1 in configuration; don't append it again.
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const queryString = buildQueryString(query);
  return queryString ? `${config.endpoint}${normalizedPath}?${queryString}` : `${config.endpoint}${normalizedPath}`;
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
  if (process.env.NODE_ENV !== "production") {
    console.debug("Azure Sora JSON request", { url, hasBody: !!body });
  }
  const response = await fetch(url, finalInit);

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const text = await response.text();
  const payload = text && isJson ? JSON.parse(text) : text ? { raw: text } : {};

  if (!response.ok) {
    if (typeof payload === "object" && payload) {
      console.error("Azure Sora error payload", payload);
    }
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
  if (process.env.NODE_ENV !== "production") {
    console.debug("Azure Sora binary request", { url });
  }
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
