import type { LivePostComment, SignageSnapshot } from "./types";

const CIRCLE_BASE_URL = "https://app.circle.so";
const EVENT_TZ = "Europe/London";
const MAX_POSTS_PER_DAY = 1000;
const POSTS_PER_PAGE = 60;
const COMMENTS_PER_PAGE = 100;
const MAX_COMMENTS_PER_POST = 25;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function circleAuthHeaders() {
  const token = requireEnv("NEXT_PUBLIC_CIRCLE_API_TOKEN");
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
  body?: { body?: string };
  body_plain_text?: string;
  cover_image_url?: string | null;
  cardview_thumbnail_url?: string | null;
  comments_count?: number;
  updated_at?: string;
  tiptap_body?: {
    circle_ios_fallback_text?: string;
    attachments?: unknown[];
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
  user?: { name?: string };
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

function extractPostImageUrl(p: CirclePost): string | undefined {
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

function londonDayWindow(now = new Date()) {
  const p = getZonedParts(now, EVENT_TZ);
  const dayKey = `${p.year.toString().padStart(4, "0")}-${p.month
    .toString()
    .padStart(2, "0")}-${p.day.toString().padStart(2, "0")}`;
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

async function fetchTodayPosts(spaceId: number, startUtcMs: number, endUtcMs: number) {
  const out: Array<{ post: CirclePost; imageUrl?: string }> = [];
  let page = 1;
  let shouldContinue = true;

  while (shouldContinue && out.length < MAX_POSTS_PER_DAY) {
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
      out.push({ post: p, imageUrl });
      if (out.length >= MAX_POSTS_PER_DAY) break;
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
) {
  const byPostId = new Map<number, LivePostComment[]>();
  const counts = new Map<number, number>();

  let page = 1;
  let shouldContinue = true;

  const needsMore = () => {
    for (const id of postIds) {
      if ((counts.get(id) ?? 0) < MAX_COMMENTS_PER_POST) return true;
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
      if (currentCount >= MAX_COMMENTS_PER_POST) continue;

      const bodyHtml = (c.body?.body ?? "").trim();
      const comment: LivePostComment = {
        id: c.id,
        authorName: c.user?.name?.trim() || "Member",
        text: stripHtmlToText(bodyHtml),
        createdAt: c.created_at,
        imageUrls: bodyHtml ? extractImageUrlsFromHtml(bodyHtml) : [],
      };

      const arr = byPostId.get(postId) ?? [];
      arr.push(comment);
      byPostId.set(postId, arr);
      counts.set(postId, currentCount + 1);
    }

    if (!resp.has_next_page) break;
    page += 1;
  }

  return byPostId;
}

function buildSignature(input: {
  posts: Array<{ id: number; updatedAt?: string; commentsCount?: number; imageUrl?: string | null }>;
  commentsByPostId: Map<number, LivePostComment[]>;
}): string {
  const postPart = input.posts
    .map((p) => `${p.id}:${p.updatedAt ?? ""}:${p.commentsCount ?? ""}:${p.imageUrl ?? ""}`)
    .join("|");

  const commentPart = Array.from(input.commentsByPostId.entries())
    .sort(([a], [b]) => a - b)
    .map(([postId, comments]) => {
      const c = comments
        .slice()
        .sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""))
        .map((cc) => `${cc.id}:${cc.createdAt ?? ""}:${(cc.imageUrls ?? []).join(",")}`)
        .join(",");
      return `${postId}=[${c}]`;
    })
    .join("|");

  return `p:${postPart}#c:${commentPart}`;
}

export async function fetchTodaySignageSnapshot(spaceId: number): Promise<SignageSnapshot> {
  const { dayKey, startUtcMs, endUtcMs } = londonDayWindow();
  const nowIso = new Date().toISOString();

  const postsWithMaybeImages = await fetchTodayPosts(spaceId, startUtcMs, endUtcMs);
  const postIds = new Set(postsWithMaybeImages.map((p) => p.post.id));
  const commentsByPostId = await fetchTodayCommentsByPostId(
    spaceId,
    postIds,
    startUtcMs,
    endUtcMs,
  );

  const pickFallbackImageUrlFromComments = (postId: number): string | undefined => {
    const comments = commentsByPostId.get(postId) ?? [];
    for (const c of comments) {
      const url = c.imageUrls?.[0];
      if (url) return url;
    }
    return undefined;
  };

  const posts: SignageSnapshot["posts"] = postsWithMaybeImages.map(({ post, imageUrl }) => ({
    id: post.id,
    authorName: post.user_name?.trim() || "Anonymous",
    caption: pickPostCaption(post),
    imageUrl: imageUrl ?? pickFallbackImageUrlFromComments(post.id),
    updatedAt: post.updated_at,
    commentsCount: post.comments_count,
  }));

  // Ensure newest comments first per post.
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

