"use client";

import { useState } from "react";

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
};

export default function SidebarImage({
  src,
  alt,
  width,
  height,
}: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        aria-label={alt}
        className="flex items-center justify-center rounded-xl bg-white/15 text-white/90"
        style={{ width, height }}
      >
        <div className="text-2xl font-bold tracking-tight">Asset missing</div>
      </div>
    );
  }

  return (
    // Use a plain <img> so missing placeholder assets don't hit Next's image optimizer.
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      onError={() => setFailed(true)}
      className="object-contain"
    />
  );
}

