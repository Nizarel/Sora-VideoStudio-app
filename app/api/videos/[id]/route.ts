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
} from "@/lib/azureSora";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const videoId = typeof id === "string" ? id.trim() : "";
  if (!videoId) {
    return Response.json(
      { error: { message: "Video id is required" } },
      { status: 400 }
    );
  }

  try {
    // Sora 2 uses /videos/{id} endpoint for status (not /video/generations/jobs/{id})
    const video = await azureSoraJsonRequest(`/videos/${encodeURIComponent(videoId)}`);
    const videoRecord = isRecord(video) ? video : {};

    const prompt =
      typeof videoRecord.prompt === "string" && videoRecord.prompt.trim()
        ? videoRecord.prompt.trim()
        : "";

    const fallback: VideoRequestPayload = {
      prompt,
      model: coerceVideoModel(
        typeof videoRecord.model === "string" ? videoRecord.model : null
      ),
      size: coerceVideoSize(
        typeof videoRecord.size === "string" ? videoRecord.size : null
      ),
      seconds: coerceVideoSeconds(
        videoRecord.seconds !== undefined && videoRecord.seconds !== null
          ? String(videoRecord.seconds)
          : null
      ),
    };

    const normalized = normalizeVideoResponse(video, fallback);
    return Response.json(normalized);
  } catch (error) {
    if (error instanceof AzureSoraConfigError) {
      return Response.json({ error: { message: error.message } }, { status: 500 });
    }
    const message = describeError(error, "Failed to fetch video");
    const status = resolveErrorStatus(error);
    return Response.json({ error: { message } }, { status });
  }
}
