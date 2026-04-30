"use client";

import SignageConfigProvider from "@/app/components/SignageConfigProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SignageConfigProvider>{children}</SignageConfigProvider>;
}

