"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./useReducedMotion";

/**
 * Reveals `count` already-arrived items one-by-one, fast, exactly once per
 * `resetKey` (a query/payment id) — never replays on a refetch of the same
 * record.
 *
 * This is presentation only: everything it reveals has already fully
 * arrived in one API response by the time it runs. It sequences the
 * *display* of already-known data in reading order — an honest way to
 * present it, not a simulation of separate real-time backend stages the
 * app doesn't actually expose to the client.
 *
 * Resets via React's own documented "adjusting state during render"
 * pattern (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
 * rather than an effect — comparing resetKey to the previous render's key
 * and conditionally calling setState mid-render is the React-sanctioned
 * way to do this without an extra render pass or a ref read during
 * render (both of which this project's lint config forbids). The
 * setTimeout effect below only ever calls setState from inside its
 * callbacks, never synchronously in the effect body.
 */
export function useStaggerReveal(count: number, resetKey: string, stepMs = 70): number {
  const reducedMotion = usePrefersReducedMotion();
  const [prevKey, setPrevKey] = useState(resetKey);
  const [revealed, setRevealed] = useState(() => (reducedMotion ? count : 0));

  if (resetKey !== prevKey) {
    setPrevKey(resetKey);
    setRevealed(reducedMotion ? count : 0);
  }

  useEffect(() => {
    if (reducedMotion || count <= 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= count; i++) {
      timers.push(setTimeout(() => setRevealed(i), i * stepMs));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, resetKey, reducedMotion]);

  return Math.min(revealed, count);
}
