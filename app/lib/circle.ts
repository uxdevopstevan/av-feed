import "server-only";
import type { LivePostComment, SignageSnapshot } from "./types";

const CIRCLE_BASE_URL = "https://app.circle.so";
const EVENT_TZ = "Europe/London";
const MAX_POSTS_PER_DAY = 1000;
const POSTS_PER_PAGE = 60;
const COMMENTS_PER_PAGE = 100;
const MAX_COMMENTS_PER_POST = 25;

export type SignageSnapshotOptions = {
  daysBack?: number;
  maxPosts?: number;
  maxCommentsPerPost?: number;
  maxTotalComments?: number;
};

function clampInt(v: number | undefined, def: number, min: number, max: number): number {
  if (!Number.isFinite(v as number)) return def;
  return Math.min(max, Math.max(min, Math.floor(v as number)));
}

function normalizeOpts(input?: SignageSnapshotOptions) {
  const daysBack = clampInt(input?.daysBack, 0, 0, 30);
  const maxPosts = clampInt(input?.maxPosts, 200, 1, 500);
  const maxCommentsPerPost = clampInt(input?.maxCommentsPerPost, 10, 0, 25);
  const maxTotalComments = clampInt(input?.maxTotalComments, 800, 0, 2000);
  return { daysBack, maxPosts, maxCommentsPerPost, maxTotalComments };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function circleAuthHeaders() {
  const token = requireEnv("CIRCLE_API_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  } as const;
}

type CirclePaged<T> = {
  page: number;
  per_page: number;
  has_next_page: boolean;
  count: number;
  page_count: number;
  records: T[];
};

type CirclePost = {
  id: number;
  user_name?: string;
  user_avatar_url?: string | null;
  body?: { body?: string };
  body_plain_text?: string;
  cover_image_url?: string | null;
  cardview_thumbnail_url?: string | null;
  comments_count?: number;
  updated_at?: string;
  tiptap_body?: {
    circle_ios_fallback_text?: string;
    attachments?: unknown[];
    inline_attachments?: unknown[];
  };
  attachments?: unknown[];
  space_id?: number;
  published_at?: string;
  created_at?: string;
};

type CircleComment = {
  id: number;
  created_at?: string;
  body?: { body?: string };
  user?: { name?: string; avatar_url?: string | null };
  post?: { id?: number };
};

function stripHtmlToText(htmlOrText: string): string {
  return htmlOrText
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickPostCaption(p: CirclePost): string {
  const fromPlain = p.body_plain_text?.trim();
  if (fromPlain) return fromPlain;

  const fromBody = p.body?.body?.trim();
  if (fromBody) return stripHtmlToText(fromBody);

  const fallback = p.tiptap_body?.circle_ios_fallback_text?.trim();
  if (fallback) return fallback;

  return "";
}

function looksLikeUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//i.test(v);
}

function looksLikeVideoUrl(v: unknown): v is string {
  if (!looksLikeUrl(v)) return false;
  return /\.(mp4|mov|webm|m4v)(?:\?|#|$)/i.test(v);
}

function getString(obj: unknown, key: string): string | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

function getRecord(obj: unknown, key: string): Record<string, unknown> | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const v = (obj as Record<string, unknown>)[key];
  return v && typeof v === "object" ? (v as Record<string, unknown>) : undefined;
}

function extractPostMediaFromInlineAttachments(
  inline: unknown,
): { imageUrl?: string; videoUrl?: string } {
  if (!Array.isArray(inline)) return {};
  let imageUrl: string | undefined;
  let videoUrl: string | undefined;

  for (const a of inline) {
    if (!a || typeof a !== "object") continue;
    const anyA = a as Record<string, unknown>;
    const contentType = typeof anyA.content_type === "string" ? anyA.content_type : "";

    if (!videoUrl && contentType.startsWith("video/")) {
      const videoVariants = getRecord(anyA, "video_variants");
      const hls = videoVariants ? getString(videoVariants, "hls") : undefined;
      const original = videoVariants ? getString(videoVariants, "original") : undefined;
      const url = getString(anyA, "url");
      const pick = (hls && looksLikeUrl(hls) ? hls : undefined) ??
        (original && looksLikeUrl(original) ? original : undefined) ??
        (url && looksLikeUrl(url) ? url : undefined);
      if (pick) videoUrl = pick;
    }

    if (!imageUrl && contentType.startsWith("image/")) {
      const imageVariants = getRecord(anyA, "image_variants");
      const original = imageVariants ? getString(imageVariants, "original") : undefined;
      const large = imageVariants ? getString(imageVariants, "large") : undefined;
      const medium = imageVariants ? getString(imageVariants, "medium") : undefined;
      const small = imageVariants ? getString(imageVariants, "small") : undefined;
      const thumb = imageVariants ? getString(imageVariants, "thumbnail") : undefined;
      const url = getString(anyA, "url");
      const pick = (original && looksLikeUrl(original) ? original : undefined) ??
        (large && looksLikeUrl(large) ? large : undefined) ??
        (medium && looksLikeUrl(medium) ? medium : undefined) ??
        (small && looksLikeUrl(small) ? small : undefined) ??
        (thumb && looksLikeUrl(thumb) ? thumb : undefined) ??
        (url && looksLikeUrl(url) ? url : undefined);
      if (pick) imageUrl = pick;
    }
  }

  return { imageUrl, videoUrl };
}

function extractFirstImageUrlFromAttachments(attachments: unknown): string | undefined {
  if (!Array.isArray(attachments)) return undefined;
  for (const a of attachments) {
    if (a && typeof a === "object") {
      const anyA = a as Record<string, unknown>;
      const candidates = [
        anyA.url,
        anyA.image_url,
        anyA.file_url,
        anyA.download_url,
        anyA.original_url,
      ];
      for (const c of candidates) {
        if (looksLikeUrl(c)) return c;
      }
    }
  }
  return undefined;
}

function extractFirstVideoUrlFromAttachments(attachments: unknown): string | undefined {
  if (!Array.isArray(attachments)) return undefined;
  for (const a of attachments) {
    if (a && typeof a === "object") {
      const anyA = a as Record<string, unknown>;
      const candidates = [
        anyA.url,
        anyA.video_url,
        anyA.file_url,
        anyA.download_url,
        anyA.original_url,
      ];
      for (const c of candidates) {
        if (looksLikeVideoUrl(c)) return c;
      }
    }
  }
  return undefined;
}

function extractPostImageUrl(p: CirclePost): string | undefined {
  const inline = extractPostMediaFromInlineAttachments(p.tiptap_body?.inline_attachments);
  if (inline.imageUrl) return inline.imageUrl;

  const direct =
    (p.cover_image_url && looksLikeUrl(p.cover_image_url) ? p.cover_image_url : undefined) ??
    (p.cardview_thumbnail_url && looksLikeUrl(p.cardview_thumbnail_url)
      ? p.cardview_thumbnail_url
      : undefined);

  if (direct) return direct;

  const fromTiptap = extractFirstImageUrlFromAttachments(p.tiptap_body?.attachments);
  if (fromTiptap) return fromTiptap;

  const fromRoot = extractFirstImageUrlFromAttachments(p.attachments);
  if (fromRoot) return fromRoot;

  // Some posts only include images inline in the HTML body (no cover/thumbnail/attachments).
  const bodyHtml = (p.body?.body ?? "").trim();
  if (bodyHtml) {
    const urls = extractImageUrlsFromHtml(bodyHtml);
    if (urls[0]) return urls[0];
  }

  return undefined;
}

function extractImageUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const re = /<img[^>]+src="([^">]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const url = m[1];
    if (looksLikeUrl(url)) urls.push(url);
  }
  return Array.from(new Set(urls));
}

function extractVideoUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  const res = [
    /<video[^>]+src="([^">]+)"/gi,
    /<source[^>]+src="([^">]+)"/gi,
  ];

  for (const re of res) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const url = m[1];
      if (looksLikeVideoUrl(url)) urls.push(url);
    }
  }

  return Array.from(new Set(urls));
}

function extractPostVideoUrl(p: CirclePost): string | undefined {
  const inline = extractPostMediaFromInlineAttachments(p.tiptap_body?.inline_attachments);
  if (inline.videoUrl) return inline.videoUrl;

  const fromTiptap = extractFirstVideoUrlFromAttachments(p.tiptap_body?.attachments);
  if (fromTiptap) return fromTiptap;

  const fromRoot = extractFirstVideoUrlFromAttachments(p.attachments);
  if (fromRoot) return fromRoot;

  const bodyHtml = (p.body?.body ?? "").trim();
  if (bodyHtml) {
    const urls = extractVideoUrlsFromHtml(bodyHtml);
    if (urls[0]) return urls[0];
  }

  return undefined;
}

function getZonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // Avoid midnight formatting as "24" in some locales/environments.
    hourCycle: "h23",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function localDateTimeToUtcMs(
  local: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  timeZone: string,
): number {
  // Iteratively adjust a UTC guess until it formats to the desired local time in the target TZ.
  let utcMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  for (let i = 0; i < 4; i += 1) {
    const p = getZonedParts(new Date(utcMs), timeZone);
    const desiredMinutes = (((local.day * 24 + local.hour) * 60 + local.minute) * 60 + local.second) / 60;
    const gotMinutes = (((p.day * 24 + p.hour) * 60 + p.minute) * 60 + p.second) / 60;
    const deltaMinutes = gotMinutes - desiredMinutes;
    if (Math.abs(deltaMinutes) < 0.001) break;
    utcMs -= deltaMinutes * 60_000;
  }
  return utcMs;
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function dayKeyFromParts(p: { year: number; month: number; day: number }) {
  return `${p.year.toString().padStart(4, "0")}-${pad2(p.month)}-${pad2(p.day)}`;
}

function addDaysToYmd(p: { year: number; month: number; day: number }, deltaDays: number) {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function londonDayWindow(now = new Date()) {
  const p = getZonedParts(now, EVENT_TZ);
  const dayKey = dayKeyFromParts(p);
  const startUtcMs = localDateTimeToUtcMs(
    { year: p.year, month: p.month, day: p.day, hour: 0, minute: 0, second: 0 },
    EVENT_TZ,
  );
  const endUtcMs = localDateTimeToUtcMs(
    { year: p.year, month: p.month, day: p.day, hour: 23, minute: 59, second: 59 },
    EVENT_TZ,
  );
  return { dayKey, startUtcMs, endUtcMs: endUtcMs + 1000 };
}

function londonRangeWindow(daysBack: number, now = new Date()) {
  const p = getZonedParts(now, EVENT_TZ);
  const endKey = dayKeyFromParts(p);
  const startParts = addDaysToYmd({ year: p.year, month: p.month, day: p.day }, -daysBack);
  const startKey = dayKeyFromParts(startParts);

  const startUtcMs = localDateTimeToUtcMs(
    { ...startParts, hour: 0, minute: 0, second: 0 },
    EVENT_TZ,
  );
  const endUtcMs = localDateTimeToUtcMs(
    { year: p.year, month: p.month, day: p.day, hour: 23, minute: 59, second: 59 },
    EVENT_TZ,
  );

  const dayKey = daysBack === 0 ? endKey : `${startKey}_to_${endKey}`;
  return { dayKey, startUtcMs, endUtcMs: endUtcMs + 1000 };
}

function isWithinWindow(iso: string | undefined, startUtcMs: number, endUtcMs: number): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return ms >= startUtcMs && ms < endUtcMs;
}

async function circleFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${CIRCLE_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      ...circleAuthHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Circle API ${res.status} for ${path}: ${text.slice(0, 300)}`);
  }

  return (await res.json()) as T;
}

async function fetchTodayPosts(spaceId: number, startUtcMs: number, endUtcMs: number, maxPosts: number) {
  const out: Array<{ post: CirclePost; imageUrl?: string; videoUrl?: string }> = [];
  let page = 1;
  let shouldContinue = true;

  const limit = Math.min(MAX_POSTS_PER_DAY, maxPosts);
  while (shouldContinue && out.length < limit) {
    const resp = await circleFetchJson<CirclePaged<CirclePost>>(
      `/api/admin/v2/posts?space_id=${spaceId}&page=${page}&per_page=${POSTS_PER_PAGE}&status=published&sort=latest`,
    );

    for (const p of resp.records) {
      const ts = p.published_at ?? p.created_at;
      if (ts && Date.parse(ts) < startUtcMs) {
        shouldContinue = false;
        break;
      }
      if (!isWithinWindow(ts, startUtcMs, endUtcMs)) continue;
      const imageUrl = extractPostImageUrl(p);
      const videoUrl = extractPostVideoUrl(p);
      out.push({ post: p, imageUrl, videoUrl });
      if (out.length >= limit) break;
    }

    if (!resp.has_next_page) break;
    page += 1;
  }

  return out;
}

async function fetchTodayCommentsByPostId(
  spaceId: number,
  postIds: Set<number>,
  startUtcMs: number,
  endUtcMs: number,
  opts: { maxCommentsPerPost: number; maxTotalComments: number },
) {
  const byPostId = new Map<number, LivePostComment[]>();
  const counts = new Map<number, number>();
  let total = 0;

  let page = 1;
  let shouldContinue = true;

  const needsMore = () => {
    if (total >= opts.maxTotalComments) return false;
    for (const id of postIds) {
      if ((counts.get(id) ?? 0) < opts.maxCommentsPerPost) return true;
    }
    return false;
  };

  while (shouldContinue && needsMore()) {
    const resp = await circleFetchJson<CirclePaged<CircleComment>>(
      `/api/admin/v2/comments?space_id=${spaceId}&page=${page}&per_page=${COMMENTS_PER_PAGE}`,
    );

    for (const c of resp.records) {
      if (c.created_at && Date.parse(c.created_at) < startUtcMs) {
        shouldContinue = false;
        break;
      }
      if (!isWithinWindow(c.created_at, startUtcMs, endUtcMs)) continue;

      const postId = c.post?.id;
      if (!postId || !postIds.has(postId)) continue;

      const currentCount = counts.get(postId) ?? 0;
      if (currentCount >= opts.maxCommentsPerPost) continue;
      if (total >= opts.maxTotalComments) continue;

      const bodyHtml = (c.body?.body ?? "").trim();
      const comment: LivePostComment = {
        id: c.id,
        authorName: c.user?.name?.trim() || "Member",
        authorAvatarUrl: c.user?.avatar_url ?? null,
        text: stripHtmlToText(bodyHtml),
        createdAt: c.created_at,
        imageUrls: bodyHtml ? extractImageUrlsFromHtml(bodyHtml) : [],
        videoUrls: bodyHtml ? extractVideoUrlsFromHtml(bodyHtml) : [],
      };

      const arr = byPostId.get(postId) ?? [];
      arr.push(comment);
      byPostId.set(postId, arr);
      counts.set(postId, currentCount + 1);
      total += 1;
    }

    if (!resp.has_next_page) break;
    page += 1;
  }

  return byPostId;
}

function buildSignature(input: {
  posts: Array<{
    id: number;
    updatedAt?: string;
    commentsCount?: number;
    imageUrl?: string | null;
    videoUrl?: string | null;
  }>;
  commentsByPostId: Map<number, LivePostComment[]>;
}): string {
  const postPart = input.posts
    .map(
      (p) =>
        `${p.id}:${p.updatedAt ?? ""}:${p.commentsCount ?? ""}:${p.imageUrl ?? ""}:${p.videoUrl ?? ""}`,
    )
    .join("|");

  const commentPart = Array.from(input.commentsByPostId.entries())
    .sort(([a], [b]) => a - b)
    .map(([postId, comments]) => {
      const c = comments
        .slice()
        .sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""))
        .map(
          (cc) =>
            `${cc.id}:${cc.createdAt ?? ""}:${(cc.imageUrls ?? []).join(",")}:${(cc.videoUrls ?? []).join(",")}`,
        )
        .join(",");
      return `${postId}=[${c}]`;
    })
    .join("|");

  return `p:${postPart}#c:${commentPart}`;
}

export async function fetchTodaySignageSnapshot(
  spaceId: number,
  options?: SignageSnapshotOptions,
): Promise<SignageSnapshot> {
  const opts = normalizeOpts(options);
  const { dayKey, startUtcMs, endUtcMs } = londonRangeWindow(opts.daysBack);
  const nowIso = new Date().toISOString();

  const postsWithMaybeMedia = await fetchTodayPosts(spaceId, startUtcMs, endUtcMs, opts.maxPosts);
  const postIds = new Set(postsWithMaybeMedia.map((p) => p.post.id));
  const commentsByPostId = await fetchTodayCommentsByPostId(spaceId, postIds, startUtcMs, endUtcMs, {
    maxCommentsPerPost: opts.maxCommentsPerPost,
    maxTotalComments: opts.maxTotalComments,
  });

  const posts: SignageSnapshot["posts"] = postsWithMaybeMedia.map(({ post, imageUrl, videoUrl }) => ({
    id: post.id,
    authorName: post.user_name?.trim() || "Anonymous",
    authorAvatarUrl: post.user_avatar_url ?? null,
    caption: pickPostCaption(post),
    imageUrl: imageUrl ?? null,
    videoUrl: videoUrl ?? null,
    updatedAt: post.updated_at,
    commentsCount: post.comments_count,
  }));

  const commentsByPostIdObj: Record<string, LivePostComment[]> = {};
  for (const p of posts) {
    const arr = commentsByPostId.get(p.id) ?? [];
    arr.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    commentsByPostIdObj[String(p.id)] = arr;
  }

  const signature = buildSignature({ posts, commentsByPostId });

  return {
    dayKey,
    generatedAt: nowIso,
    signature,
    posts,
    commentsByPostId: commentsByPostIdObj,
  };
}

