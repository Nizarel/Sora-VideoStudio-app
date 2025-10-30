import { NextResponse } from "next/server";
import { describeError, resolveErrorStatus } from "@/lib/sora";
import type { GeneratedImageSuggestion } from "@/types/generated";

const IMAGE_MODEL_FALLBACK = "gpt-image-1";
const ALLOWED_IMAGE_MODELS = new Set<string>(["gpt-image-1"]);
const MAX_IMAGE_COUNT = 4;
const DEFAULT_IMAGE_COUNT = 3;

// Azure Images API supported sizes
type ImageSize = 
  | "256x256"
  | "512x512"
  | "1024x1024"
  | "1024x1536"
  | "1536x1024"
  | "1024x1792"
  | "1792x1024"
  | "auto";

const DEFAULT_IMAGE_SIZE: ImageSize = "1024x1024";
const ALLOWED_IMAGE_SIZES = new Set<ImageSize>([
  "256x256",
  "512x512",
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "1024x1792",
  "1792x1024",
  "auto",
]);

interface GenerateImagesPayload {
  prompt?: unknown;
  size?: unknown;
  count?: unknown;
  model?: unknown;
}

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const coerceImageCount = (value: unknown): number => {
  const parsed = readNumber(value);
  if (parsed === null) return DEFAULT_IMAGE_COUNT;
  if (parsed <= 1) return 1;
  if (parsed >= MAX_IMAGE_COUNT) return MAX_IMAGE_COUNT;
  return Math.round(parsed);
};

const coerceImageModel = (value: unknown): string => {
  const candidate = readString(value);
  if (!candidate) return IMAGE_MODEL_FALLBACK;
  if (ALLOWED_IMAGE_MODELS.has(candidate)) return candidate;
  return IMAGE_MODEL_FALLBACK;
};

const coerceImageSize = (value: unknown): ImageSize => {
  const candidate = readString(value);
  if (!candidate) return DEFAULT_IMAGE_SIZE;
  if (ALLOWED_IMAGE_SIZES.has(candidate as ImageSize)) {
    return candidate as ImageSize;
  }
  return DEFAULT_IMAGE_SIZE;
};

export async function POST(request: Request) {
  // Read Azure OpenAI configuration
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const baseApiVersion = process.env.AZURE_OPENAI_API_VERSION?.trim() ?? "2024-04-01-preview";
  const overrideApiVersion = process.env.AZURE_OPENAI_API_VERSION_IMAGES?.trim();
  const apiVersion = overrideApiVersion || baseApiVersion;
  const deployment = process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT?.trim() ?? IMAGE_MODEL_FALLBACK;

  if (!apiKey || !endpoint) {
    const message = "AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT must be configured";
    return NextResponse.json({ error: { message } }, { status: 500 });
  }

  let rawPayload: GenerateImagesPayload;
  try {
    rawPayload = (await request.json()) as GenerateImagesPayload;
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON payload" } },
      { status: 400 }
    );
  }

  const prompt = readString(rawPayload.prompt);
  if (!prompt) {
    return NextResponse.json(
      { error: { message: "Prompt is required" } },
      { status: 400 }
    );
  }

  const size = coerceImageSize(rawPayload.size);
  const count = coerceImageCount(rawPayload.count);
  // Model is validated but deployment name is used for Azure
  coerceImageModel(rawPayload.model);

  // Build Azure Images API URL with per-feature version override support
  const imagesUrl = `${endpoint.replace(/\/*$/, "")}/openai/deployments/${encodeURIComponent(deployment)}/images/generations?api-version=${encodeURIComponent(apiVersion)}`;
  if (overrideApiVersion) {
    console.log("[images] using version override", { apiVersion: overrideApiVersion });
  }

  try {
    const body = {
      prompt,
      size,
      quality: "high",
      n: count,
    };

    const response = await fetch(imagesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text };
    }

    if (!response.ok) {
      const errorRecord = parsed as Record<string, unknown>;
      const errorObj = errorRecord?.error as Record<string, unknown> | undefined;
      const errorMessage = typeof errorObj?.message === "string"
        ? errorObj.message
        : response.statusText || "Azure Images API request failed";
      console.error("Azure OpenAI Images failed", { status: response.status, body: parsed });
      return NextResponse.json({ error: { message: errorMessage } }, { status: response.status });
    }

    // Azure Images API returns { data: [...] } structure
    interface AzureImageEntry {
      b64_json?: string;
      url?: string;
    }
    const parsedRecord = parsed as Record<string, unknown>;
    const data = Array.isArray(parsedRecord?.data) ? (parsedRecord.data as AzureImageEntry[]) : [];
    
    const suggestions: GeneratedImageSuggestion[] = [];
    data.forEach((entry: AzureImageEntry, index: number) => {
      const base64 = entry.b64_json ?? null;
      const url = base64
        ? `data:image/png;base64,${base64}`
        : readString(entry.url);
      if (!url) return;
      suggestions.push({
        id: `generated-${Date.now()}-${index}`,
        url,
        base64,
        description: prompt,
      });
    });

    return NextResponse.json({ images: suggestions });
  } catch (error) {
    const message = describeError(error, "Failed to generate images");
    const status = resolveErrorStatus(error);
    return NextResponse.json({ error: { message } }, { status });
  }
}
