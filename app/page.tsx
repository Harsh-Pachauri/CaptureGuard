import Link from "next/link";

type Verdict = "ALLOW" | "BLOCK" | "ESCALATE";

const VERDICT_COLORS: Record<Verdict, string> = {
  ALLOW: "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200",
  BLOCK: "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-200",
  ESCALATE: "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-900 dark:text-amber-200",
};

const R4_EXPLANATION =
  "Razorpay is already reversing this payment automatically. Refunding it now could double-pay the customer.";

/**
 * The one place BLOCK/ALLOW/ESCALATE is rendered on the public site — kept
 * as a single component so the hero exhibit and the bottom example are
 * provably the same visual language, not just similarly styled by hand.
 */
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
 * Static "Verdict Trace" exhibit — deliberately not wired to any API. No
 * payment id, amount, or timestamp is invented; only the categorical facts
 * that actually drive R4 (status, captured, window) are shown, matching
 * lib/decision-engine/rules.ts's real R4 condition exactly.
 */
function VerdictTrace() {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/30 p-5 sm:p-6 space-y-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Verified Test Mode example</div>

      <div>
        <div className="text-[10px] font-mono uppercase tracking-wide text-slate-400 mb-1">Customer request</div>
        <p className="text-sm text-slate-700 dark:text-slate-300">&ldquo;Please refund my payment.&rdquo;</p>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white/40 dark:bg-slate-950/30 p-3">
        <div className="text-[10px] font-mono uppercase tracking-wide text-slate-400 mb-1.5">AI interpretation — not authoritative</div>
        <div className="font-mono text-xs text-slate-500 dark:text-slate-500 space-y-0.5">
          <div>intent: <span className="text-slate-700 dark:text-slate-300">refund_request</span></div>
          <div>requested_action: <span className="text-slate-700 dark:text-slate-300">refund</span></div>
        </div>
      </div>

      <div className="rounded-lg border-2 border-slate-900/15 dark:border-slate-100/20 bg-white dark:bg-slate-950 p-3.5">
        <div className="text-[10px] font-mono uppercase tracking-wide text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
          LIVE · RAZORPAY
        </div>
        <div className="font-mono text-xs text-slate-800 dark:text-slate-200 space-y-0.5">
          <div>status: <span className="font-semibold">authorized</span></div>
          <div>captured: <span className="font-semibold">false</span></div>
          <div>window: <span className="font-semibold">within auto-reversal window</span></div>
        </div>
      </div>

      <VerdictCard verdict="BLOCK" ruleId="R4" explanation={R4_EXPLANATION} />
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <span className="font-semibold text-slate-900 dark:text-slate-100 tracking-tight">🛡 CaptureGuard</span>
          <Link
            href="/overview"
            className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <section className="py-16 sm:py-20">
          <div className="grid gap-10 lg:grid-cols-[55fr_45fr] lg:gap-12 items-start">
            <div>
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
                <Link
                  href="/overview"
                  className="inline-flex items-center rounded-md bg-slate-900 dark:bg-slate-100 px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90"
                >
                  See a real decision →
                </Link>
              </div>
            </div>

            <VerdictTrace />
          </div>
        </section>

        <section className="border-t border-slate-200 dark:border-slate-800 py-14">
          <h2 className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-500">
            How a decision actually happens
          </h2>

          <div className="mt-8 space-y-8">
            <div className="flex gap-4 items-start">
              <div className="text-xs font-mono text-slate-400 dark:text-slate-600 pt-0.5 shrink-0 w-8">01</div>
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">AI interprets</div>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Extract intent from the request.</p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="text-xs font-mono text-slate-400 dark:text-slate-600 pt-0.5 shrink-0 w-8">02</div>
              <div className="flex-1 rounded-xl border-2 border-slate-900/15 dark:border-slate-100/20 bg-slate-50 dark:bg-slate-900/40 p-5">
                <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Reality is independently checked
                </div>
                <div className="mt-2 text-xs font-mono uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  LIVE · Razorpay payment state
                </div>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed max-w-xl">
                  Every gated decision re-fetches the payment directly from Razorpay. Cached or webhook-delivered
                  state on its own is never sufficient for a money-moving decision — the live fetch is mandatory.
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="text-xs font-mono text-slate-400 dark:text-slate-600 pt-0.5 shrink-0 w-8">03</div>
              <div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  A verdict fires — only then can money move
                </div>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 mb-3">
                  One of three deterministic outcomes, never a guess:
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-md border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                    ALLOW
                  </span>
                  <span className="inline-flex items-center rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-2.5 py-1 text-xs font-semibold text-red-800 dark:text-red-300">
                    BLOCK
                  </span>
                  <span className="inline-flex items-center rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    ESCALATE
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 dark:border-slate-800 py-14">
          <div className="max-w-2xl">
            <p className="text-lg text-slate-800 dark:text-slate-200 leading-relaxed">
              Most AI support tools ask the AI what happened, and act on the answer.
            </p>
            <p className="mt-3 text-lg text-slate-800 dark:text-slate-200 leading-relaxed">
              CaptureGuard asks Razorpay what happened, and only lets the AI describe it.
            </p>
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
            <VerdictCard verdict="BLOCK" ruleId="R4" explanation={R4_EXPLANATION} />
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
            <Link
              href="/overview"
              className="inline-flex items-center rounded-md bg-slate-900 dark:bg-slate-100 px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90"
            >
              See a real decision →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
