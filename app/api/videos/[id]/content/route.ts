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
    // First, check job status to get the generation ID
    const job = await azureSoraJsonRequest(`/video/generations/jobs/${encodeURIComponent(videoId)}`);
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

    // Extract generation ID from the job response
    // Azure expects /videos/{generation_id}/content, not /videos/{job_id}/content
    const generations = Array.isArray(record.generations) ? record.generations : [];
    const firstGeneration = generations.find((g) => isRecord(g) && typeof g.id === "string");
    
    if (!firstGeneration || !isRecord(firstGeneration) || typeof firstGeneration.id !== "string") {
      return Response.json(
        { error: { message: "No generation ID found in completed job" } },
        { status: 502 },
      );
    }

    const generationId = firstGeneration.id;

    // Use Azure's dedicated download endpoint according to official docs
    // https://learn.microsoft.com/en-us/azure/ai-foundry/openai/video-generation-quickstart
    // The REST API path is: /video/generations/{generation_id}/content/video
    // For thumbnails: /video/generations/{generation_id}/content/thumbnail
    
    const assetType = variant === "thumbnail" ? "thumbnail" : "video";
    const downloadPath = `/video/generations/${encodeURIComponent(generationId)}/content/${assetType}`;
    
    const assetResponse = await azureSoraBinaryRequest(downloadPath);

    if (!assetResponse.ok) {
      const message = await assetResponse.text().catch(() => "Failed to download asset");
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
