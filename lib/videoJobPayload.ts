import type { VideoRequestPayload } from "@/lib/sora";

type MaybeString = string | null | undefined;

export type ImageReferencePayload = {
  data?: unknown;
  mimeType?: unknown;
  name?: unknown;
};

const parsePositiveDimension = (value: MaybeString): number | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
};

const parseDimensions = (size: string): { width?: number; height?: number } => {
  const [wRaw, hRaw] = size.split("x");
  return {
    width: parsePositiveDimension(wRaw),
    height: parsePositiveDimension(hRaw),
  };
};

export const buildVideoJobPayload = (
  payload: VideoRequestPayload,
  prompt: string,
  image: ImageReferencePayload | null,
  deploymentModel?: string,
): Record<string, unknown> => {
  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: prompt,
    },
  ];

  const imageData = image?.data;
  if (imageData != null) {
    const imagePayload: Record<string, unknown> = {
      type: "input_image",
      image_base64: String(imageData),
    };

    if (typeof image?.mimeType === "string" && image.mimeType.trim()) {
      imagePayload.mime_type = image.mimeType.trim();
    }

    if (typeof image?.name === "string" && image.name.trim()) {
      imagePayload.name = image.name.trim();
    }

    content.push(imagePayload);
  }

  const { width, height } = parseDimensions(payload.size);
  const durationSeconds = Number(payload.seconds);

  const videoOptions: Record<string, unknown> = {
    duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
  };

  if (width) {
    videoOptions.width = width;
  }

  if (height) {
    videoOptions.height = height;
  }

  if (!width || !height) {
    videoOptions.aspect_ratio = payload.size;
  }

  const jobPayload: Record<string, unknown> = {
    model: deploymentModel ?? payload.model,
    input: [
      {
        role: "user",
        content,
      },
    ],
    video: videoOptions,
    metadata: {
      source: "openai-sora-sample-app",
      prompt,
      size: payload.size,
      seconds: payload.seconds,
    },
    prompt,
    size: payload.size,
    seconds: payload.seconds,
    height: height ?? 1080,
    width: width ?? 1080,
    n_seconds: Number.isFinite(durationSeconds) ? durationSeconds : 4,
    n_variants: 1,
  };

  return jobPayload;
};
