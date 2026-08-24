"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/client/apiClient";
import { StatusBadge, DataSourceBadge } from "@/components/badges";

interface Payment {
  id: string;
  razorpayPaymentId: string;
  status: string;
  captured: boolean;
  amount: number;
  currency: string;
  customerRef: string | null;
  dataSource: string;
  razorpayCreatedAt: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    apiFetch<{ payments: Payment[] }>("/api/payments?limit=200")
      .then((r) => setPayments(r.payments))
      .catch((err) => setError(err.message));
  }, []);

  const visible = payments?.filter((p) => filter === "all" || p.dataSource === filter) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Payments</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Synced from Razorpay via webhook + on-demand live fetch.</p>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200"
        >
          <option value="all">All sources</option>
          <option value="real">Real Razorpay data</option>
          <option value="fixture">Seeded fixtures</option>
          <option value="eval">Eval-only</option>
        </select>
      </div>

      {error ? <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-3 font-medium">Payment</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Customer ref</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {payments === null ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No payments yet.</td></tr>
            ) : (
              visible.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <Link href={`/payments/${p.id}`} className="font-mono text-xs text-slate-700 dark:text-slate-300 hover:underline">
                      {p.razorpayPaymentId}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 tabular-nums text-slate-700 dark:text-slate-300">{p.currency} {(p.amount / 100).toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{p.customerRef ?? "—"}</td>
                  <td className="px-4 py-3"><DataSourceBadge dataSource={p.dataSource} /></td>
                  <td className="px-4 py-3 text-slate-400">{new Date(p.razorpayCreatedAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
