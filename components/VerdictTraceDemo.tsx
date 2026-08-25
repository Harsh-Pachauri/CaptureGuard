"use client";

import { useEffect, useState } from "react";
import { LiveBadge } from "./LiveBadge";
import { useVerdictHighlight } from "./verdict-highlight-context";
import { usePrefersReducedMotion } from "@/lib/motion-hooks";
import { VERDICT_CARD_CLASSES } from "@/lib/verdict";
import { DECISION_CASES } from "@/lib/decision-cases";

const AUTO_ADVANCE_MS = 5500;

export function VerdictTraceDemo() {
  const { setActive: setHighlightedVerdict } = useVerdictHighlight();
  const reducedMotion = usePrefersReducedMotion();
  const [activeId, setActiveId] = useState(DECISION_CASES[0].id);
  const [autoAdvancing, setAutoAdvancing] = useState(true);

  const active = DECISION_CASES.find((c) => c.id === activeId) ?? DECISION_CASES[0];

  useEffect(() => {
    setHighlightedVerdict(active.verdict);
  }, [active.verdict, setHighlightedVerdict]);

  useEffect(() => {
    if (!autoAdvancing || reducedMotion) return;
    const timer = setInterval(() => {
      setActiveId((current) => {
        const index = DECISION_CASES.findIndex((c) => c.id === current);
        return DECISION_CASES[(index + 1) % DECISION_CASES.length].id;
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [autoAdvancing, reducedMotion]);

  function selectCase(id: string) {
    setAutoAdvancing(false); // manual selection takes permanent control of the exhibit
    setActiveId(id);
  }

  return (
    <div className="rounded-2xl border-2 border-slate-900/10 dark:border-slate-100/15 bg-white dark:bg-slate-900/40 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500">
          Replayed · a real recorded decision
        </span>
        <LiveBadge pulseKey={active.id} />
      </div>

      <div className="mt-4 flex gap-1.5" role="tablist" aria-label="Recorded decisions">
        {DECISION_CASES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === active.id}
            onClick={() => selectCase(c.id)}
            className={`flex-1 rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 dark:focus-visible:ring-slate-100/40 ${
              c.id === active.id
                ? "border-slate-900 dark:border-slate-100 bg-slate-900 dark:bg-slate-100"
                : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <div
              className={`text-[10px] font-mono uppercase tracking-wide ${
                c.id === active.id ? "text-white/60 dark:text-slate-900/60" : "text-slate-400 dark:text-slate-500"
              }`}
            >
              {c.ruleId}
            </div>
            <div
              className={`text-xs font-medium ${
                c.id === active.id ? "text-white dark:text-slate-900" : "text-slate-600 dark:text-slate-400"
              }`}
            >
              {c.label}
            </div>
          </button>
        ))}
      </div>

      <div key={active.id} className="mt-5 motion-safe:animate-[trace-in_0.2s_ease-out]">
        <TraceRow index={1} total={3} title="Request" mono={active.request} />
        <TraceRow index={2} total={3} title="AI interprets" mono={active.aiIntent} />
        <TraceRow index={3} total={3} title="Razorpay verifies" mono={active.razorpayField} live />

        <div className="pt-2">
          <div
            className={`rounded-xl border-2 p-4 motion-safe:animate-[verdict-in_0.25s_ease-out] ${VERDICT_CARD_CLASSES[active.verdict]}`}
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tracking-tight">{active.verdict}</span>
              <span className="text-xs font-mono opacity-70">{active.ruleId}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed">{active.explanation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TraceRow({
  index,
  total,
  title,
  mono,
  live,
}: {
  index: number;
  total: number;
  title: string;
  mono: string;
  live?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        {index < total && <span className="mt-1 w-px flex-1 bg-slate-200 dark:bg-slate-800" />}
      </div>
      <div className="flex-1 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-600">0{index}</span>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{title}</span>
          {live && (
            <span className="text-[9px] font-mono uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
              live
            </span>
          )}
        </div>
        <div className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200 break-all">{mono}</div>
      </div>
    </div>
  );
}
