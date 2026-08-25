import type { Verdict } from "@/lib/decision-engine/types";
import { VERDICT_STYLES } from "@/components/badges";

export type { Verdict };

// The exact color set already used for verdict badges on the Decision
// Panel, Payment Detail, and Audit pages (components/badges.tsx's
// VERDICT_STYLES) — re-exported under this name for the landing page's
// pill group rather than duplicating the class strings a second time.
export const VERDICT_PILL_CLASSES: Record<Verdict, string> = VERDICT_STYLES as Record<Verdict, string>;

// Bigger/bolder card treatment specific to the landing page's hero
// exhibit and bottom example — a visually distinct element from the
// dashboard's small inline badge (2xl verdict text vs. a compact pill),
// so it gets its own higher-contrast class set rather than reusing the
// badge's smaller-scale styling.
export const VERDICT_CARD_CLASSES: Record<Verdict, string> = {
  ALLOW:
    "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200",
  BLOCK: "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-200",
  ESCALATE:
    "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-200",
};
