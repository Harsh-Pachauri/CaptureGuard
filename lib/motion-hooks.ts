"use client";

import { useEffect, useRef, useState } from "react";

/** Becomes true once the element scrolls into view. Fires once, never resets. */
export function useInViewOnce<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, options ?? { threshold: 0.3 });

    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, inView };
}

// Reuses the existing useSyncExternalStore-based implementation
// (lib/client/useReducedMotion.ts) rather than a second effect+setState
// version — this repo's lint config (react-hooks/set-state-in-effect)
// forbids calling setState synchronously in an effect body, which a
// literal effect-based version of this hook would trigger. Same
// signature and behavior: true once prefers-reduced-motion is on,
// updates live if the OS setting changes.
export { usePrefersReducedMotion } from "@/lib/client/useReducedMotion";
