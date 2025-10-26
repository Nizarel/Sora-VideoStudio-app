type VideoModel = "sora-2" | "sora-2-pro";
type VideoSeconds = "4" | "8" | "12";
type VideoSize = "720x1280" | "1280x720" | "1024x1792" | "1792x1024";

type UnknownRecord = Record<string, unknown>;

const MODEL_FALLBACK: VideoModel = "sora-2";
const SIZE_FALLBACK: VideoSize = "1280x720";
const SECONDS_FALLBACK: VideoSeconds = "4";

const ALLOWED_MODELS = new Set<VideoModel>(["sora-2", "sora-2-pro"]);
const ALLOWED_SIZES = new Set<VideoSize>(["720x1280", "1280x720", "1024x1792", "1792x1024"]);
const ALLOWED_SECONDS = new Set<VideoSeconds>(["4", "8", "12"]);

export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const collectAssetCollections = (source: UnknownRecord): unknown[][] => {
  const output: unknown[][] = [];
  const stack: UnknownRecord[] = [source];

  const enqueue = (value: unknown) => {
    if (Array.isArray(value)) {
      output.push(value);
    } else if (isRecord(value)) {
      stack.push(value);
    }
  };

  while (stack.length) {
    const current = stack.pop()!;
    enqueue(current.assets);
    enqueue(current.generations);
    enqueue(current.output);
    enqueue(current.outputs);
    enqueue(current.data);
    enqueue(current.result);
    enqueue(current.media);
  }

  return output;
};

const readString = (value: unknown): string | null => (typeof value === "string" ? value : null);

const readLower = (value: unknown): string => {
  const str = readString(value);
  return str ? str.toLowerCase() : "";
};

const getAssetUrl = (asset: UnknownRecord): string | null => {
  const candidates = [
    readString(asset.download_url),
    readString((asset as { downloadUrl?: unknown }).downloadUrl),
    readString(asset.url),
    readString((asset as { content_url?: unknown }).content_url),
    readString((asset as { contentUrl?: unknown }).contentUrl),
    readString((asset as { asset_url?: unknown }).asset_url),
    readString((asset as { assetUrl?: unknown }).assetUrl),
    readString((asset as { file_url?: unknown }).file_url),
    readString((asset as { fileUrl?: unknown }).fileUrl),
    readString((asset as { content_uri?: unknown }).content_uri),
    readString((asset as { contentUri?: unknown }).contentUri),
  ];
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return null;
};

const isProbablyVideoAsset = (asset: UnknownRecord): boolean => {
  const descriptors = [
    readLower(asset.type),
    readLower(asset.role),
    readLower(asset.purpose),
    readLower(asset.format),
    readLower(asset.asset_type),
    readLower(asset.mime_type),
    readLower((asset as { mimeType?: unknown }).mimeType),
    readLower(asset.category),
    readLower(asset.kind),
  ];
  const name = readLower(asset.name)
    || readLower((asset as { filename?: unknown }).filename)
    || readLower((asset as { file_name?: unknown }).file_name);

  if (descriptors.some((value) => value.includes("video") || value.includes("mp4"))) {
    return true;
  }
  if (name && (name.endsWith(".mp4") || name.includes("video"))) {
    return true;
  }
  return false;
};

const isProbablyThumbnailAsset = (asset: UnknownRecord): boolean => {
  const descriptors = [
    readLower(asset.type),
    readLower(asset.role),
    readLower(asset.purpose),
    readLower(asset.category),
    readLower(asset.kind),
    readLower(asset.format),
    readLower(asset.asset_type),
    readLower(asset.mime_type),
    readLower((asset as { mimeType?: unknown }).mimeType),
  ];
  const name = readLower(asset.name)
    || readLower((asset as { filename?: unknown }).filename)
    || readLower((asset as { file_name?: unknown }).file_name);

  if (descriptors.some((value) => value.includes("thumb") || value.includes("preview") || value.includes("image"))) {
    return true;
  }
  if (name && (name.includes("thumb") || name.includes("preview") || name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg"))) {
    return true;
  }
  return false;
};

const findAssetUrl = (
  video: UnknownRecord,
  matcher: (asset: UnknownRecord) => boolean,
  { fallback }: { fallback?: boolean } = {},
): string | null => {
  for (const collection of collectAssetCollections(video)) {
    for (const entry of collection) {
      if (!isRecord(entry)) continue;
      const url = getAssetUrl(entry);
      if (!url) continue;
      if (matcher(entry)) return url;
      if (fallback) return url;
    }
  }
  return null;
};

export type VideoRequestPayload = {
  prompt: string;
  model: VideoModel;
  size: VideoSize;
  seconds: VideoSeconds;
};

const coerceUnionValue = <T extends string>(
  value: string | null | undefined,
  set: Set<T>,
  fallback: T,
): T => {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (set.has(trimmed as T)) {
    return trimmed as T;
  }
  return fallback;
};

export const coerceVideoModel = (value: string | null | undefined): VideoModel =>
  coerceUnionValue(value, ALLOWED_MODELS, MODEL_FALLBACK);

export const coerceVideoSize = (value: string | null | undefined): VideoSize =>
  coerceUnionValue(value, ALLOWED_SIZES, SIZE_FALLBACK);

export const coerceVideoSeconds = (value: string | null | undefined): VideoSeconds =>
  coerceUnionValue(value, ALLOWED_SECONDS, SECONDS_FALLBACK);

const toUnixSeconds = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? Math.round(value / 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed > 1e12 ? Math.round(parsed / 1000) : Math.round(parsed);
    }
    const timestamp = Date.parse(trimmed);
    if (Number.isFinite(timestamp)) {
      return Math.round(timestamp / 1000);
    }
  }
  return null;
};

const extractDownloadUrl = (video: unknown): string | null => {
  if (!isRecord(video)) return null;
  const videoRecord = video as UnknownRecord;

  const directDownload = readString(videoRecord.download_url)
    || readString((videoRecord as { content_url?: unknown }).content_url)
    || readString((videoRecord as { contentUrl?: unknown }).contentUrl);
  if (directDownload) {
    return directDownload;
  }

  if (isRecord(videoRecord.result)) {
    const directResultDownload = readString(videoRecord.result.download_url)
      || readString((videoRecord.result as { content_url?: unknown }).content_url)
      || readString((videoRecord.result as { contentUrl?: unknown }).contentUrl);
    if (directResultDownload) {
      return directResultDownload;
    }

    if (isRecord(videoRecord.result.video)) {
      const nestedResultDownload = readString(videoRecord.result.video.download_url)
        || readString((videoRecord.result.video as { content_url?: unknown }).content_url)
        || readString((videoRecord.result.video as { url?: unknown }).url);
      if (nestedResultDownload) {
        return nestedResultDownload;
      }
    }
  }

  if (isRecord(videoRecord.assets) && isRecord(videoRecord.assets.video)) {
    const nestedDownload = readString(videoRecord.assets.video.download_url)
      || readString((videoRecord.assets.video as { content_url?: unknown }).content_url)
      || readString((videoRecord.assets.video as { url?: unknown }).url);
    if (nestedDownload) {
      return nestedDownload;
    }
  }

  const searchInCollection = (collection: unknown): string | null => {
    if (!Array.isArray(collection)) return null;
    for (const entry of collection) {
      if (!isRecord(entry)) continue;
      const url = getAssetUrl(entry)
        || readString(entry.download_url)
        || readString((entry as { url?: unknown }).url);
      if (url) return url;
    }
    return null;
  };

  if (isRecord(videoRecord.result) && Array.isArray(videoRecord.result.assets)) {
    const downloadFromResultAssets = searchInCollection(videoRecord.result.assets);
    if (downloadFromResultAssets) {
      return downloadFromResultAssets;
    }
  }

  const downloadFromAssets = searchInCollection(videoRecord.assets);
  if (downloadFromAssets) {
    return downloadFromAssets;
  }

  const downloadFromOutput = searchInCollection(videoRecord.output);
  if (downloadFromOutput) {
    return downloadFromOutput;
  }

  const nestedVideoAsset = findAssetUrl(videoRecord, isProbablyVideoAsset);
  if (nestedVideoAsset) {
    return nestedVideoAsset;
  }

  const fallbackAsset = findAssetUrl(videoRecord, () => true, { fallback: true });
  if (fallbackAsset) {
    return fallbackAsset;
  }

  return null;
};

const extractThumbnailUrl = (video: unknown): string | null => {
  if (!isRecord(video)) return null;
  const videoRecord = video as UnknownRecord;

  const directThumbnail = readString(videoRecord.thumbnail_url)
    || readString((videoRecord as { preview_image_url?: unknown }).preview_image_url)
    || readString((videoRecord as { previewImageUrl?: unknown }).previewImageUrl);
  if (directThumbnail) {
    return directThumbnail;
  }

  if (isRecord(videoRecord.result)) {
    const resultThumb = readString(videoRecord.result.thumbnail_url)
      || readString((videoRecord.result as { preview_image_url?: unknown }).preview_image_url)
      || readString((videoRecord.result as { previewImageUrl?: unknown }).previewImageUrl);
    if (resultThumb) {
      return resultThumb;
    }
  }

  if (isRecord(videoRecord.assets) && isRecord(videoRecord.assets.thumbnail)) {
    const nestedThumbnail = readString(videoRecord.assets.thumbnail.url)
      || readString((videoRecord.assets.thumbnail as { download_url?: unknown }).download_url)
      || readString((videoRecord.assets.thumbnail as { content_url?: unknown }).content_url);
    if (nestedThumbnail) {
      return nestedThumbnail;
    }
  }

  if (Array.isArray(videoRecord.assets)) {
    for (const asset of videoRecord.assets) {
      if (!isRecord(asset)) continue;
      if (readString(asset.type) === "thumbnail") {
        const url = getAssetUrl(asset) || readString(asset.url);
        if (url) return url;
      }
    }
  }

  if (isRecord(videoRecord.result) && Array.isArray(videoRecord.result.assets)) {
    for (const asset of videoRecord.result.assets) {
      if (!isRecord(asset)) continue;
      const type = readString(asset.type)?.toLowerCase();
      if (type === "thumbnail" || type === "preview_image") {
        const url = getAssetUrl(asset) || readString(asset.url) || readString(asset.download_url);
        if (url) return url;
      }
    }
  }

  const nestedThumbnail = findAssetUrl(videoRecord, isProbablyThumbnailAsset);
  if (nestedThumbnail) {
    return nestedThumbnail;
  }

  const fallbackThumbnail = findAssetUrl(videoRecord, () => true, { fallback: true });
  if (fallbackThumbnail) {
    return fallbackThumbnail;
  }

  return null;
};

const mapAzureStatus = (status: string | null): string => {
  if (!status) return "queued";
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "notstarted":
    case "queued":
    case "pending":
      return "queued";
    case "running":
    case "in_progress":
    case "processing":
      return "in_progress";
    case "succeeded":
    case "completed":
    case "finished":
      return "succeeded";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "failed";
    default:
      return normalized;
  }
};

export type NormalizedVideoResponse = UnknownRecord & {
  id: string;
  status: string;
  prompt: string;
  model: VideoModel;
  size: VideoSize;
  seconds: VideoSeconds;
  created_at: number;
  completed_at: number | null;
  remix_video_id: string | null;
  download_url: string | null;
  thumbnail_url: string | null;
  error: unknown;
};

const resolveVideoId = (video: UnknownRecord, now: number): string => {
  const directId = readString(video.id)
    || readString(video.video_id)
    || readString(video.job_id)
    || readString(video.jobId);
  if (directId) return directId;

  if (isRecord(video.data)) {
    const nestedId = readString(video.data.id);
    if (nestedId) return nestedId;
  }

  return `video_${now}`;
};

export const normalizeVideoResponse = (
  video: unknown,
  fallback: VideoRequestPayload,
): NormalizedVideoResponse => {
  const now = Math.floor(Date.now() / 1000);
  const videoData: UnknownRecord = isRecord(video) ? video : {};

  const statusRaw =
    readString(videoData.status)
    || readString(videoData.state)
    || readString(videoData.job_status)
    || readString(videoData.jobState)
    || "queued";
  const status = mapAzureStatus(statusRaw);

  const createdAt = toUnixSeconds(videoData.created_at) ?? now;
  const completedAt = toUnixSeconds(videoData.completed_at)
    ?? (status === "succeeded" || status === "completed" ? now : null);

  const remixVideoId = readString(videoData.remix_video_id)
    || readString(videoData.remix_of)
    || readString(videoData.remixed_from_video_id)
    || (isRecord(videoData.result) ? readString((videoData.result as UnknownRecord).remix_of) : null)
    || null;

  const response: NormalizedVideoResponse = {
    ...videoData,
    id: resolveVideoId(videoData, now),
    status,
    prompt: fallback.prompt,
    model: fallback.model,
    size: fallback.size,
    seconds: fallback.seconds,
    created_at: createdAt,
    completed_at: completedAt,
    remix_video_id: remixVideoId,
    download_url: extractDownloadUrl(videoData),
    thumbnail_url: extractThumbnailUrl(videoData),
    error: "error" in videoData ? videoData.error ?? null : null,
  };

  return response;
};

export const describeError = (error: unknown, fallbackMessage: string) => {
  if (error && typeof error === "object") {
    const anyError = error as { message?: string };
    if (typeof anyError.message === "string" && anyError.message.trim()) {
      return anyError.message;
    }
  }
  return fallbackMessage;
};

export const resolveErrorStatus = (error: unknown, fallbackStatus = 500) => {
  if (isRecord(error) && typeof error.status === "number") {
    return error.status;
  }

  if (typeof error === "object" && error !== null && "status" in error) {
    const statusValue = (error as { status?: unknown }).status;
    if (typeof statusValue === "number") {
      return statusValue;
    }
  }

  return fallbackStatus;
};
