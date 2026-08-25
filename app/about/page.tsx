import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { PipelineStep } from "@/components/PipelineStep";
import { LiveBadge } from "@/components/LiveBadge";
import { type Verdict, VERDICT_CARD_CLASSES } from "@/lib/verdict";
import { DECISION_CASES } from "@/lib/decision-cases";

function VerdictCard({ verdict, ruleId, explanation }: { verdict: Verdict; ruleId: string; explanation: string }) {
  return (
    <div className={`rounded-xl border-2 p-4 ${VERDICT_CARD_CLASSES[verdict]}`}>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold tracking-tight">{verdict}</span>
        <span className="text-xs font-mono opacity-70">{ruleId}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">{explanation}</p>
    </div>
  );
}

function CTALink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center rounded-md bg-slate-900 dark:bg-slate-100 px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/40 dark:focus-visible:ring-slate-100/40"
    >
      {children}
      <span className="ml-1.5 inline-block transition-transform duration-150 ease-out group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-500">{children}</div>
  );
}

export const metadata = {
  title: "About — CaptureGuard",
  description: "What CaptureGuard is, the problem it solves, and how it keeps AI from moving money unsafely.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 ambient-neutral">
      <header className="border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center justify-between">
          <Link href="/" className="font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
            <Logo size={20} /> CaptureGuard
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/judge"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
            >
              Judge Demo
            </Link>
            <Link
              href="/overview"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4">
        {/* What CaptureGuard is */}
        <section className="py-16 sm:py-20">
          <Eyebrow>What this is</Eyebrow>
          <h1 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            A safety layer between AI support agents and real money.
          </h1>
          <p className="mt-5 text-lg text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            CaptureGuard sits between an AI support workflow and Razorpay. It lets AI read and interpret a customer
            or merchant request, but it never lets AI decide, on its own, whether a refund, compensation, or
            capture should actually happen. That decision is made by a small, deterministic rule engine — reading
            Razorpay&apos;s own live payment state, not the AI&apos;s account of it.
          </p>
        </section>

        {/* The problem */}
        <section className="border-t border-slate-200 dark:border-slate-800 py-14">
          <Eyebrow>The problem</Eyebrow>
          <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">
            AI is good at understanding requests. It is not a source of truth about money.
          </h2>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            An AI support agent can read &ldquo;refund my payment&rdquo; and correctly understand the intent. What
            it cannot reliably know is the payment&apos;s actual current state at the payment processor —
            whether it was already refunded, whether Razorpay is already auto-reversing it, whether it even
            succeeded. When an AI system is trusted to both interpret a request <em>and</em> decide the outcome,
            any gap between what it believes and what actually happened at Razorpay becomes a real, unrecoverable
            money mistake: a double refund, a duplicate payout, an action taken against a payment that was never
            captured in the first place.
          </p>
        </section>

        {/* Core principle */}
        <section className="border-t border-slate-200 dark:border-slate-800 py-14">
          <Eyebrow>The core principle</Eyebrow>
          <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">
            AI interprets. Razorpay&apos;s live state decides.
          </h2>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            CaptureGuard draws a hard line between those two jobs. AI extraction produces a proposed intent — never
            authoritative, always labeled as such. Every gated decision then re-fetches the payment directly from
            Razorpay before anything is decided; cached data or a previously-received webhook is never treated as
            sufficient on its own. The rule engine that turns that live state into a verdict is fixed and
            deterministic — the same payment state and request always produce the same outcome, every time.
          </p>
        </section>

        {/* Decision flow */}
        <section className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/20">
          <div className="py-16">
            <Eyebrow>How a decision actually happens</Eyebrow>
            <div className="mt-8 max-w-2xl -mb-8">
              <PipelineStep index={1} total={7} title="AI interprets">
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  Extracts intent from a free-text request — never authoritative, always labeled as such.
                </p>
              </PipelineStep>
              <PipelineStep index={2} total={7} title="Live Razorpay verification" emphasize>
                <div className="mt-2">
                  <LiveBadge label="LIVE · Razorpay payment state" />
                </div>
                <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  The payment is re-fetched directly from Razorpay. This call is mandatory — nothing downstream
                  runs on cached or webhook-only state.
                </p>
              </PipelineStep>
              <PipelineStep index={3} total={7} title="Deterministic Decision Engine">
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  A fixed, strictly-ordered rule table evaluates the live state. No model, no randomness — the
                  same input always produces the same rule and the same verdict.
                </p>
              </PipelineStep>
              <PipelineStep index={4} total={7} title="Verdict: ALLOW / BLOCK / ESCALATE">
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  Exactly one of three outcomes. There is no fourth option and no partial verdict.
                </p>
              </PipelineStep>
              <PipelineStep index={5} total={7} title="Action Guard">
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  The sole gateway to a real mutation. It re-checks the verdict itself, server-side, every time —
                  it never trusts that a prior check (like a greyed-out button) still holds.
                </p>
              </PipelineStep>
              <PipelineStep index={6} total={7} title="Razorpay mutation, only if ALLOW">
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  The real Refunds or Capture API call — issued only after an explicit confirmation step, never as
                  a side effect of the decision itself.
                </p>
              </PipelineStep>
              <PipelineStep index={7} total={7} title="Webhook + audit evidence">
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  Razorpay&apos;s own signed webhook and an append-only audit log record what actually happened —
                  independent confirmation, not a self-report.
                </p>
              </PipelineStep>
            </div>
          </div>
        </section>

        {/* Why it's safe */}
        <section className="border-t border-slate-200 dark:border-slate-800 py-14">
          <Eyebrow>Why this is safe</Eyebrow>
          <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">
            AI can propose. It cannot move money.
          </h2>
          <div className="mt-6 space-y-5 max-w-2xl">
            <div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Only one narrow path can touch Razorpay&apos;s money-moving APIs
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                A single mutation gateway (Action Guard) plus a single Razorpay mutation client are the only code
                in the system permitted to call a real Refund or Capture endpoint. Nothing else in the codebase —
                including the AI extraction step — has that capability.
              </p>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Every mutation re-checks the verdict, server-side, at the moment it executes
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                A BLOCK is never bypassable except through an explicit override step that requires a typed,
                non-empty reason — and that override is itself a permanently recorded event, not a silent
                exception.
              </p>
            </div>
            <div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Stale, missing, or ambiguous state never becomes an ALLOW
              </div>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                If the live Razorpay fetch fails, if the request can&apos;t be matched to a payment with
                confidence, or if the payment&apos;s state simply doesn&apos;t match a known-safe pattern, the
                system escalates for a human to look directly — it never guesses toward permission.
              </p>
            </div>
          </div>
        </section>

        {/* Real scenarios */}
        <section className="border-t border-slate-200 dark:border-slate-800 py-14">
          <Eyebrow>The rules, not a demo script</Eyebrow>
          <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">
            Three real outcomes from the same payment shape
          </h2>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            These are real rules from the Decision Engine, not marketing copy — the same three you can run
            end-to-end yourself in the Test Lab.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {DECISION_CASES.map((c) => (
              <VerdictCard key={c.id} verdict={c.verdict} ruleId={c.ruleId} explanation={c.explanation} />
            ))}
          </div>
        </section>

        {/* Real evidence */}
        <section className="border-t border-slate-200 dark:border-slate-800 py-14">
          <Eyebrow>Not a simulation</Eyebrow>
          <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">
            Every verdict traces back to something real
          </h2>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            The payments behind every decision are real Razorpay Test Mode payments, authorized through
            Razorpay&apos;s own Checkout. Incoming webhooks are verified against Razorpay&apos;s HMAC signature
            before anything is trusted, and every decision, block, override, and mutation is written to an
            append-only audit log — viewable in the dashboard, not just asserted.
          </p>
        </section>

        {/* Technology */}
        <section className="border-t border-slate-200 dark:border-slate-800 py-14">
          <Eyebrow>Technology</Eyebrow>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl">
            Next.js (App Router) and TypeScript throughout; PostgreSQL via Prisma for payments, decisions,
            actions, and the audit log; HttpOnly session cookies for dashboard auth; a real Razorpay Test Mode
            integration for orders, payments, refunds, captures, and webhooks. AI extraction is provider-agnostic
            (Anthropic or Gemini) and optional — with no provider configured, the system runs on a deterministic
            keyword fallback matcher instead of failing.
          </p>
        </section>

        {/* CTA */}
        <section className="border-t border-slate-200 dark:border-slate-800 py-16 text-center">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">See it decide, live.</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            The Judge Demo runs the real pipeline end-to-end — a real Razorpay Test Mode payment, the real
            Decision Engine, the real Action Guard.
          </p>
          <div className="mt-6">
            <CTALink href="/judge">Open the Judge Demo</CTALink>
          </div>
        </section>
      </main>
    </div>
  );
}
