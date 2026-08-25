"use client";

import { useState } from "react";
import { useStaggerReveal } from "@/lib/client/useStaggerReveal";

type Verdict = "ALLOW" | "BLOCK" | "ESCALATE";

const VERDICT_COLORS: Record<Verdict, string> = {
  ALLOW: "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200",
  BLOCK: "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-200",
  ESCALATE: "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-200",
};

interface Scenario {
  key: string;
  tabLabel: string;
  request: string;
  aiInterpretation: { intent: string; requestedAction: string } | null;
  aiNote: string;
  evidence: { status: string; captured: string; window: string };
  verdict: Verdict;
  ruleId: string;
  explanation: string;
}

/**
 * Three real Decision Engine outcomes (lib/decision-engine/rules.ts R4,
 * R9, R11), paraphrased the same honest way the original static R4
 * exhibit was: only the categorical facts that actually drive each rule,
 * no invented payment id/amount/timestamp. Capture scenarios have no "AI
 * interpretation" because capture requests genuinely skip AI extraction
 * in this codebase (they name an exact payment, not free text) — shown
 * as an explicit "not applicable" rather than fabricating intent/
 * requested_action fields that don't exist for that path.
 */
const SCENARIOS: Scenario[] = [
  {
    key: "refund",
    tabLabel: "Refund",
    request: '"Please refund my payment."',
    aiInterpretation: { intent: "refund_request", requestedAction: "refund" },
    aiNote: "",
    evidence: { status: "authorized", captured: "false", window: "within auto-reversal window" },
    verdict: "BLOCK",
    ruleId: "R4",
    explanation:
      "Razorpay is already reversing this payment automatically. Refunding it now could double-pay the customer.",
  },
  {
    key: "capture",
    tabLabel: "Capture",
    request: "Merchant requests capture on an authorized, uncaptured payment.",
    aiInterpretation: null,
    aiNote: "Not applicable — capture names an exact payment, so there's nothing for AI to interpret.",
    evidence: { status: "authorized", captured: "false", window: "within auto-reversal window" },
    verdict: "ALLOW",
    ruleId: "R9",
    explanation:
      "Authorized, not yet captured, and within the auto-reversal window. Capturing now is the ordinary case — proceeding calls Razorpay's real Capture API once confirmed.",
  },
  {
    key: "failed",
    tabLabel: "Failed payment",
    request: "Merchant requests capture on this payment.",
    aiInterpretation: null,
    aiNote: "Not applicable — capture names an exact payment, so there's nothing for AI to interpret.",
    evidence: { status: "failed", captured: "false", window: "—" },
    verdict: "ESCALATE",
    ruleId: "R11",
    explanation:
      "Doesn't match the known-safe capture pattern (authorized, uncaptured, within the window). Rather than guess, this is flagged for a human to check the Razorpay Dashboard directly.",
  },
];

function VerdictCard({ verdict, ruleId, explanation }: { verdict: Verdict; ruleId: string; explanation: string }) {
  return (
    <div className={`rounded-xl border-2 p-4 ${VERDICT_COLORS[verdict]}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight">{verdict}</span>
        <span className="text-xs font-mono opacity-70">{ruleId}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{explanation}</p>
    </div>
  );
}

/**
 * Interactive Verdict Trace exhibit: three selectable real scenarios
 * driving the same 4-stage layout. Deliberately not wired to any API —
 * switching tabs only swaps which static scenario object is shown, no
 * Razorpay call, no Decision Engine execution. Reuses useStaggerReveal
 * exactly as it's used in the Decision Panel, keyed on the scenario so it
 * replays on every tab switch.
 */
export function VerdictTraceDemo() {
  const [selected, setSelected] = useState(0);
  const scenario = SCENARIOS[selected];
  const revealed = useStaggerReveal(4, scenario.key, 55);
  const stage = (n: number) =>
    `transition-all duration-200 ease-out motion-reduce:transition-none motion-reduce:duration-0 ${
      revealed > n ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
    }`;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Verified Test Mode example</div>
        <div className="flex gap-1" role="tablist" aria-label="Example scenario">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={i === selected}
              onClick={() => setSelected(i)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-150 ease-out motion-reduce:transition-none ${
                i === selected
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {s.tabLabel}
            </button>
          ))}
        </div>
      </div>

      <div className={stage(0)}>
        <div className="text-[10px] font-mono uppercase tracking-wide text-slate-400 mb-1">Request</div>
        <p className="text-sm text-slate-700 dark:text-slate-300">{scenario.request}</p>
      </div>

      <div className={`rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white/40 dark:bg-slate-950/30 p-3 ${stage(1)}`}>
        <div className="text-[10px] font-mono uppercase tracking-wide text-slate-400 mb-1.5">AI interpretation — not authoritative</div>
        {scenario.aiInterpretation ? (
          <div className="font-mono text-xs text-slate-500 dark:text-slate-500 space-y-0.5">
            <div>intent: <span className="text-slate-700 dark:text-slate-300">{scenario.aiInterpretation.intent}</span></div>
            <div>requested_action: <span className="text-slate-700 dark:text-slate-300">{scenario.aiInterpretation.requestedAction}</span></div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-500">{scenario.aiNote}</p>
        )}
      </div>

      <div className={`rounded-lg border-2 border-slate-900/15 dark:border-slate-100/20 bg-white dark:bg-slate-950 p-3.5 ${stage(2)}`}>
        <div className="text-[10px] font-mono uppercase tracking-wide text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
          LIVE · RAZORPAY
        </div>
        <div className="font-mono text-xs text-slate-800 dark:text-slate-200 space-y-0.5">
          <div>status: <span className="font-semibold">{scenario.evidence.status}</span></div>
          <div>captured: <span className="font-semibold">{scenario.evidence.captured}</span></div>
          <div>window: <span className="font-semibold">{scenario.evidence.window}</span></div>
        </div>
      </div>

      <div className={stage(3)}>
        <VerdictCard verdict={scenario.verdict} ruleId={scenario.ruleId} explanation={scenario.explanation} />
      </div>
    </div>
  );
}
