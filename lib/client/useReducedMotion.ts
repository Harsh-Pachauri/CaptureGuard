"use client";

import { useSyncExternalStore } from "react";

/**
 * Single shared source of truth for prefers-reduced-motion, used by every
 * JS-driven stagger/reveal in the app (Tailwind's `motion-reduce:` variant
 * handles pure-CSS transitions on its own; this is for the setTimeout-based
 * sequencing that variant can't reach). Follows the same
 * useSyncExternalStore pattern already used for reading external browser
 * state elsewhere in this app (lib/client/apiClient.ts's old token hook) —
 * SSR-safe, no effect+setState needed.
 */
function subscribe(callback: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
