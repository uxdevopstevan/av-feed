"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSignageConfig } from "@/app/components/SignageConfigProvider";
import { DEFAULT_SIGNAGE_CONFIG, sanitizeSignageConfig } from "@/app/lib/signageConfig";

const SESSION_UNLOCK_KEY = "circle:config:unlocked";

type TabId = "circle" | "promos" | "colors" | "sidebar" | "import";

const TABS: { id: TabId; label: string }[] = [
  { id: "circle", label: "Circle Settings" },
  { id: "promos", label: "Promo Slides" },
  { id: "colors", label: "Theme Settings" },
  { id: "sidebar", label: "Sidebar Assets" },
  { id: "import", label: "Import / Export" },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function getConfiguredPin(): string | null {
  const v = process.env.NEXT_PUBLIC_SIGNAGE_CONFIG_PIN;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export default function ConfigPage() {
  const { config, setConfig, resetConfig } = useSignageConfig();
  const router = useRouter();

  const configuredPin = useMemo(() => getConfiguredPin(), []);
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [draft, setDraft] = useState(config);
  const [didSave, setDidSave] = useState(false);
  const [spaces, setSpaces] = useState<Array<{ id: number; name: string }> | null>(null);
  const [spacesError, setSpacesError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("circle");
  const [importStatus, setImportStatus] = useState<{ kind: "ok" | "err"; message: string } | null>(
    null,
  );

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    (async () => {
      try {
        setSpacesError(null);
        const res = await fetch("/api/circle/spaces", { cache: "no-store" });
        const json = (await res.json()) as { spaces?: Array<{ id: number; name: string }>; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setSpacesError(json?.error || `Failed to load spaces (${res.status})`);
          setSpaces([]);
          return;
        }
        setSpaces(Array.isArray(json?.spaces) ? json.spaces : []);
      } catch (e) {
        if (!cancelled) {
          setSpacesError(e instanceof Error ? e.message : "Failed to load spaces");
          setSpaces([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  useEffect(() => {
    try {
      const ok = window.sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1";
      if (ok) setUnlocked(true);
    } catch {
      // ignore
    }
  }, []);

  const tryUnlock = () => {
    if (!configuredPin) return;
    if (pin === configuredPin) {
      setUnlocked(true);
      try {
        window.sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
      } catch {
        // ignore
      }
    }
  };

  if (!configuredPin) {
    return (
      <div className="min-h-screen bg-black text-white p-6 text-base">
        <div className="max-w-3xl">
          <Link
            href="/"
            className="inline-flex rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-2.5 text-base font-bold"
          >
            Back
          </Link>
          <div className="text-3xl font-extrabold tracking-tight">Config</div>
          <div className="mt-3 text-base text-white/80">
            Config is disabled because <code className="font-mono">NEXT_PUBLIC_SIGNAGE_CONFIG_PIN</code>{" "}
            is not set.
          </div>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-black text-white p-6 text-base">
        <div className="max-w-xl">
          <Link
            href="/"
            className="inline-flex rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-2.5 text-base font-bold"
          >
            Back
          </Link>
          <div className="text-3xl font-extrabold tracking-tight">Config</div>
          <div className="mt-3 text-base text-white/80">Enter PIN to edit signage settings.</div>

          <div className="mt-8 flex gap-4">
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              type="password"
              inputMode="numeric"
              className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40"
              placeholder="PIN"
            />
            <button
              type="button"
              onClick={tryUnlock}
              className="rounded-xl bg-white text-black px-5 py-3 text-base font-extrabold"
            >
              Unlock
            </button>
          </div>
        </div>
      </div>
    );
  }

  const setPromoAt = (idx: number, value: string) => {
    setDraft((d) => {
      const next = d.promoImageUrls.slice();
      next[idx] = value;
      return { ...d, promoImageUrls: next };
    });
  };

  const addPromo = () => setDraft((d) => ({ ...d, promoImageUrls: [...d.promoImageUrls, ""] }));

  const removePromo = (idx: number) => {
    setDraft((d) => ({ ...d, promoImageUrls: d.promoImageUrls.filter((_, i) => i !== idx) }));
  };

  const save = () => {
    setConfig(draft);
    setDidSave(true);
    window.setTimeout(() => {
      router.push("/");
    }, 650);
  };

  const downloadConfigJson = () => {
    const json = JSON.stringify(draft, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `circle-config-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 text-base">
      <div className="max-w-6xl">
        <div className="flex items-end justify-between gap-8">
          <div>
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="inline-flex rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-2.5 text-base font-bold"
              >
                Back
              </Link>
              <div className="text-3xl font-extrabold tracking-tight">Config</div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => {
                setDraft(DEFAULT_SIGNAGE_CONFIG);
                resetConfig();
              }}
              className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-2.5 text-base font-bold"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-xl bg-white text-black px-4 py-2.5 text-base font-extrabold"
            >
              {didSave ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        {didSave ? (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-emerald-100">
            Saved. Returning to signage…
          </div>
        ) : null}

        <div className="mt-8 flex flex-col lg:flex-row gap-8 items-start">
          <nav className="w-full lg:w-64 shrink-0 lg:sticky lg:top-6" aria-label="Config sections">
            <ul className="flex lg:flex-col gap-2 rounded-2xl border border-white/15 bg-white/5 p-2">
              {TABS.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(t.id);
                      if (t.id !== "import") setImportStatus(null);
                    }}
                    className={[
                      "w-full text-left rounded-xl px-4 py-3 text-base font-bold transition",
                      activeTab === t.id
                        ? "bg-white text-black"
                        : "text-white/85 hover:bg-white/10",
                    ].join(" ")}
                  >
                    {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section className="flex-1 min-w-0 rounded-3xl border border-white/15 bg-white/5 p-6">
            {activeTab === "circle" ? (
              <>
                <div className="text-xl font-extrabold">Circle Settings</div>

                <label className="mt-6 block text-base font-bold text-white/80">Circle space</label>
                <div className="mt-3">
                  <select
                    value={draft.spaceId === null ? "" : String(draft.spaceId)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft((d) => ({ ...d, spaceId: v ? Number(v) : null }));
                    }}
                    className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40"
                  >
                    <option value="">Default (server)</option>
                    {(spaces ?? []).map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name} ({s.id})
                      </option>
                    ))}
                  </select>
                  {spaces === null ? (
                    <div className="mt-2 text-sm text-white/60">Loading spaces…</div>
                  ) : spacesError ? (
                    <div className="mt-2 text-sm text-rose-200">{spacesError}</div>
                  ) : null}
                </div>

                <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-base font-extrabold text-white/85">Feed limits</div>
                  <div className="mt-1 text-sm text-white/60">
                    Stored per-device in localStorage. Server will clamp to safe maximums.
                  </div>

                  <label className="mt-4 block text-base font-bold text-white/80">Days back</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={draft.daysBack}
                    onChange={(e) => setDraft((d) => ({ ...d, daysBack: Number(e.target.value) }))}
                    className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />

                  <label className="mt-4 block text-base font-bold text-white/80">Max posts</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={draft.maxPosts}
                    onChange={(e) => setDraft((d) => ({ ...d, maxPosts: Number(e.target.value) }))}
                    className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />

                  <label className="mt-4 block text-base font-bold text-white/80">Max comments per post</label>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    value={draft.maxCommentsPerPost}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, maxCommentsPerPost: Number(e.target.value) }))
                    }
                    className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />

                  <label className="mt-4 block text-base font-bold text-white/80">Max total comments</label>
                  <input
                    type="number"
                    min={0}
                    max={2000}
                    value={draft.maxTotalComments}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, maxTotalComments: Number(e.target.value) }))
                    }
                    className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />
                </div>

                <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-5">
                  <div className="text-base font-extrabold text-white/85">Display timing</div>
                  <div className="mt-1 text-sm text-white/60">
                    Stored per-device in localStorage. Controls how long posts stay on-screen and how quickly comments rotate.
                  </div>

                  <label className="mt-4 block text-base font-bold text-white/80">Comment interval (seconds)</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    step={1}
                    value={Math.max(1, Math.round((draft.commentAdvanceMs ?? 0) / 1000))}
                    onChange={(e) => {
                      const seconds = Number(e.target.value);
                      setDraft((d) => ({ ...d, commentAdvanceMs: Math.max(0, Math.floor(seconds * 1000)) }));
                    }}
                    className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />

                  <label className="mt-4 block text-base font-bold text-white/80">Post minimum (seconds)</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    step={1}
                    value={Math.max(1, Math.round((draft.postMinMs ?? 0) / 1000))}
                    onChange={(e) => {
                      const seconds = Number(e.target.value);
                      setDraft((d) => ({ ...d, postMinMs: Math.max(0, Math.floor(seconds * 1000)) }));
                    }}
                    className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />

                  <label className="mt-4 block text-base font-bold text-white/80">Post maximum (seconds)</label>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    step={1}
                    value={Math.max(1, Math.round((draft.postMaxMs ?? 0) / 1000))}
                    onChange={(e) => {
                      const seconds = Number(e.target.value);
                      setDraft((d) => ({ ...d, postMaxMs: Math.max(0, Math.floor(seconds * 1000)) }));
                    }}
                    className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />

                  <label className="mt-4 block text-base font-bold text-white/80">
                    Promo slide duration (seconds)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    step={1}
                    value={Math.max(1, Math.round((draft.promoSlideMs ?? 0) / 1000))}
                    onChange={(e) => {
                      const seconds = Number(e.target.value);
                      setDraft((d) => ({ ...d, promoSlideMs: Math.max(0, Math.floor(seconds * 1000)) }));
                    }}
                    className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />

                  <label className="mt-4 block text-base font-bold text-white/80">Video minimum (seconds)</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    step={1}
                    value={Math.max(1, Math.round((draft.videoMinMs ?? 0) / 1000))}
                    onChange={(e) => {
                      const seconds = Number(e.target.value);
                      setDraft((d) => ({ ...d, videoMinMs: Math.max(0, Math.floor(seconds * 1000)) }));
                    }}
                    className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />

                  <label className="mt-4 block text-base font-bold text-white/80">Video maximum (seconds)</label>
                  <input
                    type="number"
                    min={1}
                    max={300}
                    step={1}
                    value={Math.max(1, Math.round((draft.videoMaxMs ?? 0) / 1000))}
                    onChange={(e) => {
                      const seconds = Number(e.target.value);
                      setDraft((d) => ({ ...d, videoMaxMs: Math.max(0, Math.floor(seconds * 1000)) }));
                    }}
                    className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />
                </div>
              </>
            ) : activeTab === "promos" ? (
              <>
                <div className="text-xl font-extrabold">Promo Slides</div>

                <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="text-base font-extrabold text-white/90">Promo images</div>
                    <div className="mt-2 text-base text-white/70">
                      Add image URLs (or local public assets like{" "}
                      <code className="font-mono">/promo.png</code>).
                    </div>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={addPromo}
                      className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-2.5 text-base font-bold"
                    >
                      Add URL
                    </button>
                    <label className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-2.5 text-base font-bold cursor-pointer whitespace-nowrap">
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;
                          const url = await readFileAsDataUrl(f);
                          setDraft((d) => ({ ...d, promoImageUrls: [...d.promoImageUrls, url] }));
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-6 space-y-5">
                  {draft.promoImageUrls.length ? (
                    draft.promoImageUrls.map((url, idx) => (
                      <div key={idx} className="flex flex-wrap items-center gap-4">
                        <div className="h-24 w-40 rounded-2xl overflow-hidden border border-white/15 bg-black/30 shrink-0">
                          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
                        </div>
                        <input
                          value={url}
                          onChange={(e) => setPromoAt(idx, e.target.value)}
                          className="flex-1 min-w-[12rem] rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                          placeholder="https://…"
                        />
                        <label className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-2.5 text-base font-bold cursor-pointer whitespace-nowrap">
                          Upload
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f) return;
                              const nextUrl = await readFileAsDataUrl(f);
                              setPromoAt(idx, nextUrl);
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removePromo(idx)}
                          className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-2.5 text-base font-bold"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-base text-white/60">No promo images configured.</div>
                  )}
                </div>
              </>
            ) : activeTab === "colors" ? (
              <>
                <div className="text-xl font-extrabold">Theme Settings</div>

                <label className="mt-6 block text-base font-bold text-white/80">Sidebar background color</label>
                <div className="mt-4 flex items-center gap-4">
                  <input
                    type="color"
                    value={draft.themeColor}
                    onChange={(e) => setDraft((d) => ({ ...d, themeColor: e.target.value }))}
                    className="h-12 w-16 rounded-lg bg-transparent border border-white/20"
                  />
                  <input
                    value={draft.themeColor}
                    onChange={(e) => setDraft((d) => ({ ...d, themeColor: e.target.value }))}
                    className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />
                </div>

                <label className="mt-8 block text-base font-bold text-white/80">
                  Comment area background color
                </label>
                <div className="mt-4 flex items-center gap-4">
                  <input
                    type="color"
                    value={draft.commentAreaBgColor}
                    onChange={(e) => setDraft((d) => ({ ...d, commentAreaBgColor: e.target.value }))}
                    className="h-12 w-16 rounded-lg bg-transparent border border-white/20"
                  />
                  <input
                    value={draft.commentAreaBgColor}
                    onChange={(e) => setDraft((d) => ({ ...d, commentAreaBgColor: e.target.value }))}
                    className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />
                </div>

                <label className="mt-8 block text-base font-bold text-white/80">Sidebar text color</label>
                <div className="mt-4 flex items-center gap-4">
                  <input
                    type="color"
                    value={draft.sidebarTextColor}
                    onChange={(e) => setDraft((d) => ({ ...d, sidebarTextColor: e.target.value }))}
                    className="h-12 w-16 rounded-lg bg-transparent border border-white/20"
                  />
                  <input
                    value={draft.sidebarTextColor}
                    onChange={(e) => setDraft((d) => ({ ...d, sidebarTextColor: e.target.value }))}
                    className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                  />
                </div>

                <label className="mt-10 block text-base font-bold text-white/80">Promo CTA message</label>
                <div className="mt-2 text-sm text-white/60">
                  Shown in the bottom strip during promo slides (and when there are no posts). Leave blank to hide.
                  Use line breaks for multiple lines.
                </div>
                <textarea
                  value={draft.promoCtaMessage}
                  onChange={(e) => setDraft((d) => ({ ...d, promoCtaMessage: e.target.value }))}
                  rows={3}
                  className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 resize-y min-h-[5rem]"
                  placeholder="Optional message…"
                />

                <label className="mt-8 block text-base font-bold text-white/80">Background media URL</label>
                <div className="mt-2 text-sm text-white/60">
                  Optional. Shown behind post slides. Use an image URL, a direct video URL, or a local public path like{" "}
                  <code className="font-mono">/bg.mp4</code>.
                </div>
                <div className="mt-3">
                  <input
                    value={draft.backgroundMediaUrl}
                    onChange={(e) => setDraft((d) => ({ ...d, backgroundMediaUrl: e.target.value }))}
                    className="w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                    placeholder="https://… or /bg.mp4"
                  />
                </div>
              </>
            ) : activeTab === "sidebar" ? (
              <>
                <div className="text-xl font-extrabold">Sidebar Assets</div>

                <label className="mt-6 block text-base font-bold text-white/80">Sidebar background media URL</label>
                <div className="mt-2 text-sm text-white/60">
                  Optional. Shown behind the left sidebar. Use an image URL, a direct video URL, or a local public path
                  like <code className="font-mono">/sidebar.mp4</code>.
                </div>
                <div className="mt-3 flex items-center gap-4">
                  <input
                    value={draft.sidebarBackgroundMediaUrl}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, sidebarBackgroundMediaUrl: e.target.value }))
                    }
                    className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                    placeholder="https://… or /sidebar.mp4"
                  />
                </div>

                <label className="mt-8 block text-base font-bold text-white/80">Sidebar headline</label>
                <div className="mt-2 text-sm text-white/60">Shown under the QR code.</div>
                <textarea
                  value={draft.sidebarJoinHeadline}
                  onChange={(e) => setDraft((d) => ({ ...d, sidebarJoinHeadline: e.target.value }))}
                  rows={2}
                  className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 resize-y min-h-[4.5rem]"
                  placeholder="Scan to join the live feed!"
                />

                <label className="mt-6 block text-base font-bold text-white/80">Logo URL</label>
                <div className="mt-3 flex items-center gap-4">
                  <div className="h-14 w-20 rounded-xl overflow-hidden border border-white/15 bg-black/30 shrink-0 flex items-center justify-center">
                    {draft.logoUrl ? <img src={draft.logoUrl} alt="" className="h-full w-full object-contain" /> : null}
                  </div>
                  <input
                    value={draft.logoUrl}
                    onChange={(e) => setDraft((d) => ({ ...d, logoUrl: e.target.value }))}
                    className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                    placeholder="https://… or /local.png or data:image/…"
                  />
                  <label className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-2.5 text-base font-bold cursor-pointer whitespace-nowrap">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        const url = await readFileAsDataUrl(f);
                        setDraft((d) => ({ ...d, logoUrl: url }));
                      }}
                    />
                  </label>
                </div>

                <label className="mt-8 block text-base font-bold text-white/80">QR URL</label>
                <div className="mt-3 flex items-center gap-4">
                  <div className="h-14 w-20 rounded-xl overflow-hidden border border-white/15 bg-black/30 shrink-0 flex items-center justify-center">
                    {draft.qrUrl ? <img src={draft.qrUrl} alt="" className="h-full w-full object-contain" /> : null}
                  </div>
                  <input
                    value={draft.qrUrl}
                    onChange={(e) => setDraft((d) => ({ ...d, qrUrl: e.target.value }))}
                    className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
                    placeholder="https://… or /qr.svg or data:image/…"
                  />
                  <label className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-2.5 text-base font-bold cursor-pointer whitespace-nowrap">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        const url = await readFileAsDataUrl(f);
                        setDraft((d) => ({ ...d, qrUrl: url }));
                      }}
                    />
                  </label>
                </div>
              </>
            ) : (
              <>
                <div className="text-xl font-extrabold">Import / Export</div>
                <div className="mt-3 text-base text-white/70">
                  Move your settings between computers. Uploaded images travel with the file as base64; external image or
                  video URLs are stored as plain text.
                </div>

                <div className="mt-8 flex flex-wrap gap-4">
                  <button
                    type="button"
                    onClick={downloadConfigJson}
                    className="rounded-xl bg-white text-black px-5 py-3 text-base font-extrabold"
                  >
                    Download config
                  </button>
                  <label className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-5 py-3 text-base font-bold cursor-pointer whitespace-nowrap">
                    Import config
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        try {
                          const text = await f.text();
                          const parsed = JSON.parse(text) as unknown;
                          const sanitized = sanitizeSignageConfig(parsed);
                          setDraft(sanitized);
                          setImportStatus({
                            kind: "ok",
                            message: "Loaded into draft. Click Save to apply.",
                          });
                        } catch (err) {
                          setImportStatus({
                            kind: "err",
                            message: err instanceof Error ? err.message : "Invalid JSON file",
                          });
                        }
                      }}
                    />
                  </label>
                </div>

                {importStatus ? (
                  <div
                    className={
                      importStatus.kind === "ok"
                        ? "mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4 text-emerald-100"
                        : "mt-6 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-5 py-4 text-rose-100"
                    }
                  >
                    {importStatus.message}
                  </div>
                ) : null}

                <div className="mt-6 text-sm text-white/50">
                  Import replaces the current draft only; click Save at the top to write to localStorage on this device.
                </div>
              </>
            )}
          </section>
        </div>

        <div className="mt-10 text-sm text-white/50">
          <div>
            Current promos: <span className="font-mono">{draft.promoImageUrls.length}</span>
          </div>
          <div className="mt-2">Saved to localStorage on this device/browser.</div>
        </div>
      </div>
    </div>
  );
}

