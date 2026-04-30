"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DisplayItem, LivePostSlide, PromoSlide, SignageSnapshot } from "@/app/lib/types";

const POLL_MS = 60_000;
const ADVANCE_MS = 10_000;
const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000;

const LS_DAY_KEY = "staypost:dayKey";
const lsSnapshotKey = (dayKey: string) => `staypost:snapshot:${dayKey}`;

const promoSlides: PromoSlide[] = [
  {
    kind: "promo",
    id: "promo-1",
    title: "Women in Ag Awards 2026",
    subtitle: "Welcome to the live event!",
    imageSrc: "/promo1.png",
  },
  {
    kind: "promo",
    id: "promo-2",
    title: "Share your moments",
    subtitle: "Post a photo to appear on the big screen",
    imageSrc: "/promo2.png",
  },
];

function buildQueue(promos: PromoSlide[], posts: LivePostSlide[]): DisplayItem[] {
  if (posts.length === 0) return promos;
  const q: DisplayItem[] = [];
  const max = Math.max(promos.length, posts.length);
  for (let i = 0; i < max; i += 1) {
    if (promos[i]) q.push(promos[i]);
    if (posts[i]) q.push(posts[i]);
  }
  return q.length ? q : promos;
}

function formatPromoTickerText(item: PromoSlide): string {
  return item.subtitle
    ? `${item.title} — ${item.subtitle}`
    : `Welcome to the ${item.title}!`;
}

export default function SignageClient() {
  const [posts, setPosts] = useState<LivePostSlide[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const signatureRef = useRef<string | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const queue = useMemo(() => buildQueue(promoSlides, posts), [posts]);
  const active = queue.length ? queue[activeIdx % queue.length] : promoSlides[0];

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

    function snapshotToSlides(s: SignageSnapshot): LivePostSlide[] {
      return (s.posts ?? []).map((p) => ({
        kind: "post",
        id: p.id,
        authorName: p.authorName,
        caption: p.caption,
        imageUrl: p.imageUrl,
        updatedAt: p.updatedAt,
        commentsCount: p.commentsCount,
        comments: (s.commentsByPostId?.[String(p.id)] ?? []).slice(0, 25),
      }));
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
        setPosts(snapshotToSlides(parsed.snapshot));
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
        setPosts(snapshotToSlides(json));
        saveCachedSnapshot(json);
      } catch {
        if (!cancelled) setPosts([]);
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
    if (advanceTimer.current) window.clearInterval(advanceTimer.current);
    advanceTimer.current = window.setInterval(() => {
      setActiveIdx((i) => (queue.length ? (i + 1) % queue.length : 0));
    }, ADVANCE_MS);
    return () => {
      if (advanceTimer.current) window.clearInterval(advanceTimer.current);
    };
  }, [queue.length]);

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
            key={`${active.kind}-${"id" in active ? active.id : activeIdx}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          >
            {"kind" in active && active.kind === "promo" ? (
              <PromoMain item={active} />
            ) : (
              <PostMain item={active as LivePostSlide} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="h-1/4 bg-[#1A1A1A] p-8 overflow-hidden">
        {"kind" in active && active.kind === "promo" ? (
          <PromoTicker item={active} />
        ) : (
          <PostTicker item={active as LivePostSlide} />
        )}
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
            alt={item.title}
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-contain"
          />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#701a56] via-black to-[#1A1A1A]" />
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center px-10">
          <div className="text-6xl font-extrabold tracking-tight">{item.title}</div>
          {item.subtitle ? (
            <div className="mt-6 text-4xl font-bold text-white/90">
              {item.subtitle}
            </div>
          ) : null}
        </div>
      </div>
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

function PostMain({ item }: { item: LivePostSlide }) {
  if (!item.imageUrl) {
    return (
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#701a56] via-black to-[#1A1A1A]" />
        <div className="absolute inset-0 bg-black/10" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 scale-110 blur-2xl opacity-65">
        <Image
          src={item.imageUrl}
          alt="Live post image background"
          fill
          unoptimized
          className="object-cover"
        />
      </div>
      <div className="absolute inset-0">
        <Image
          src={item.imageUrl}
          alt="Live post image"
          fill
          unoptimized
          className="object-contain"
          priority
        />
      </div>
      <div className="absolute inset-0 bg-black/10" />
    </div>
  );
}

function PromoTicker({ item }: { item: PromoSlide }) {
  return (
    <div className="h-full flex items-center">
      <div className="text-5xl font-extrabold tracking-tight">
        {formatPromoTickerText(item)}
      </div>
    </div>
  );
}

function PostTicker({ item }: { item: LivePostSlide }) {
  return (
    <div className="h-full w-full flex gap-10">
      <div className="w-1/2 overflow-hidden">
        <div className="text-4xl font-extrabold">{item.authorName}</div>
        <div className="mt-4 text-3xl font-semibold text-white/90 line-clamp-3">
          {item.caption || " "}
        </div>
      </div>
      <div className="w-1/2 overflow-hidden">
        <div className="text-3xl font-bold text-white/80">Recent comments</div>
        <div className="mt-4 space-y-4">
          {item.comments.length ? (
            item.comments.slice(0, 3).map((c) => (
              <div key={c.id} className="text-3xl flex items-start gap-4">
                {c.imageUrls?.[0] ? (
                  <img
                    src={c.imageUrls[0]}
                    alt=""
                    className="h-16 w-16 rounded-xl object-cover border border-white/15 bg-black/25 shrink-0"
                  />
                ) : null}
                <div className="min-w-0">
                  <span className="font-extrabold">{c.authorName}: </span>
                  <span className="font-semibold text-white/90">{c.text}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-3xl font-semibold text-white/60">
              No comments yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

