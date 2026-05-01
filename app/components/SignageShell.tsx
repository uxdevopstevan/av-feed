"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSignageConfig } from "@/app/components/SignageConfigProvider";
import SidebarImage from "@/app/components/SidebarImage";
import SignageClient from "@/app/components/SignageClient";

function looksLikeVideoUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes(".m3u8") || u.includes("/hls/") || /\.(mp4|webm|mov|m4v)(?:\?|#|$)/i.test(u);
}

export default function SignageShell() {
  const { config } = useSignageConfig();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    update();
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("cursor-none", isFullscreen);
    return () => {
      document.body.classList.remove("cursor-none");
    };
  }, [isFullscreen]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-black text-white flex">
      <aside
        className="w-1/4 h-full flex flex-col items-center justify-between p-10 relative"
        style={{ backgroundColor: config.themeColor }}
      >
        {config.sidebarBackgroundMediaUrl ? (
          <div className="absolute inset-0 z-0" aria-hidden="true">
            {looksLikeVideoUrl(config.sidebarBackgroundMediaUrl) ? (
              <video
                src={config.sidebarBackgroundMediaUrl}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={config.sidebarBackgroundMediaUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-black/20" />
          </div>
        ) : null}

        {!isFullscreen ? (
          <Link
            href="/config"
            aria-label="Config"
            className="absolute left-6 top-6 z-20 text-white/95 hover:text-white"
          >
            <CogIcon />
          </Link>
        ) : null}

        <div className="w-full flex items-center justify-center pt-2 relative z-10">
          <SidebarImage src={config.logoUrl} alt="Event logo" width={360} height={180} priority />
        </div>

        <div className="w-full flex items-center justify-center relative z-10">
          <SidebarImage src={config.qrUrl} alt="QR code" width={220} height={220} />
        </div>

        <div
          className="text-4xl font-bold text-center px-2 pb-2 relative z-10"
          style={{ color: config.sidebarTextColor }}
        >
          {config.sidebarJoinHeadline}
        </div>
      </aside>

      <section className="w-3/4 h-full flex flex-col">
        <SignageClient />
      </section>
    </div>
  );
}

function CogIcon() {
  return (
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
      <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

