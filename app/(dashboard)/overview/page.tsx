"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client/apiClient";

interface Payment {
  id: string;
  status: string;
  dataSource: string;
}
interface SupportQuery {
  id: string;
}
interface AuditEvent {
  id: string;
}
interface EvalMetrics {
  totalCases: number;
  falseAllowRate: number;
  falseBlockRate: number;
  unsafeActionsPreventedCount: number;
  moneyProtectedPaise: number;
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "default" }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-2 text-3xl font-semibold tabular-nums ${tone === "danger" ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

export default function OverviewPage() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [queries, setQueries] = useState<SupportQuery[] | null>(null);
  const [blocks, setBlocks] = useState<AuditEvent[] | null>(null);
  const [evalMetrics, setEvalMetrics] = useState<EvalMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ payments: Payment[] }>("/api/payments?limit=200"),
      apiFetch<{ queries: SupportQuery[] }>("/api/support-queries?limit=200"),
      apiFetch<{ events: AuditEvent[] }>("/api/audit?eventType=action_blocked&limit=500"),
      apiFetch<{ metrics: EvalMetrics | null }>("/api/eval/latest"),
    ])
      .then(([p, q, b, e]) => {
        setPayments(p.payments);
        setQueries(q.queries);
        setBlocks(b.events);
        setEvalMetrics(e.metrics);
      })
      .catch((err) => setError(err.message));
  }, []);

  const realPayments = payments?.filter((p) => p.dataSource === "real") ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Overview</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          CaptureGuard blocks unsafe refund/compensation actions when a payment&apos;s real Razorpay state already
          explains what happened.
        </p>
      </div>

      {error ? <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {/* Headline stat — the number that actually demonstrates the product's
          value, given the visual weight it deserves instead of sitting as
          one of four equal tiles. Same evalMetrics.moneyProtectedPaise the
          Evaluation Dashboard computes; nothing recalculated here. */}
      <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-6">
        <div className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          Duplicate-payout risk prevented
        </div>
        <div className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight tabular-nums text-emerald-900 dark:text-emerald-200">
          {evalMetrics ? `₹${(evalMetrics.moneyProtectedPaise / 100).toLocaleString("en-IN")}` : "—"}
        </div>
        <div className="mt-1 text-sm text-emerald-800/80 dark:text-emerald-300/80">
          {evalMetrics
            ? `across a ${evalMetrics.totalCases}-case evaluation batch · false-allow rate ${(evalMetrics.falseAllowRate * 100).toFixed(0)}%`
            : "run an evaluation to compute this"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Tile label="Payments synced" value={payments ? String(realPayments.length) : "…"} sub={`${payments?.length ?? 0} total incl. demo/eval`} />
        <Tile label="Queries handled" value={queries ? String(queries.length) : "…"} />
        <Tile label="Blocks issued" value={blocks ? String(blocks.length) : "…"} tone="danger" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/inbox" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-slate-400 dark:hover:border-slate-600 transition-colors">
          <div className="font-medium text-slate-900 dark:text-slate-100">Support Inbox →</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Submit a customer query and see ALLOW / BLOCK / ESCALATE live.</div>
        </Link>
        <Link href="/payments" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-slate-400 dark:hover:border-slate-600 transition-colors">
          <div className="font-medium text-slate-900 dark:text-slate-100">Payments →</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Real, live-fetched Razorpay state for every synced payment.</div>
        </Link>
        <Link href="/eval" className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-slate-400 dark:hover:border-slate-600 transition-colors">
          <div className="font-medium text-slate-900 dark:text-slate-100">Evaluation Dashboard →</div>
          <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">Re-run the eval batch and see false-allow/false-block rates.</div>
        </Link>
      </div>
    </div>
  );
}
