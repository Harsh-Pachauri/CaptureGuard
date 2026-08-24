"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/apiClient";
import { VerdictBadge } from "@/components/badges";

interface QueryRow {
  id: string;
  rawText: string;
  language: string | null;
  status: string;
  createdAt: string;
  decisions: { verdict: string; ruleId: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  decided: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  escalated: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export default function InboxPage() {
  const router = useRouter();
  const [queries, setQueries] = useState<QueryRow[] | null>(null);
  const [text, setText] = useState("");
  const [customerRef, setCustomerRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    apiFetch<{ queries: QueryRow[] }>("/api/support-queries?limit=100")
      .then((r) => setQueries(r.queries))
      .catch((err) => setError(err.message));
  }

  useEffect(refresh, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch<{ queryId: string }>("/api/support-queries", {
        method: "POST",
        body: JSON.stringify({ text, customerRef: customerRef || undefined, source: "demo" }),
      });
      setText("");
      setCustomerRef("");
      router.push(`/inbox/${result.queryId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Support Inbox</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          English and Hinglish queries, handled the same way. AI extracts intent; the deterministic engine decides.
        </p>
      </div>

      <form onSubmit={submit} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. "bhai payment ho gaya but order failed dikha raha hai, refund kar do"'
          rows={3}
          className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
        />
        <div className="flex items-center gap-3">
          <input
            value={customerRef}
            onChange={(e) => setCustomerRef(e.target.value)}
            placeholder="Customer ref (phone/email) or paste a payment/order id in the message above"
            className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-100"
          />
          <button
            type="submit"
            disabled={submitting || !text.trim()}
            className="rounded-md bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Running pipeline…" : "Submit"}
          </button>
        </div>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
      </form>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        {queries === null ? (
          <div className="p-4 text-sm text-slate-400">Loading…</div>
        ) : queries.length === 0 ? (
          <div className="p-4 text-sm text-slate-400">No queries yet — submit one above.</div>
        ) : (
          queries.map((q) => (
            <Link
              key={q.id}
              href={`/inbox/${q.id}`}
              className="flex items-center justify-between gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-900 dark:text-slate-100">{q.rawText}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                  <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLES[q.status] ?? ""}`}>{q.status}</span>
                  {q.language ? <span>{q.language}</span> : null}
                  <span>{new Date(q.createdAt).toLocaleString()}</span>
                </div>
              </div>
              {q.decisions[0] ? <VerdictBadge verdict={q.decisions[0].verdict} ruleId={q.decisions[0].ruleId} /> : null}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
