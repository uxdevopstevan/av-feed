"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { SignageConfig } from "@/app/lib/signageConfig";
import {
  DEFAULT_SIGNAGE_CONFIG,
  loadSignageConfigFromLocalStorage,
  saveSignageConfigToLocalStorage,
  SIGNAGE_CONFIG_LS_KEY,
  sanitizeSignageConfig,
} from "@/app/lib/signageConfig";

type Ctx = {
  config: SignageConfig;
  setConfig: (next: SignageConfig) => void;
  resetConfig: () => void;
};

const SignageConfigContext = createContext<Ctx | null>(null);

export function useSignageConfig(): Ctx {
  const v = useContext(SignageConfigContext);
  if (!v) throw new Error("useSignageConfig must be used within SignageConfigProvider");
  return v;
}

export default function SignageConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfigState] = useState<SignageConfig>(DEFAULT_SIGNAGE_CONFIG);

  useEffect(() => {
    setConfigState(loadSignageConfigFromLocalStorage());

    const onStorage = (e: StorageEvent) => {
      if (e.key !== SIGNAGE_CONFIG_LS_KEY) return;
      setConfigState(loadSignageConfigFromLocalStorage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const api = useMemo<Ctx>(() => {
    return {
      config,
      setConfig: (next) => {
        const sanitized = sanitizeSignageConfig(next);
        setConfigState(sanitized);
        saveSignageConfigToLocalStorage(sanitized);
      },
      resetConfig: () => {
        setConfigState(DEFAULT_SIGNAGE_CONFIG);
        saveSignageConfigToLocalStorage(DEFAULT_SIGNAGE_CONFIG);
      },
    };
  }, [config]);

  return <SignageConfigContext.Provider value={api}>{children}</SignageConfigContext.Provider>;
}

