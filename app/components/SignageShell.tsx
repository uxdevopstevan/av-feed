"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSignageConfig } from "@/app/components/SignageConfigProvider";
import SidebarImage from "@/app/components/SidebarImage";
import SignageClient from "@/app/components/SignageClient";

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
        {!isFullscreen ? (
          <Link
            href="/config"
            className="absolute left-6 top-6 z-20 rounded-xl bg-black/35 hover:bg-black/50 border border-white/20 px-5 py-3 text-white backdrop-blur-md text-2xl font-bold"
          >
            Config
          </Link>
        ) : null}

        <div className="w-full flex items-center justify-center pt-2">
          <SidebarImage src={config.logoUrl} alt="Event logo" width={360} height={180} priority />
        </div>

        <div className="w-full flex items-center justify-center">
          <SidebarImage src={config.qrUrl} alt="QR code" width={220} height={220} />
        </div>

        <div className="text-4xl font-bold text-center px-2 pb-2">Scan to join the live feed!</div>
      </aside>

      <section className="w-3/4 h-full flex flex-col">
        <SignageClient />
      </section>
    </div>
  );
}

