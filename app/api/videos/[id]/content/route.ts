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
  azureSoraBinaryRequest,
  AzureSoraConfigError,
} from "@/lib/azureSora";

const asVariant = (value: string | null): "video" | "thumbnail" | "spritesheet" | undefined => {
  if (!value) return undefined;
  if (value === "video" || value === "thumbnail" || value === "spritesheet") {
    return value;
  }
  return undefined;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const videoId = typeof id === "string" ? id.trim() : "";
  if (!videoId) {
    return Response.json({ error: { message: "Video id is required" } }, { status: 400 });
  }

  const url = new URL(request.url);
  const variant = asVariant(url.searchParams.get("variant"));

  try {
    // First, check video status using Sora 2 v1 API
    const job = await azureSoraJsonRequest(`/videos/${encodeURIComponent(videoId)}`);
    const record = isRecord(job) ? job : {};
    const fallback: VideoRequestPayload = {
      prompt: typeof record.prompt === "string" ? record.prompt : "",
      model: coerceVideoModel(typeof record.model === "string" ? record.model : null),
      size: coerceVideoSize(typeof record.size === "string" ? record.size : null),
      seconds: coerceVideoSeconds(record.seconds != null ? String(record.seconds) : null),
    };
    const normalized = normalizeVideoResponse(job, fallback);

    // Check if job is completed
    if (normalized.status !== "succeeded" && normalized.status !== "completed") {
      return Response.json(
        { error: { message: `Video is not ready yet (status: ${normalized.status})` } },
        { status: 404 },
      );
    }

    // Sora 2 v1 API: Download content directly using video ID
    // Path: /videos/{video_id}/content?variant={video|thumbnail}
    const downloadPath = `/videos/${encodeURIComponent(videoId)}/content`;
    const query = variant ? { variant } : { variant: "video" };
    
    // Verbose logging to aid debugging of asset retrieval
    console.log("[sora] content fetch", { videoId, variant: query.variant, downloadPath });
    const assetResponse = await azureSoraBinaryRequest(downloadPath, { query });

    if (!assetResponse.ok) {
      const message = await assetResponse.text().catch(() => "Failed to download asset");
      console.error("[sora] asset download failed", { status: assetResponse.status, videoId, variant: query.variant, message });
      return Response.json({ error: { message } }, { status: assetResponse.status || 502 });
    }

    const contentType = assetResponse.headers.get("content-type")
      || (variant === "thumbnail" ? "image/png" : "video/mp4");
    const buffer = await assetResponse.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    if (error instanceof AzureSoraConfigError) {
      return Response.json({ error: { message: error.message } }, { status: 500 });
    }
    const message = describeError(error, "Failed to fetch video content");
    const status = resolveErrorStatus(error);
    return Response.json({ error: { message } }, { status });
  }
}
