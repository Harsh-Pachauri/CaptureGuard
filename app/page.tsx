import Link from "next/link";
import type { ReactNode } from "react";
import { VerdictTraceDemo } from "@/components/VerdictTraceDemo";
import { VerdictHighlightProvider } from "@/components/verdict-highlight-context";
import { VerdictPillGroup } from "@/components/VerdictPillGroup";
import { PipelineStep } from "@/components/PipelineStep";
import { LiveBadge } from "@/components/LiveBadge";
import { type Verdict, VERDICT_CARD_CLASSES } from "@/lib/verdict";
import { DECISION_CASES } from "@/lib/decision-cases";

const R4_CASE = DECISION_CASES.find((c) => c.id === "r4")!;

/**
 * The one place BLOCK/ALLOW/ESCALATE is rendered on the public site — kept
 * as a single component so the hero exhibit and the bottom example are
 * provably the same visual language, not just similarly styled by hand.
 */
function VerdictCard({ verdict, ruleId, explanation }: { verdict: Verdict; ruleId: string; explanation: string }) {
  return (
    <div className={`rounded-xl border-2 p-4 ${VERDICT_CARD_CLASSES[verdict]}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight">{verdict}</span>
        <span className="text-xs font-mono opacity-70">{ruleId}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{explanation}</p>
    </div>
  );
}

function CTALink({ children }: { children: ReactNode }) {
  return (
    <Link
      href="/overview"
      className="group inline-flex items-center rounded-md bg-slate-900 dark:bg-slate-100 px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 dark:focus-visible:ring-slate-100/40"
    >
      {children}
      <span className="ml-1.5 inline-block transition-transform duration-150 ease-out group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 ambient-landing">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <span className="font-semibold text-slate-900 dark:text-slate-100 tracking-tight">🛡 CaptureGuard</span>
          <div className="flex items-center gap-4">
            <Link
              href="/judge"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 dark:focus-visible:ring-slate-100/40 rounded"
            >
              Judge Demo
            </Link>
            <Link
              href="/overview"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 dark:focus-visible:ring-slate-100/40 rounded"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <VerdictHighlightProvider initial={DECISION_CASES[0].verdict}>
        <main className="mx-auto max-w-6xl px-4">
          <section className="py-16 sm:py-20">
            <div className="grid gap-8 lg:grid-cols-[55fr_45fr] lg:gap-12 items-start">
              <div className="order-2 lg:order-1">
                <div className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-500">
                  Razorpay Test Mode · live payment state · deterministic decisions
                </div>
                <h1 className="mt-4 text-4xl sm:text-5xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                  Before AI moves money, CaptureGuard verifies reality.
                </h1>
                <p className="mt-5 text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
                  Most AI support tools ask the AI what happened, and act on its answer. CaptureGuard asks Razorpay
                  what happened, and only lets the AI describe it — refusing to act if the two don&apos;t agree.
                </p>
                <div className="mt-8">
                  <CTALink>See a real decision</CTALink>
                </div>
              </div>

              <div className="order-1 lg:order-2 flex lg:min-h-[480px]">
                <VerdictTraceDemo />
              </div>
            </div>
          </section>

          <section className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/20">
            <div className="py-20 sm:py-24">
              <h2 className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-500">
                How a decision actually happens
              </h2>

              <div className="mt-10 sm:mt-12 max-w-3xl -mb-8">
                <PipelineStep index={1} total={3} title="AI interprets">
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Extract intent from the request.</p>
                </PipelineStep>

                <PipelineStep index={2} total={3} title="Reality is independently checked" emphasize>
                  <div className="mt-2">
                    <LiveBadge label="LIVE · Razorpay payment state" />
                  </div>
                  <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-xl">
                    Every gated decision re-fetches the payment directly from Razorpay. Cached or webhook-delivered
                    state on its own is never sufficient for a money-moving decision — the live fetch is mandatory.
                  </p>
                </PipelineStep>

                <PipelineStep index={3} total={3} title="A verdict fires — only then can money move">
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 mb-3">
                    One of three deterministic outcomes, never a guess:
                  </p>
                  <VerdictPillGroup />
                </PipelineStep>
              </div>
            </div>
          </section>

          <section className="border-t border-slate-200 dark:border-slate-800 py-14">
            <h2 className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-500">
              A real block, not a hypothetical
            </h2>
            <p className="mt-2 text-[10px] font-mono uppercase tracking-widest text-slate-400">
              Verified Test Mode example
            </p>
            <div className="mt-4 max-w-xl">
              <VerdictCard verdict={R4_CASE.verdict} ruleId={R4_CASE.ruleId} explanation={R4_CASE.explanation} />
            </div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 max-w-xl">
              An authorized-but-uncaptured payment inside Razorpay&apos;s own auto-reversal window is blocked from
              manual refund or compensation — this is the Decision Engine&apos;s actual R4 rule, not marketing copy.
            </p>
          </section>

          <section className="border-t border-slate-200 dark:border-slate-800 py-14 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-500">
              Real Razorpay Test Mode APIs. Real live payment state. No simulated data.
            </p>
            <div className="mt-5">
              <CTALink>See a real decision</CTALink>
            </div>
          </section>
        </main>
      </VerdictHighlightProvider>
    </div>
  );
}
