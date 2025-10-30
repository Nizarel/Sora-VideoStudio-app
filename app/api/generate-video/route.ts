import {
  coerceVideoModel,
  coerceVideoSeconds,
  coerceVideoSize,
  describeError,
  isRecord,
  normalizeVideoResponse,
  resolveErrorStatus,
  type VideoRequestPayload,
} from "@/lib/sora";
import {
  azureSoraJsonRequest,
  AzureSoraConfigError,
  resolveAzureModelIdentifier,
} from "@/lib/azureSora";
import {
  buildVideoJobPayload,
  type ImageReferencePayload,
} from "@/lib/videoJobPayload";

export async function POST(request: Request) {
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch {
    return Response.json(
      { error: { message: "Invalid JSON payload" } },
      { status: 400 },
    );
  }

  const payload = isRecord(rawPayload) ? rawPayload : {};

  const prompt =
    typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt) {
    return Response.json(
      { error: { message: "Prompt is required" } },
      { status: 400 },
    );
  }

  const model = coerceVideoModel(
    typeof payload.model === "string" ? payload.model : null,
  );
  const size = coerceVideoSize(
    typeof payload.size === "string" ? payload.size : null,
  );
  const seconds = coerceVideoSeconds(
    payload.seconds != null ? String(payload.seconds) : null,
  );

  const imageData = isRecord(payload.image)
    ? (payload.image as ImageReferencePayload)
    : null;

  const videoPayload: VideoRequestPayload = {
    prompt,
    model,
    size,
    seconds,
  };

  try {
    const deploymentModel = resolveAzureModelIdentifier(model);
    if (process.env.NODE_ENV !== "production") {
      console.debug("Azure Sora model mapping", { requested: model, deployment: deploymentModel });
    }
    const body = buildVideoJobPayload(videoPayload, prompt, imageData, deploymentModel);
    // Sora 2 uses /videos endpoint (not /video/generations/jobs)
    const result = await azureSoraJsonRequest("/videos", {
      method: "POST",
      body,
    });

    const normalized = normalizeVideoResponse(result, videoPayload);
    return Response.json(normalized);
  } catch (error) {
    console.error("generate-video error", error);
    if (error instanceof AzureSoraConfigError) {
      return Response.json(
        { error: { message: error.message } },
        { status: 500 },
      );
    }
    const message = describeError(error, "Failed to create video");
    const status = resolveErrorStatus(error);
    return Response.json({ error: { message } }, { status });
  }
}
