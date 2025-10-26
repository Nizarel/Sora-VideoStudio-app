import {
  coerceVideoModel,
  coerceVideoSeconds,
  coerceVideoSize,
  describeError,
  isRecord,
  normalizeVideoResponse,
  resolveErrorStatus,
  VideoRequestPayload,
} from "@/lib/sora";
import {
  azureSoraJsonRequest,
  AzureSoraConfigError,
  resolveAzureModelIdentifier,
} from "@/lib/azureSora";
import { buildVideoJobPayload } from "@/lib/videoJobPayload";

export async function POST(request: Request) {
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return Response.json({ error: { message: "Invalid JSON payload" } }, { status: 400 });
  }

  const payload = isRecord(rawPayload) ? rawPayload : {};

  const videoId = typeof payload.videoId === "string" ? payload.videoId.trim() : "";
  if (!videoId) {
    return Response.json({ error: { message: "videoId is required" } }, { status: 400 });
  }

  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt) {
    return Response.json({ error: { message: "Prompt is required" } }, { status: 400 });
  }

  const fallback: VideoRequestPayload = {
    prompt,
    model: coerceVideoModel(typeof payload.model === "string" ? payload.model : null),
    size: coerceVideoSize(typeof payload.size === "string" ? payload.size : null),
    seconds: coerceVideoSeconds(payload.seconds != null ? String(payload.seconds) : null),
  };

  try {
    const deploymentModel = resolveAzureModelIdentifier(fallback.model);
    const jobPayload = buildVideoJobPayload(fallback, prompt, null, deploymentModel);
    jobPayload.remix_of = videoId;
    if (isRecord(jobPayload.metadata)) {
      jobPayload.metadata = {
        ...jobPayload.metadata,
        remix_of: videoId,
      };
    }

    const video = await azureSoraJsonRequest("/video/generations/jobs", {
      method: "POST",
      body: jobPayload,
    });
    const normalized = normalizeVideoResponse(video, fallback);
    return Response.json(normalized);
  } catch (error) {
    if (error instanceof AzureSoraConfigError) {
      return Response.json({ error: { message: error.message } }, { status: 500 });
    }
    const message = describeError(error, "Failed to remix video");
    const status = resolveErrorStatus(error);
    return Response.json({ error: { message } }, { status });
  }
}
