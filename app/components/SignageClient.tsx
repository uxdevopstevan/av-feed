"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Hls from "hls.js";
import { useSignageConfig } from "@/app/components/SignageConfigProvider";
import type { LivePostComment, PromoSlide, SignageSnapshot } from "@/app/lib/types";

const POLL_MS = 60_000;
const ADVANCE_MS = 10_000;
const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;

const LS_DAY_KEY = "circle:dayKey";
const lsSnapshotKey = (dayKey: string) => `circle:snapshot:${dayKey}`;

type Media =
  | { type: "image"; url: string }
  | { type: "video"; url: string; posterUrl?: string | null };
type PostSlide = {
  kind: "post";
  id: string;
  postId: number;
  authorName: string;
  authorAvatarUrl?: string | null;
  caption: string;
  createdAt?: string;
  media?: Media;
};
type MainDisplayItem = PromoSlide | PostSlide;

const EMPTY_POST_CTA = "Be the first to comment on this post";

function buildMainQueue(promos: PromoSlide[], content: PostSlide[]): MainDisplayItem[] {
  if (content.length === 0) return promos;
  if (promos.length === 0) return content;

  // For low-content situations, alternate post/promo so promos still appear.
  if (content.length < 3) {
    const out: MainDisplayItem[] = [];
    let promoIdx = 0;
    for (let i = 0; i < content.length; i += 1) {
      out.push(content[i]);
      out.push(promos[promoIdx % promos.length] as MainDisplayItem);
      promoIdx += 1;
    }
    return out;
  }

  // Target ~25% promos by inserting 1 promo after every 3 posts.
  const promoEvery = 3;
  const out: MainDisplayItem[] = [];
  let promoIdx = 0;

  for (let i = 0; i < content.length; i += 1) {
    out.push(content[i]);
    if ((i + 1) % promoEvery === 0) {
      out.push(promos[promoIdx % promos.length] as MainDisplayItem);
      promoIdx += 1;
    }
  }

  return out.length ? out : promos;
}

function itemKey(item: MainDisplayItem): string {
  return `${item.kind}:${"id" in item ? String(item.id) : ""}`;
}

function toSortableIso(v: string | undefined): string {
  return typeof v === "string" && v ? v : "";
}

export default function SignageClient() {
  const { config } = useSignageConfig();
  const [snapshot, setSnapshot] = useState<SignageSnapshot | null>(null);
  const [activeMainIdx, setActiveMainIdx] = useState(0);
  const signatureRef = useRef<string | null>(null);
  const mainAdvanceTimer = useRef<number | null>(null);
  const videoDurationMsByUrlRef = useRef(new Map<string, number>());
  const [videoDurationTick, setVideoDurationTick] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const contentIdsRef = useRef<string[]>([]);
  const contentByIdRef = useRef(new Map<string, PostSlide>());
  const lastActiveKeyRef = useRef<string | null>(null);
  const [contentIds, setContentIds] = useState<string[]>([]);
  const activePostIdRef = useRef<number | null>(null);
  const textIdxByPostIdRef = useRef(new Map<number, number>());
  const bottomAdvanceTimer = useRef<number | null>(null);
  const [bottomTick, setBottomTick] = useState(0);

  const promoSlides = useMemo<PromoSlide[]>(() => {
    const urls = config.promoImageUrls ?? [];
    return urls.map((src, idx) => ({
      kind: "promo",
      id: `promo-${idx}`,
      title: "",
      imageSrc: src,
    }));
  }, [config.promoImageUrls]);

  const { postSlidesLatest, commentsByPostId } = useMemo(() => {
    const posts: PostSlide[] = [];
    for (const p of snapshot?.posts ?? []) {
      const caption = String(p.caption ?? "");
      const media: Media | undefined = p.videoUrl
        ? { type: "video", url: String(p.videoUrl), posterUrl: p.videoPosterUrl ?? null }
        : p.imageUrl
          ? { type: "image", url: String(p.imageUrl) }
          : undefined;

      // Skip completely empty posts so we don't render a "blank" slide.
      if (!media && caption.trim().length === 0) continue;

      posts.push({
        kind: "post",
        id: `post-${p.id}`,
        postId: p.id,
        authorName: p.authorName,
        authorAvatarUrl: p.authorAvatarUrl ?? null,
        caption,
        createdAt: p.updatedAt,
        media,
      });
    }
    posts.sort((a, b) => toSortableIso(b.createdAt).localeCompare(toSortableIso(a.createdAt)));
    return { postSlidesLatest: posts, commentsByPostId: snapshot?.commentsByPostId ?? {} };
  }, [snapshot]);

  useEffect(() => {
    const latest = postSlidesLatest;
    const latestIds = new Set(latest.map((s) => s.id));
    const byId = contentByIdRef.current;

    // Update/insert all latest slides.
    for (const s of latest) byId.set(s.id, s);

    // Remove slides no longer present (keep IDs in queue; they'll be skipped).
    for (const id of Array.from(byId.keys())) {
      if (!latestIds.has(id)) byId.delete(id);
    }

    const existing = new Set(contentIdsRef.current);
    const newOnes = latest.filter((s) => !existing.has(s.id));
    newOnes.sort((a, b) => toSortableIso(b.createdAt).localeCompare(toSortableIso(a.createdAt)));

    if (newOnes.length) {
      contentIdsRef.current = [...contentIdsRef.current, ...newOnes.map((s) => s.id)];
      setContentIds(contentIdsRef.current);
      return;
    }

    // Still trigger a re-render if the queue is empty but we now have slides.
    if (contentIdsRef.current.length === 0 && latest.length > 0) {
      contentIdsRef.current = latest.map((s) => s.id);
      setContentIds(contentIdsRef.current);
      return;
    }

    // Force a re-render so updated slide text/media is reflected.
    setContentIds((prev) => (prev.length === contentIdsRef.current.length ? [...contentIdsRef.current] : prev));
  }, [postSlidesLatest]);

  const contentSlides = useMemo(
    () => contentIds.map((id) => contentByIdRef.current.get(id)).filter(Boolean) as PostSlide[],
    [contentIds],
  );

  const mainQueue = useMemo(() => buildMainQueue(promoSlides, contentSlides), [promoSlides, contentSlides]);
  const activeMain = mainQueue.length
    ? mainQueue[activeMainIdx % mainQueue.length]
    : promoSlides[0] ?? { kind: "promo", id: "promo-fallback", title: "" };
  const activePostId =
    "kind" in activeMain && activeMain.kind === "post" ? (activeMain as PostSlide).postId : null;
  const activeComments = activePostId ? commentsByPostId[String(activePostId)] ?? [] : [];
  const activeCommentIdx = activePostId ? (textIdxByPostIdRef.current.get(activePostId) ?? 0) : 0;
  const activeComment =
    activePostId && activeComments.length ? activeComments[activeCommentIdx % activeComments.length] : null;

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    let cancelled = false;

    function londonDayKey(d = new Date()): string {
      // en-CA yields YYYY-MM-DD with Intl.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/London",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    }

    function loadCachedSnapshot(): void {
      try {
        const todayKey = londonDayKey();
        const lastDayKey = window.localStorage.getItem(LS_DAY_KEY);
        const effectiveDayKey = lastDayKey && lastDayKey === todayKey ? todayKey : todayKey;

        const raw = window.localStorage.getItem(lsSnapshotKey(effectiveDayKey));
        if (!raw) return;
        const parsed = JSON.parse(raw) as { snapshot: SignageSnapshot; cachedAt: number };
        if (!parsed?.snapshot || typeof parsed.cachedAt !== "number") return;
        if (Date.now() - parsed.cachedAt > SNAPSHOT_TTL_MS) return;

        signatureRef.current = parsed.snapshot.signature;
        setSnapshot(parsed.snapshot);
      } catch {
        // ignore
      }
    }

    function saveCachedSnapshot(snapshot: SignageSnapshot): void {
      try {
        if (!snapshot.dayKey) return;
        window.localStorage.setItem(LS_DAY_KEY, snapshot.dayKey);
        window.localStorage.setItem(
          lsSnapshotKey(snapshot.dayKey),
          JSON.stringify({ snapshot, cachedAt: Date.now() }),
        );
      } catch {
        // ignore
      }
    }

    async function poll() {
      try {
        const spaceId = config.spaceId;
        const params = new URLSearchParams();
        if (typeof spaceId === "number" && Number.isFinite(spaceId)) params.set("spaceId", String(spaceId));
        params.set("daysBack", String(config.daysBack));
        params.set("maxPosts", String(config.maxPosts));
        params.set("maxCommentsPerPost", String(config.maxCommentsPerPost));
        params.set("maxTotalComments", String(config.maxTotalComments));
        const url = params.toString() ? `/api/circle/posts?${params.toString()}` : "/api/circle/posts";
        const res = await fetch(url, { cache: "no-store" });
        const json = (await res.json()) as SignageSnapshot;
        // Helpful for debugging what the API is returning in the browser console.
        console.groupCollapsed(
          `[${url}] ${new Date().toISOString()} status=${res.status} ok=${res.ok}`,
        );
        console.log(json);
        console.groupEnd();
        if (cancelled) return;

        if (!json || typeof json.signature !== "string") return;
        if (signatureRef.current && json.signature === signatureRef.current) return;

        signatureRef.current = json.signature;
        setSnapshot(json);
        saveCachedSnapshot(json);
      } catch {
        if (!cancelled) setSnapshot(null);
      }
    }

    loadCachedSnapshot();
    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [config.spaceId]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      const el = document.documentElement;
      const anyEl = el as unknown as { webkitRequestFullscreen?: () => Promise<void> | void };
      if (typeof el.requestFullscreen === "function") {
        await el.requestFullscreen();
      } else if (typeof anyEl.webkitRequestFullscreen === "function") {
        anyEl.webkitRequestFullscreen();
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (mainAdvanceTimer.current) window.clearTimeout(mainAdvanceTimer.current);

    const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

    let ms = config.postMinMs;

    if ("kind" in activeMain && activeMain.kind === "post") {
      const media = (activeMain as PostSlide).media;
      if (media?.type === "video") {
        const known = videoDurationMsByUrlRef.current.get(media.url);
        const desired = typeof known === "number" && Number.isFinite(known) && known > 0 ? known : config.videoMaxMs;
        ms = clamp(desired, config.videoMinMs, config.videoMaxMs);
      } else {
        const commentCount = Math.min(activeComments.length, config.maxCommentsPerPost);
        const commentDrivenMs = commentCount > 0 ? commentCount * config.commentAdvanceMs : config.postMinMs;
        ms = clamp(Math.max(config.postMinMs, commentDrivenMs), config.postMinMs, config.postMaxMs);
      }
    }

    mainAdvanceTimer.current = window.setTimeout(() => {
      setActiveMainIdx((i) => (mainQueue.length ? (i + 1) % mainQueue.length : 0));
    }, ms);
    return () => {
      if (mainAdvanceTimer.current) window.clearTimeout(mainAdvanceTimer.current);
    };
  }, [
    mainQueue.length,
    activeMainIdx,
    activeMain,
    videoDurationTick,
    activeComments.length,
    config.postMinMs,
    config.postMaxMs,
    config.videoMinMs,
    config.videoMaxMs,
    config.commentAdvanceMs,
    config.maxCommentsPerPost,
  ]);

  useEffect(() => {
    lastActiveKeyRef.current = itemKey(activeMain);
  }, [activeMain]);

  useEffect(() => {
    const k = lastActiveKeyRef.current;
    if (!k) return;
    const idx = mainQueue.findIndex((it) => itemKey(it) === k);
    if (idx >= 0 && idx !== activeMainIdx) setActiveMainIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainQueue]);

  useEffect(() => {
    activePostIdRef.current = activePostId;
    setBottomTick((t) => t + 1);
  }, [activePostId]);

  useEffect(() => {
    if (bottomAdvanceTimer.current) window.clearInterval(bottomAdvanceTimer.current);
    bottomAdvanceTimer.current = window.setInterval(() => {
      const pid = activePostIdRef.current;
      if (!pid) return;
      const arr = commentsByPostId[String(pid)] ?? [];
      if (arr.length === 0) return;
      const curr = textIdxByPostIdRef.current.get(pid) ?? 0;
      textIdxByPostIdRef.current.set(pid, (curr + 1) % arr.length);
      setBottomTick((t) => t + 1);
    }, config.commentAdvanceMs);
    return () => {
      if (bottomAdvanceTimer.current) window.clearInterval(bottomAdvanceTimer.current);
    };
  }, [commentsByPostId, config.commentAdvanceMs]);

  return (
    <>
      <div className="h-3/4 relative overflow-hidden">
        <BackgroundMedia
          url={config.backgroundMediaUrl}
          visible={"kind" in activeMain && activeMain.kind === "post"}
        />

        {!isFullscreen ? (
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Enter full screen"
            className="absolute top-6 right-6 z-20 rounded-xl bg-black/45 hover:bg-black/60 border border-white/20 px-4 py-3 text-white backdrop-blur-md"
          >
            <FullscreenIcon isFullscreen={false} />
          </button>
        ) : null}

        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={`${activeMain.kind}-${"id" in activeMain ? activeMain.id : activeMainIdx}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          >
            {"kind" in activeMain && activeMain.kind === "promo" ? (
              <PromoMain item={activeMain} />
            ) : (
              <PostMain
                item={activeMain as PostSlide}
                onVideoDurationMs={(url, ms) => {
                  const prev = videoDurationMsByUrlRef.current.get(url);
                  if (prev === ms) return;
                  videoDurationMsByUrlRef.current.set(url, ms);
                  setVideoDurationTick((t) => t + 1);
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div
        className="h-1/4 p-8 overflow-hidden"
        style={{ backgroundColor: config.commentAreaBgColor }}
      >
        {"kind" in activeMain && activeMain.kind === "promo" ? (
          <PromoTickerMessage message={config.promoCtaMessage} />
        ) : activePostId && activeComment ? (
          <TextCommentTicker item={activeComment} />
        ) : activePostId ? (
          <PromoTickerMessage message={EMPTY_POST_CTA} />
        ) : (
          <PromoTickerMessage message={config.promoCtaMessage} />
        )}
      </div>
    </>
  );
}

function looksLikeVideoUrlForBackground(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes(".m3u8") ||
    u.includes("/hls/") ||
    /\.(mp4|webm|mov|m4v)(?:\?|#|$)/i.test(u)
  );
}

function BackgroundMedia({ url, visible }: { url: string; visible: boolean }) {
  const [failed, setFailed] = useState(false);
  const trimmed = (url ?? "").trim();
  const show = Boolean(trimmed) && !failed;
  const isVideo = show ? looksLikeVideoUrlForBackground(trimmed) : false;

  if (!show) return null;

  return (
    <div
      className={[
        "absolute inset-0 z-0 transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0",
      ].join(" ")}
      aria-hidden="true"
    >
      {isVideo ? (
        isLikelyHlsUrl(trimmed) ? (
          <HlsVideo src={trimmed} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <video
            src={trimmed}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        )
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={trimmed}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      <div className="absolute inset-0 bg-black/20" />
    </div>
  );
}

function PromoMain({ item }: { item: PromoSlide }) {
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div className="absolute inset-0">
      {item.imageSrc && !imgFailed ? (
        <div className="absolute inset-0">
          <div className="absolute inset-0 scale-110 blur-2xl opacity-60">
            <img
              src={item.imageSrc}
              alt=""
              onError={() => setImgFailed(true)}
              className="h-full w-full object-cover"
            />
          </div>
          <img
            src={item.imageSrc}
            alt=""
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#701a56] via-black to-[#1A1A1A]" />
      )}
    </div>
  );
}

function FullscreenIcon({ isFullscreen }: { isFullscreen: boolean }) {
  return isFullscreen ? (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  ) : (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      <path d="M8 8h3V5" />
      <path d="M16 8h-3V5" />
      <path d="M8 16h3v3" />
      <path d="M16 16h-3v3" />
    </svg>
  );
}

function PostMain({
  item,
  onVideoDurationMs,
}: {
  item: PostSlide;
  onVideoDurationMs?: (url: string, ms: number) => void;
}) {
  if (!item.media) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full h-full p-16 flex items-center justify-center">
          <div className="w-full max-w-[85%] max-h-full">
            <div className="rounded-[2.25rem] bg-black/55 border border-white/15 px-14 py-12 backdrop-blur-md text-center">
            <div className="flex items-center justify-center gap-5">
              <AvatarCircle name={item.authorName} src={item.authorAvatarUrl ?? null} size={72} />
              <div className="text-3xl font-extrabold leading-tight text-white/95">{item.authorName}</div>
            </div>
              <div className="mt-8 text-[2.5rem] leading-tight font-extrabold text-white line-clamp-6">
              {item.caption ? `“${item.caption}”` : " "}
            </div>
          </div>
        </div>
        </div>
      </div>
    );
  }

  const media = item.media;

  return (
    <div className="absolute inset-0">
      {media.type === "image" ? (
        <>
          <div className="absolute inset-0 scale-110 blur-2xl opacity-65">
            <Image
              src={media.url}
              alt="Live media background"
              fill
              unoptimized
              className="object-cover"
            />
          </div>
          <div className="absolute inset-0">
            <Image
              src={media.url}
              alt="Live media"
              fill
              unoptimized
              className="object-contain"
              priority
            />
          </div>
        </>
      ) : media.type === "video" ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-black via-black to-[#1A1A1A]" />
          {media.posterUrl ? (
            <div className="absolute inset-0 scale-110 blur-2xl opacity-60">
              <img src={media.posterUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}
          <div className="absolute inset-0 flex items-center justify-center">
            <HlsVideo
              src={media.url}
              className="h-full w-full object-contain"
              poster={media.posterUrl ?? null}
              onDurationMs={(ms) => onVideoDurationMs?.(media.url, ms)}
            />
          </div>
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-black via-black to-[#1A1A1A]" />
      )}

      <div className="absolute inset-0 bg-black/15" />

      <div className="absolute right-10 bottom-10">
        <div className="inline-flex items-center gap-5 rounded-3xl bg-black/55 border border-white/15 px-8 py-6 backdrop-blur-md">
          <AvatarCircle name={item.authorName} src={item.authorAvatarUrl ?? null} size={56} />
          <div className="text-2xl font-extrabold leading-tight text-white">{item.authorName}</div>
        </div>
      </div>
    </div>
  );
}

function isLikelyHlsUrl(src: string): boolean {
  const s = src.toLowerCase();
  return s.includes(".m3u8") || s.includes("/hls/") || s.includes("application/x-mpegurl");
}

function preferNativeHlsPlayback(): boolean {
  // Chrome may report it can play HLS via canPlayType("application/vnd.apple.mpegurl") === "maybe",
  // but still fails with MediaError code=4. For signage on Windows Chrome we always prefer hls.js.
  // Safari (macOS/iOS) can do native HLS reliably.
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isSafari =
    /Safari\//.test(ua) &&
    !/Chrome\//.test(ua) &&
    !/Chromium\//.test(ua) &&
    !/Edg\//.test(ua) &&
    !/OPR\//.test(ua);
  return isSafari;
}

function HlsVideo({
  src,
  className,
  poster,
  onDurationMs,
}: {
  src: string;
  className?: string;
  poster?: string | null;
  onDurationMs?: (ms: number) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const onLoadedMeta = () => {
      const d = video.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      onDurationMs?.(Math.round(d * 1000));
    };
    video.addEventListener("loadedmetadata", onLoadedMeta);

    // Reset any prior state.
    video.pause();
    video.removeAttribute("src");
    video.load();

    const isHls = isLikelyHlsUrl(src);
    const canPlayTypeResult =
      isHls && typeof video.canPlayType === "function"
        ? video.canPlayType("application/vnd.apple.mpegurl")
        : "";
    const nativeOk = isHls && preferNativeHlsPlayback() && canPlayTypeResult === "probably";
    const hlsJsSupported = Hls.isSupported();

    // For non-HLS, or for Safari where native HLS is reliable, use native playback.
    if (!isHls || nativeOk) {
      video.src = src;
      // Autoplay can still be blocked in some environments; ignore errors.
      video.play().catch(() => {});
      return () => {
        video.removeEventListener("loadedmetadata", onLoadedMeta);
      };
    }

    // For HLS on Chrome/Windows, prefer hls.js when supported.
    if (!hlsJsSupported) {
      // Last-resort fallback: some environments might still try playing.
      video.src = src;
      video.play().catch(() => {});
      return () => {
        video.removeEventListener("loadedmetadata", onLoadedMeta);
      };
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
    });

    hls.attachMedia(video);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(src);
    });

    // Try to play as soon as we have enough to start.
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });

    return () => {
      try {
        hls.destroy();
      } catch {
        // ignore
      }
      video.removeEventListener("loadedmetadata", onLoadedMeta);
    };
  }, [src, onDurationMs]);

  return (
    <video
      ref={ref}
      poster={poster ?? undefined}
      autoPlay
      muted
      playsInline
      preload="metadata"
      className={className}
    />
  );
}

function TextCommentTicker({ item }: { item: LivePostComment | null }) {
  if (!item) {
    return (
      <div className="h-full flex items-center">
        <div className="text-4xl font-semibold text-white/60">No comments yet</div>
      </div>
    );
  }

  const hasImage = (item.imageUrls?.length ?? 0) > 0;
  const trimmedText = (item.text ?? "").trim();
  const hasText = trimmedText.length > 0;

  return (
    <div className="h-full flex items-center justify-center text-center">
      <div className="w-full px-6">
        <div className="text-3xl font-extrabold text-white/90 leading-tight truncate">{item.authorName}</div>

        {hasText ? (
          <div className="mt-3 text-[2.25rem] leading-tight font-semibold italic text-white/90 line-clamp-3">
            {`“${trimmedText}”`}
          </div>
        ) : hasImage ? (
          <div className="mt-3 text-[2.25rem] leading-tight font-semibold text-white/85">📸 [Image Attached] in comment</div>
        ) : (
          <div className="mt-3 text-[2.25rem] leading-tight font-semibold italic text-white/90 line-clamp-3">
            {" "}
          </div>
        )}

        {hasText && hasImage ? (
          <div className="mt-3 text-2xl font-semibold text-white/70">📸 [Image Attached]</div>
        ) : null}
      </div>
    </div>
  );
}

function PromoTickerMessage({ message }: { message: string }) {
  const trimmed = message.replace(/^\n+|\n+$/g, "");
  if (!trimmed.trim()) return null;
  return (
    <div className="h-full flex items-center justify-center text-center">
      <div className="text-4xl font-semibold text-white/75 whitespace-pre-line">{trimmed}</div>
    </div>
  );
}

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase();
}

function hashToHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h % 360;
}

function AvatarCircle({ name, src, size }: { name: string; src: string | null; size: number }) {
  const initials = initialsForName(name);
  const hue = hashToHue(name);
  const bg = `hsl(${hue} 55% 35%)`;
  const [imgFailed, setImgFailed] = useState(false);
  const effectiveSrc = src && !imgFailed ? src : null;

  return (
    <div
      className="shrink-0 rounded-full overflow-hidden border border-white/15"
      style={{ width: size, height: size, background: bg }}
      aria-label={`${name} avatar`}
    >
      {effectiveSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={effectiveSrc}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-white font-extrabold">
          <span style={{ fontSize: Math.max(16, Math.floor(size * 0.38)) }}>{initials}</span>
        </div>
      )}
    </div>
  );
}

