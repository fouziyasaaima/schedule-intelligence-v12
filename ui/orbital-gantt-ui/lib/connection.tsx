"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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

  const connect = (next: ApiConfig) => {
    const safe = { baseUrl: next.baseUrl || "/api" };
    setConfig(safe);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  };

  const disconnect = () => {
    setConfig(null);
    window.localStorage.removeItem(STORAGE_KEY);
  };

  if (!hydrated) return null;

  return (
    <ConnectionContext.Provider value={{ config, connect, disconnect }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  const ctx = useContext(ConnectionContext);
  if (!ctx) throw new Error("useConnection must be used within ConnectionProvider");
  return ctx;
}
