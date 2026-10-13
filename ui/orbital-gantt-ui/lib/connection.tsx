"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import type { ApiConfig } from "./api-client";

const STORAGE_KEY = "schedule-intelligence-connection";
const DEFAULT_CONFIG: ApiConfig = { baseUrl: "/api" };

interface ConnectionContextValue {
  config: ApiConfig | null;
  connect: (config: ApiConfig) => void;
  disconnect: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.baseUrl === "string") {
          const migrated = { ...DEFAULT_CONFIG };
          setConfig(migrated);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } else {
      setConfig(DEFAULT_CONFIG);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
    }
    setHydrated(true);
  }, []);

  const connect = useCallback((next: ApiConfig) => {
    const safe = {
      baseUrl: next.baseUrl || "/api",
      ...(next.authToken ? { authToken: next.authToken } : {}),
      ...(next.embedded ? { embedded: true } : {}),
      ...(next.embedProjectId ? { embedProjectId: next.embedProjectId } : {}),
    };

    setConfig(previous => {
      const same = !!previous
        && previous.baseUrl === safe.baseUrl
        && previous.authToken === safe.authToken
        && previous.embedded === safe.embedded
        && previous.embedProjectId === safe.embedProjectId;

      if (same) return previous;

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
      return safe;
    });
  }, []);

  const disconnect = useCallback(() => {
    setConfig(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const contextValue = useMemo(() => ({ config, connect, disconnect }), [config, connect, disconnect]);

  if (!hydrated) return null;

  return (
    <ConnectionContext.Provider value={contextValue}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}
