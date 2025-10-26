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
  getAzureSoraConfig,
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
    const job = await azureSoraJsonRequest(`/video/generations/jobs/${encodeURIComponent(videoId)}`);
    const record = isRecord(job) ? job : {};
    const fallback: VideoRequestPayload = {
      prompt: typeof record.prompt === "string" ? record.prompt : "",
      model: coerceVideoModel(typeof record.model === "string" ? record.model : null),
      size: coerceVideoSize(typeof record.size === "string" ? record.size : null),
      seconds: coerceVideoSeconds(record.seconds != null ? String(record.seconds) : null),
    };
    const normalized = normalizeVideoResponse(job, fallback);

    const assetUrl = (() => {
      if (variant === "thumbnail") {
        return normalized.thumbnail_url ?? null;
      }
      if (variant === "spritesheet") {
        const assets = (record.assets && Array.isArray(record.assets)) ? record.assets : [];
        for (const asset of assets) {
          if (!isRecord(asset)) continue;
          const type = typeof asset.type === "string" ? asset.type.toLowerCase() : "";
          if (!type.includes("sprite")) continue;
          if (typeof asset.download_url === "string" && asset.download_url) {
            return asset.download_url;
          }
          if (typeof asset.url === "string" && asset.url) {
            return asset.url;
          }
        }
        return null;
      }
      return normalized.download_url ?? normalized.thumbnail_url ?? null;
    })();

    if (!assetUrl) {
      const summarize = (collection: unknown): Array<Record<string, string>> => {
        if (!Array.isArray(collection)) return [];
        return collection
          .map((item) => (isRecord(item) ? item : null))
          .filter((item): item is Record<string, unknown> => Boolean(item))
          .slice(0, 5)
          .map((item) => ({
            type: typeof item.type === "string" ? item.type : "",
            role: typeof item.role === "string" ? item.role : "",
            purpose: typeof item.purpose === "string" ? item.purpose : "",
            url: typeof item.url === "string" ? item.url : "",
            download_url: typeof item.download_url === "string" ? item.download_url : "",
          }));
      };

      console.debug("Azure Sora asset not ready", {
        videoId,
        variant,
        status: normalized.status,
        assets: summarize(record.assets),
        generations: summarize(record.generations),
        resultAssets: summarize(isRecord(record.result) ? record.result.assets : undefined),
      });

      const statusCode = normalized.status === "succeeded" || normalized.status === "completed"
        ? 502
        : 404;

      return Response.json(
        { error: { message: `Asset is not ready yet (status: ${normalized.status})` } },
        { status: statusCode },
      );
    }

    const attemptFetch = async (init?: RequestInit): Promise<Response> => fetch(assetUrl, init);

    let assetResponse = await attemptFetch();
    if (!assetResponse.ok) {
      try {
        const config = getAzureSoraConfig();
        assetResponse = await attemptFetch({
          headers: { "api-key": config.apiKey },
        });
      } catch (innerError) {
        console.warn("Azure Sora asset fetch retry failed", innerError);
      }
    }

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
