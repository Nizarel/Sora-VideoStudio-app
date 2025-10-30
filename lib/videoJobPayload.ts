import type { VideoRequestPayload } from "@/lib/sora";

export type ImageReferencePayload = {
  data?: unknown;
  mimeType?: unknown;
  name?: unknown;
};

export const buildVideoJobPayload = (
  payload: VideoRequestPayload,
  prompt: string,
  image: ImageReferencePayload | null,
  deploymentModel?: string,
): Record<string, unknown> => {
  // Sora 2 v1 API format: simplified parameters
  const jobPayload: Record<string, unknown> = {
    model: deploymentModel ?? payload.model,
    prompt: prompt,
    size: payload.size,
    seconds: String(payload.seconds), // Must be string: '4', '8', or '12'
  };

  // Add input_reference if image data is provided
  const imageData = image?.data;
  if (imageData != null) {
    // For Sora 2, input_reference should be a base64 string or file
    jobPayload.input_reference = String(imageData);
  }

  return jobPayload;
};
