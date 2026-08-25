"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tracks which ids in `ids` are genuinely new since the last time this hook
 * saw a non-empty id list, and returns that set for one `highlightMs`
 * window before clearing it. No polling: it only reacts to `ids` changing,
 * which only happens when the caller's own data refetch (e.g. "Re-sync
 * from Razorpay") already ran. The first non-empty population is treated
 * as the baseline, not as "new" — otherwise every node would flash on
 * initial load, duplicating useStaggerReveal's job.
 */
export function useNewlyAdded(ids: string[], highlightMs = 1200): Set<string> {
  const knownIds = useRef<Set<string> | null>(null);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const key = ids.join(",");

  useEffect(() => {
    if (ids.length === 0) return;
    if (knownIds.current === null) {
      knownIds.current = new Set(ids);
      return;
    }
    const prev = knownIds.current;
    const newOnes = ids.filter((id) => !prev.has(id));
    knownIds.current = new Set(ids);
    if (newOnes.length === 0) return;
    setHighlighted(new Set(newOnes));
    const t = setTimeout(() => setHighlighted(new Set()), highlightMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, highlightMs]);

  return highlighted;
}
