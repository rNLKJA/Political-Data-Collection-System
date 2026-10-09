"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { hasActiveKey, type AiSettings } from "@/lib/ai/settings";
import { aiSettingsStore } from "@/lib/ai/settings-store";

import { AiSettingsDialog } from "./ai-settings-dialog";

interface AiContextValue {
  openSettings: () => void;
}

const AiContext = createContext<AiContextValue>({ openSettings: () => {} });

/**
 * Holds the one AI settings dialog for the whole site. AI features are
 * optional: nothing here runs, and no request is made, until a visitor adds
 * their own key and starts a run.
 */
export function AiProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // Several buttons open the dialog, so remember which one and give focus back.
  const opener = useRef<HTMLElement | null>(null);
  const openSettings = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    const el = opener.current;
    opener.current = null;
    if (el?.isConnected && el !== document.body) el.focus();
  }, []);
  return (
    <AiContext.Provider value={{ openSettings }}>
      {children}
      <AiSettingsDialog open={open} onClose={close} />
    </AiContext.Provider>
  );
}

/** The visitor's AI settings (server render: defaults, no key) and a way to open the dialog. */
export function useAi(): AiContextValue & { settings: AiSettings; hasKey: boolean } {
  const settings = useSyncExternalStore(
    aiSettingsStore.subscribe,
    aiSettingsStore.getSnapshot,
    aiSettingsStore.getServerSnapshot,
  );
  const { openSettings } = useContext(AiContext);
  return { settings, hasKey: hasActiveKey(settings), openSettings };
}
