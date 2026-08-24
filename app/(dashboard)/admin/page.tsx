"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/apiClient";

interface Merchant {
  id: string;
  name: string;
  autoReversalWindowHours: number;
  matchConfidenceThreshold: number;
}

export default function AdminPage() {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [windowHours, setWindowHours] = useState("");
  const [threshold, setThreshold] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    apiFetch<{ merchant: Merchant }>("/api/config")
      .then((r) => {
        setMerchant(r.merchant);
        setWindowHours(String(r.merchant.autoReversalWindowHours));
        setThreshold(String(r.merchant.matchConfidenceThreshold));
      })
      .catch((err) => setError(err.message));
  }

  useEffect(refresh, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/api/config", {
        method: "PATCH",
        body: JSON.stringify({
          autoReversalWindowHours: Number(windowHours),
          matchConfidenceThreshold: Number(threshold),
        }),
      });
      setMessage("Saved. New policy values apply to every decision from now on.");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Admin — Policy Configuration</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          These values live on the merchant row and drive the Decision Engine directly — never hardcoded. Shorten the
          window here for a live demo of the ESCALATE (past-window) case.
        </p>
      </div>

      {error ? <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

      {merchant ? (
        <form onSubmit={save} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Auto-reversal safety window (hours)
            </label>
            <p className="text-xs text-slate-400 mt-0.5">
              Rule R4/R5 boundary. Set to e.g. 0.03 (~2 minutes) to demo the window elapsing live.
            </p>
            <input
              type="number"
              step="0.01"
              min="0"
              value={windowHours}
              onChange={(e) => setWindowHours(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Match confidence threshold</label>
            <p className="text-xs text-slate-400 mt-0.5">Rule R1 gate — below this, the system escalates rather than guessing.</p>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="mt-2 w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      ) : (
        <div className="text-sm text-slate-400">Loading…</div>
      )}
    </div>
  );
}
