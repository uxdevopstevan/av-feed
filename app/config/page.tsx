"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import SidebarImage from "@/app/components/SidebarImage";
import { useSignageConfig } from "@/app/components/SignageConfigProvider";
import { DEFAULT_SIGNAGE_CONFIG } from "@/app/lib/signageConfig";

const SESSION_UNLOCK_KEY = "staypost:config:unlocked";

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

  return (
    <div className="min-h-screen bg-black text-white p-6 text-base">
      <div className="max-w-5xl">
        <div className="flex items-end justify-between gap-8">
          <div>
            <Link
              href="/"
              className="inline-flex rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 px-4 py-2.5 text-base font-bold"
            >
              Back
            </Link>
            <div className="text-3xl font-extrabold tracking-tight">Config</div>
            <div className="mt-2 text-base text-white/70">
              Saved to localStorage on this device/browser.
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

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <section className="rounded-3xl border border-white/15 bg-white/5 p-6">
            <div className="text-xl font-extrabold">Theme settings</div>

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
                onChange={(e) => setDraft((d) => ({ ...d, maxTotalComments: Number(e.target.value) }))}
                className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
              />
            </div>

            <label className="mt-4 block text-base font-bold text-white/80">Sidebar color</label>
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

            <label className="mt-8 block text-base font-bold text-white/80">Logo URL</label>
            <div className="mt-3 flex gap-3">
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
            <div className="mt-5">
              <SidebarImage src={draft.logoUrl} alt="Logo preview" width={360} height={180} />
            </div>

            <label className="mt-8 block text-base font-bold text-white/80">QR URL</label>
            <div className="mt-3 flex gap-3">
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
            <div className="mt-5">
              <SidebarImage src={draft.qrUrl} alt="QR preview" width={220} height={220} />
            </div>
          </section>

          <section className="rounded-3xl border border-white/15 bg-white/5 p-6">
            <div className="flex items-center justify-between gap-6">
              <div>
                <div className="text-xl font-extrabold">Promo images</div>
                <div className="mt-2 text-base text-white/70">
                  Add image URLs (or local public assets like{" "}
                  <code className="font-mono">/promo.png</code>).
                </div>
              </div>
              <div className="flex gap-3">
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
                  <div key={idx} className="flex items-center gap-6">
                    <div className="h-24 w-40 rounded-2xl overflow-hidden border border-white/15 bg-black/30 shrink-0">
                      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <input
                      value={url}
                      onChange={(e) => setPromoAt(idx, e.target.value)}
                      className="flex-1 rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-base outline-none focus:border-white/40 font-mono"
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
          </section>
        </div>

        <div className="mt-10 text-sm text-white/50">
          Current promos: <span className="font-mono">{config.promoImageUrls.length}</span>
        </div>
      </div>
    </div>
  );
}

