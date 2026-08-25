import Link from "next/link";
import { JUDGE_SCENARIOS } from "@/lib/judge/scenarios";

const VERDICT_STYLES: Record<string, string> = {
  BLOCK: "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-300",
  ALLOW: "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300",
  ESCALATE: "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300",
};

export default function TestLabPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-mono uppercase tracking-widest text-slate-400">Judge Demo</div>
        <h1 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Test Lab</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Each scenario below runs through the real, unmodified production pipeline — a real Razorpay Test Mode
          payment, the real Decision Engine, the real Action Guard. Nothing here is scripted or hardcoded; the
          verdict you see is computed live from the payment&apos;s actual state at Razorpay.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {JUDGE_SCENARIOS.map((s) => (
          <Link
            key={s.id}
            href={`/test-lab/run/${s.id}`}
            className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-slate-400 dark:hover:border-slate-600 transition-colors flex flex-col"
          >
            <span className={`inline-flex w-fit items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${VERDICT_STYLES[s.verdict]}`}>
              {s.label}
            </span>
            <div className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">{s.title}</div>
            <p className="mt-2 flex-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{s.description}</p>
            <div className="mt-4 text-xs font-medium text-slate-700 dark:text-slate-300 group-hover:translate-x-0.5 transition-transform">
              Run this scenario →
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        One step can&apos;t be automated away: Razorpay requires an actual authorization at their real Test Mode
        checkout before a payment exists to make a decision about. You&apos;ll be guided through that single step —
        it never moves real money.
      </div>
    </div>
  );
}
