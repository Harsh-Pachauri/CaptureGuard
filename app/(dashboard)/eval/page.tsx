"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/apiClient";

interface EvalCase {
  id: string;
  category: string;
  isAdversarial: boolean;
}
interface EvalRunInfo {
  id: string;
  startedAt: string;
  finishedAt: string | null;
}
interface EvalMetrics {
  totalCases: number;
  intentAccuracy: number | null;
  matchAccuracy: number | null;
  verdictAccuracy: number;
  falseBlockRate: number;
  falseAllowRate: number;
  escalationRate: number;
  unsafeActionsPreventedCount: number;
  moneyProtectedPaise: number;
  responseGroundingRate: number | null;
  byCategory: Record<string, { total: number; correctVerdict: number }>;
}

type MetricsSource = "stored" | "fresh";

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

function MetricTile({ label, value, tone, big }: { label: string; value: string; tone?: "danger" | "good"; big?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div
        className={`mt-1 font-semibold tabular-nums ${big ? "text-3xl" : "text-xl"} ${
          tone === "danger" ? "text-red-600 dark:text-red-400" : tone === "good" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default function EvalPage() {
  const [cases, setCases] = useState<EvalCase[] | null>(null);
  const [metrics, setMetrics] = useState<EvalMetrics | null>(null);
  const [run, setRun] = useState<EvalRunInfo | null>(null);
  const [metricsSource, setMetricsSource] = useState<MetricsSource | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ cases: EvalCase[] }>("/api/eval/cases").then((r) => setCases(r.cases)).catch((err) => setError(err.message));
    apiFetch<{ run: EvalRunInfo | null; metrics: EvalMetrics | null }>("/api/eval/latest")
      .then((r) => {
        if (r.run) setRun(r.run);
        setMetrics(r.metrics);
        setMetricsSource(r.run ? "stored" : null);
      })
      .catch(() => {});
  }, []);

  async function runEvaluation() {
    setRunning(true);
    setError(null);
    try {
      const result = await apiFetch<{ runId: string; metrics: EvalMetrics }>("/api/eval/run", { method: "POST", body: JSON.stringify({}) });
      setRun({ id: result.runId, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
      setMetrics(result.metrics);
      setMetricsSource("fresh");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const categories = cases ? Array.from(new Set(cases.map((c) => c.category))) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Evaluation Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Real, re-runnable measurement against the exact production pipeline — never a static number.
        </p>
      </div>

      {/* 1. Evaluation dataset — fixed, versioned test data, independent of any run. */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Evaluation dataset</div>
          <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
            {cases ? `${cases.length} cases across ${categories.length} categories` : "Loading…"}
          </div>
        </div>
        <button
          onClick={runEvaluation}
          disabled={running}
          className="rounded-md bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50"
        >
          {running ? "Running…" : "Run Evaluation"}
        </button>
      </div>

      {error ? <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {metrics && run ? (
        <>
          {/* 2. Latest evaluation run — WHEN this specific execution happened, and
              whether you're looking at a fresh click or a previously stored run
              (loaded on page mount, before you touched anything). Never presented
              as if it just happened when it didn't. */}
          <div
            className={`rounded-lg border px-4 py-2.5 text-sm flex items-center justify-between ${
              metricsSource === "fresh"
                ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400"
            }`}
          >
            <span>
              {metricsSource === "fresh" ? "✓ Just computed — " : "Showing the last stored run — "}
              {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "—"}
            </span>
            <span className="font-mono text-xs opacity-70">{run.id}</span>
          </div>

          {/* 3. Calculated metrics — derived from that run's eval_results rows. */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricTile label="False-allow rate" value={pct(metrics.falseAllowRate)} tone={metrics.falseAllowRate > 0 ? "danger" : "good"} big />
            <MetricTile label="False-block rate" value={pct(metrics.falseBlockRate)} tone={metrics.falseBlockRate > 0 ? "danger" : "good"} big />
            <MetricTile label="Verdict accuracy" value={pct(metrics.verdictAccuracy)} big />
            <MetricTile label="Escalation rate" value={pct(metrics.escalationRate)} big />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricTile label="Intent accuracy" value={pct(metrics.intentAccuracy)} />
            <MetricTile label="Payment match accuracy" value={pct(metrics.matchAccuracy)} />
            <MetricTile label="Response grounding rate" value={pct(metrics.responseGroundingRate)} />
            <MetricTile label="Unsafe actions prevented" value={String(metrics.unsafeActionsPreventedCount)} tone="good" />
          </div>
          <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-4 text-sm text-emerald-800 dark:text-emerald-300">
            ₹{(metrics.moneyProtectedPaise / 100).toLocaleString("en-IN")} in duplicate-payout risk correctly prevented across this{" "}
            {metrics.totalCases}-case evaluation batch (run {run.id.slice(0, 8)}…). A batch-evaluation figure computed
            from these visible cases — not a projected real-merchant-revenue claim.
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-3">By category</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="py-1.5">Category</th>
                  <th className="py-1.5">Cases</th>
                  <th className="py-1.5">Correct verdict</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics.byCategory).map(([cat, v]) => (
                  <tr key={cat} className="border-t border-slate-50 dark:border-slate-800/50">
                    <td className="py-1.5 text-slate-800 dark:text-slate-200">{cat}</td>
                    <td className="py-1.5 text-slate-600 dark:text-slate-400">{v.total}</td>
                    <td className="py-1.5 text-slate-600 dark:text-slate-400">{v.correctVerdict}/{v.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded-md border border-slate-200 dark:border-slate-800 p-4 text-sm text-slate-400">
          No evaluation run yet — click &ldquo;Run Evaluation&rdquo; above.
        </div>
      )}
    </div>
  );
}
