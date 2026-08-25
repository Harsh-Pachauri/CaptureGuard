"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Verdict } from "@/lib/verdict";

type VerdictHighlightState = {
  active: Verdict;
  setActive: (verdict: Verdict) => void;
};

const VerdictHighlightContext = createContext<VerdictHighlightState | null>(null);

/**
 * Shares "which verdict is currently on screen in the hero demo" with the
 * static ALLOW/BLOCK/ESCALATE legend further down the page, so the two
 * sections visibly behave like one system instead of two unrelated blocks.
 */
export function VerdictHighlightProvider({ children, initial }: { children: ReactNode; initial: Verdict }) {
  const [active, setActive] = useState<Verdict>(initial);
  return (
    <VerdictHighlightContext.Provider value={{ active, setActive }}>{children}</VerdictHighlightContext.Provider>
  );
}

export function useVerdictHighlight() {
  const ctx = useContext(VerdictHighlightContext);
  if (!ctx) {
    throw new Error("useVerdictHighlight must be used within a VerdictHighlightProvider");
  }
  return ctx;
}
