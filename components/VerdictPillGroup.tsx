"use client";

import { useVerdictHighlight } from "./verdict-highlight-context";
import { type Verdict, VERDICT_PILL_CLASSES } from "@/lib/verdict";

const ALL_VERDICTS: Verdict[] = ["ALLOW", "BLOCK", "ESCALATE"];

export function VerdictPillGroup() {
  const { active } = useVerdictHighlight();

  return (
    <div className="flex flex-wrap gap-2">
      {ALL_VERDICTS.map((verdict) => (
        <span
          key={verdict}
          className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold transition-all duration-200 ${
            VERDICT_PILL_CLASSES[verdict]
          } ${
            verdict === active
              ? "ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-950 ring-slate-900/30 dark:ring-slate-100/30"
              : "opacity-50"
          }`}
        >
          {verdict}
        </span>
      ))}
    </div>
  );
}
