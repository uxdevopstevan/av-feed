"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSignageConfig } from "@/app/components/SignageConfigProvider";
import type { LivePostComment, PromoSlide, SignageSnapshot } from "@/app/lib/types";

const POLL_MS = 60_000;
const ADVANCE_MS = 10_000;
const VIDEO_MAX_MS = 10_000;
const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;

const LS_DAY_KEY = "staypost:dayKey";
const lsSnapshotKey = (dayKey: string) => `staypost:snapshot:${dayKey}`;

type TextOnlyComment = LivePostComment & { postId: number };
type Media = { type: "image" | "video"; url: string };
type MediaSlide = {
  kind: "commentMedia" | "postMedia";
  id: string;
  postId: number;
  authorName: string;
  text: string;
  createdAt?: string;
  media: Media;
};
type MainDisplayItem = PromoSlide | MediaSlide;

function buildMainQueue(promos: PromoSlide[], content: MediaSlide[]): MainDisplayItem[] {
  if (content.length === 0) return promos;

  // Target ~25% promos by inserting 1 promo after every 3 comment-image slides.
  const promoEvery = 3;
  const out: MainDisplayItem[] = [];
  let promoIdx = 0;

  for (let i = 0; i < content.length; i += 1) {
    out.push(content[i]);
    if (promos.length > 0 && (i + 1) % promoEvery === 0) {
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
  const [activeTextIdx, setActiveTextIdx] = useState(0);
  const signatureRef = useRef<string | null>(null);
  const mainAdvanceTimer = useRef<number | null>(null);
  const textAdvanceTimer = useRef<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const contentIdsRef = useRef<string[]>([]);
  const contentByIdRef = useRef(new Map<string, MediaSlide>());
  const lastActiveKeyRef = useRef<string | null>(null);
  const [contentIds, setContentIds] = useState<string[]>([]);

  const promoSlides = useMemo<PromoSlide[]>(() => {
    const urls = config.promoImageUrls ?? [];
    return urls.map((src, idx) => ({
      kind: "promo",
      id: `promo-${idx}`,
      title: "",
      imageSrc: src,
    }));
  }, [config.promoImageUrls]);

  const { mediaSlidesLatest, textOnlyComments } = useMemo(() => {
    const commentsByPostId = snapshot?.commentsByPostId ?? {};
    const media: MediaSlide[] = [];
    const textOnly: TextOnlyComment[] = [];

    for (const [postIdStr, comments] of Object.entries(commentsByPostId)) {
      const postId = Number(postIdStr);
      if (!Number.isFinite(postId) || !Array.isArray(comments)) continue;

      for (const c of comments) {
        const img = c.imageUrls?.[0];
        const vid = c.videoUrls?.[0];
        if (img) {
          media.push({
            kind: "commentMedia",
            id: `comment-${c.id}-img`,
            postId,
            authorName: c.authorName,
            text: c.text,
            createdAt: c.createdAt,
            media: { type: "image", url: img },
          });
        }
        if (vid) {
          media.push({
            kind: "commentMedia",
            id: `comment-${c.id}-vid`,
            postId,
            authorName: c.authorName,
            text: c.text,
            createdAt: c.createdAt,
            media: { type: "video", url: vid },
          });
        }

        if (!img && !vid) {
          textOnly.push({ ...c, postId });
        }
      }
    }

    for (const p of snapshot?.posts ?? []) {
      if (p.imageUrl) {
        media.push({
          kind: "postMedia",
          id: `post-${p.id}-img`,
          postId: p.id,
          authorName: p.authorName,
          text: p.caption,
          createdAt: p.updatedAt,
          media: { type: "image", url: String(p.imageUrl) },
        });
      }
      if (p.videoUrl) {
        media.push({
          kind: "postMedia",
          id: `post-${p.id}-vid`,
          postId: p.id,
          authorName: p.authorName,
          text: p.caption,
          createdAt: p.updatedAt,
          media: { type: "video", url: String(p.videoUrl) },
        });
      }
    }

    const byCreatedDesc = <T extends { createdAt?: string }>(a: T, b: T) =>
      toSortableIso(b.createdAt).localeCompare(toSortableIso(a.createdAt));
    media.sort(byCreatedDesc);
    textOnly.sort(byCreatedDesc);

    return { mediaSlidesLatest: media, textOnlyComments: textOnly };
  }, [snapshot]);

  useEffect(() => {
    const latest = mediaSlidesLatest;
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
  }, [mediaSlidesLatest]);

  const contentSlides = useMemo(
    () => contentIds.map((id) => contentByIdRef.current.get(id)).filter(Boolean) as MediaSlide[],
    [contentIds],
  );

  const mainQueue = useMemo(() => buildMainQueue(promoSlides, contentSlides), [promoSlides, contentSlides]);
  const activeMain = mainQueue.length
    ? mainQueue[activeMainIdx % mainQueue.length]
    : promoSlides[0] ?? { kind: "promo", id: "promo-fallback", title: "" };
  const activeText = textOnlyComments.length
    ? textOnlyComments[activeTextIdx % textOnlyComments.length]
    : null;

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
        const res = await fetch("/api/circle/posts", { cache: "no-store" });
        const json = (await res.json()) as SignageSnapshot;
        // Helpful for debugging what the API is returning in the browser console.
        console.groupCollapsed(
          `[/api/circle/posts] ${new Date().toISOString()} status=${res.status} ok=${res.ok}`,
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
  }, []);

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

    const ms =
      "kind" in activeMain && activeMain.kind !== "promo" && (activeMain as MediaSlide).media.type === "video"
        ? VIDEO_MAX_MS
        : ADVANCE_MS;

    mainAdvanceTimer.current = window.setTimeout(() => {
      setActiveMainIdx((i) => (mainQueue.length ? (i + 1) % mainQueue.length : 0));
    }, ms);
    return () => {
      if (mainAdvanceTimer.current) window.clearTimeout(mainAdvanceTimer.current);
    };
  }, [mainQueue.length, activeMainIdx, activeMain]);

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
    if (textAdvanceTimer.current) window.clearInterval(textAdvanceTimer.current);
    textAdvanceTimer.current = window.setInterval(() => {
      setActiveTextIdx((i) => (textOnlyComments.length ? (i + 1) % textOnlyComments.length : 0));
    }, ADVANCE_MS);
    return () => {
      if (textAdvanceTimer.current) window.clearInterval(textAdvanceTimer.current);
    };
  }, [textOnlyComments.length]);

  return (
    <>
      <div className="h-3/4 relative overflow-hidden">
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

        <AnimatePresence mode="wait">
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
              <MediaMain item={activeMain as MediaSlide} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="h-1/4 bg-[#1A1A1A] p-8 overflow-hidden">
        <TextCommentTicker item={activeText} />
      </div>
    </>
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
      width="28"
      height="28"
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
      width="28"
      height="28"
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

function MediaMain({ item }: { item: MediaSlide }) {
  return (
    <div className="absolute inset-0">
      {item.media.type === "image" ? (
        <>
          <div className="absolute inset-0 scale-110 blur-2xl opacity-65">
            <Image
              src={item.media.url}
              alt="Live media background"
              fill
              unoptimized
              className="object-cover"
            />
          </div>
          <div className="absolute inset-0">
            <Image
              src={item.media.url}
              alt="Live media"
              fill
              unoptimized
              className="object-contain"
              priority
            />
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-black via-black to-[#1A1A1A]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <video
              src={item.media.url}
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full object-contain"
            />
          </div>
        </>
      )}

      <div className="absolute inset-0 bg-black/15" />

      <div className="absolute left-10 right-10 bottom-10">
        <div className="inline-block max-w-[70%] rounded-3xl bg-black/55 border border-white/15 px-8 py-6 backdrop-blur-md">
          <div className="text-4xl font-extrabold">{item.authorName}</div>
          <div className="mt-3 text-3xl font-semibold text-white/90 line-clamp-4">
            {item.text || " "}
          </div>
        </div>
      </div>
    </div>
  );
}

function TextCommentTicker({ item }: { item: TextOnlyComment | null }) {
  if (!item) {
    return (
      <div className="h-full flex items-center">
        <div className="text-4xl font-semibold text-white/60">No comments yet</div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center">
      <div className="min-w-0">
        <div className="text-3xl font-bold text-white/80">Latest comments</div>
        <div className="mt-4 text-4xl font-extrabold">{item.authorName}</div>
        <div className="mt-3 text-3xl font-semibold text-white/90 line-clamp-3">{item.text}</div>
      </div>
    </div>
  );
}

