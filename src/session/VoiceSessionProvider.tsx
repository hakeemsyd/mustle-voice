import React, { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useVoiceSession, type SpokenMessage, type VoiceSessionConfig } from "../hooks/useVoiceSession";

interface SharedVoiceSessionValue extends ReturnType<typeof useVoiceSession> {
  setMessageHandler: (handler: ((message: SpokenMessage) => void) | null) => void;
  setSessionConfig: (config: VoiceSessionConfig | null) => void;
}

const VoiceSessionContext = createContext<SharedVoiceSessionValue | null>(null);

// Screens re-register their config on every run of an effect that (necessarily) depends on the
// context's own setters, so an unchanged config must not count as a state change — otherwise
// setConfig → provider re-render → new context value → the screen's effect re-runs → setConfig
// again, forever ("Maximum update depth exceeded" on Home). Compared by value, not identity,
// because every caller builds a fresh object literal.
function sameConfig(a: VoiceSessionConfig | null, b: VoiceSessionConfig | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.userId !== b.userId) return false;
  const av = a.dynamicVariables ?? {};
  const bv = b.dynamicVariables ?? {};
  const aKeys = Object.keys(av);
  if (aKeys.length !== Object.keys(bv).length) return false;
  return aKeys.every((k) => av[k] === bv[k]);
}

/** One real ElevenLabs conversation for the whole app (the underlying connection is already an
 *  app-wide singleton via ConversationProvider) — this wraps the single useVoiceSession() call
 *  that owns it, so screens register/deregister as the current message handler and session
 *  config instead of each mounting their own competing instance. Previously HomeScreen and
 *  ActiveSessionScreen each called useVoiceSession() independently, with their own reconnect/
 *  idle-timeout bookkeeping, which is what caused voice to disconnect (and require a manual
 *  re-tap) on the Home-to-ActiveSession transition. */
export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<((message: SpokenMessage) => void) | null>(null);
  const [config, setConfig] = useState<VoiceSessionConfig | null>(null);
  const voice = useVoiceSession((message) => handlerRef.current?.(message), config ?? undefined);

  // Both setters must keep a stable identity across renders: consumers list them in effect
  // dependency arrays, and a fresh closure each render would re-run those effects on every
  // provider render (see sameConfig above).
  const setMessageHandler = useCallback((handler: ((message: SpokenMessage) => void) | null) => {
    handlerRef.current = handler;
  }, []);

  const setSessionConfig = useCallback((next: VoiceSessionConfig | null) => {
    setConfig((prev) => (sameConfig(prev, next) ? prev : next));
  }, []);

  const value: SharedVoiceSessionValue = { ...voice, setMessageHandler, setSessionConfig };

  return <VoiceSessionContext.Provider value={value}>{children}</VoiceSessionContext.Provider>;
}

export function useSharedVoiceSession(): SharedVoiceSessionValue {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) throw new Error("useSharedVoiceSession must be used within VoiceSessionProvider");
  return ctx;
}
