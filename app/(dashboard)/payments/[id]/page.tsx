"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client/apiClient";
import { StatusBadge, DataSourceBadge, VerdictBadge } from "@/components/badges";

const AGENT_ID = "agent_demo";
const RECONCILIATION_EVENT_TYPES = ["payment_state_reconciled", "invalid_state_transition_rejected"];

interface Payment {
  id: string;
  razorpayPaymentId: string;
  razorpayOrderId: string | null;
  status: string;
  captured: boolean;
  amount: number;
  currency: string;
  customerRef: string | null;
  dataSource: string;
  razorpayCreatedAt: string;
  lastSyncedAt: string;
}
interface WebhookEvent {
  id: string;
  eventType: string;
  signatureValid: boolean;
  processedAt: string | null;
  createdAt: string;
}
interface Decision {
  id: string;
  verdict: string;
  ruleId: string;
  explanation: string;
  requestedAction: string;
  createdAt: string;
}
interface Action {
  id: string;
  actionType: string;
  state: string;
  razorpayRefundId: string | null;
  overrideReason: string | null;
  agentId: string;
  createdAt: string;
}
interface Detail {
  payment: Payment;
  timeline: WebhookEvent[];
  decisions: Decision[];
  actions: Action[];
  stale: boolean;
}

interface AuditEvent {
  id: string;
  eventType: string;
  detail: { from?: string; to?: string; razorpayPaymentId?: string };
  createdAt: string;
}

export default function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [reconciliationEvents, setReconciliationEvents] = useState<AuditEvent[] | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  function refresh() {
    apiFetch<Detail>(`/api/payments/${id}`)
      .then(setData)
      .catch((err) => setError(err.message));
    // Surfaces reconciliation events already produced by the sync route and
    // the webhook's invalid-transition check — no new backend data, just
    // reading /api/audit filtered to this payment (Section: RECONCILIATION).
    apiFetch<{ events: AuditEvent[] }>(`/api/audit?refTable=payments&refId=${id}&limit=20`)
      .then((r) => setReconciliationEvents(r.events.filter((e) => RECONCILIATION_EVENT_TYPES.includes(e.eventType))))
      .catch(() => setReconciliationEvents([]));
  }

  useEffect(refresh, [id]);

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      await apiFetch(`/api/payments/${id}/sync`, { method: "POST" });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  async function requestCapture() {
    setCaptureBusy(true);
    setCaptureError(null);
    try {
      await apiFetch(`/api/payments/${id}/capture`, {
        method: "POST",
        body: JSON.stringify({ agentId: AGENT_ID }),
      });
      refresh();
    } catch (err) {
      setCaptureError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setCaptureBusy(false);
    }
  }

  async function attemptCapture(decisionId: string) {
    setCaptureBusy(true);
    setCaptureError(null);
    try {
      await apiFetch("/api/actions", {
        method: "POST",
        body: JSON.stringify({ decisionId, actionType: "capture", agentId: AGENT_ID }),
      });
      refresh();
    } catch (err) {
      setCaptureError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setCaptureBusy(false);
    }
  }

  async function confirmCapture(actionId: string) {
    setCaptureBusy(true);
    setCaptureError(null);
    try {
      await apiFetch(`/api/actions/${actionId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ agentId: AGENT_ID }),
      });
      // Pull the fresh Razorpay state immediately via the existing sync
      // route rather than waiting for the payment.captured webhook.
      await apiFetch(`/api/payments/${id}/sync`, { method: "POST" });
      refresh();
    } catch (err) {
      setCaptureError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setCaptureBusy(false);
    }
  }

  if (error) return <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!data) return <div className="text-sm text-slate-400">Loading…</div>;

  const { payment, timeline, decisions, actions } = data;
  const latestCaptureDecision = decisions.find((d) => d.requestedAction === "capture") ?? null;
  const latestCaptureAction = actions.find((a) => a.actionType === "capture") ?? null;

  return (
    <div className="space-y-6">
      <Link href="/payments" className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
        ← Back to Payments
      </Link>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-sm text-slate-900 dark:text-slate-100">{payment.razorpayPaymentId}</div>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={payment.status} />
              <DataSourceBadge dataSource={payment.dataSource} />
              {data.stale ? (
                <span className="rounded bg-amber-100 dark:bg-amber-950 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                  stale — live re-fetch failed
                </span>
              ) : null}
            </div>
          </div>
          <button
            onClick={sync}
            disabled={syncing}
            className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Re-sync from Razorpay"}
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="text-slate-400 text-xs">amount</dt><dd className="text-slate-900 dark:text-slate-100">{payment.currency} {(payment.amount / 100).toFixed(2)}</dd></div>
          <div><dt className="text-slate-400 text-xs">captured</dt><dd className="text-slate-900 dark:text-slate-100">{String(payment.captured)}</dd></div>
          <div><dt className="text-slate-400 text-xs">order id</dt><dd className="text-slate-900 dark:text-slate-100 font-mono text-xs">{payment.razorpayOrderId ?? "—"}</dd></div>
          <div><dt className="text-slate-400 text-xs">customer ref</dt><dd className="text-slate-900 dark:text-slate-100">{payment.customerRef ?? "—"}</dd></div>
          <div><dt className="text-slate-400 text-xs">created at (Razorpay)</dt><dd className="text-slate-900 dark:text-slate-100">{new Date(payment.razorpayCreatedAt).toLocaleString()}</dd></div>
          <div><dt className="text-slate-400 text-xs">last synced</dt><dd className="text-slate-900 dark:text-slate-100">{new Date(payment.lastSyncedAt).toLocaleString()}</dd></div>
        </dl>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-3">Webhook timeline</div>
          {timeline.length === 0 ? (
            <div className="text-sm text-slate-400">No webhook events recorded yet for this payment.</div>
          ) : (
            <ul className="space-y-2">
              {timeline.map((ev) => (
                <li key={ev.id} className="flex items-center justify-between text-sm border-b border-slate-50 dark:border-slate-800/50 pb-2 last:border-0">
                  <span className="text-slate-800 dark:text-slate-200">{ev.eventType}</span>
                  <span className="text-xs text-slate-400">{new Date(ev.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-3">Decisions & actions</div>
          {decisions.length === 0 ? (
            <div className="text-sm text-slate-400">No decisions made against this payment yet.</div>
          ) : (
            <ul className="space-y-3">
              {decisions.map((d) => (
                <li key={d.id} className="border-b border-slate-50 dark:border-slate-800/50 pb-3 last:border-0">
                  <div className="flex items-center justify-between">
                    <VerdictBadge verdict={d.verdict} ruleId={d.ruleId} />
                    <span className="text-xs text-slate-400">{new Date(d.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{d.explanation}</p>
                </li>
              ))}
            </ul>
          )}
          {actions.length > 0 ? (
            <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">Actions</div>
              <ul className="space-y-1.5 text-xs">
                {actions.map((a) => (
                  <li key={a.id} className="flex items-center justify-between">
                    <span className="text-slate-700 dark:text-slate-300">
                      {a.actionType} · {a.state} · {a.agentId}
                      {a.razorpayRefundId ? ` · refund ${a.razorpayRefundId}` : ""}
                    </span>
                    <span className="text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-3">Capture (manual)</div>
        {!latestCaptureDecision ? (
          <button
            onClick={requestCapture}
            disabled={captureBusy}
            className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {captureBusy ? "Checking…" : "Request capture"}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <VerdictBadge verdict={latestCaptureDecision.verdict} ruleId={latestCaptureDecision.ruleId} />
              <span className="text-xs text-slate-400">{new Date(latestCaptureDecision.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">{latestCaptureDecision.explanation}</p>

            {latestCaptureDecision.verdict === "ALLOW" ? (
              !latestCaptureAction ? (
                <button
                  onClick={() => attemptCapture(latestCaptureDecision.id)}
                  disabled={captureBusy}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Stage capture
                </button>
              ) : latestCaptureAction.state === "pending" ? (
                <button
                  onClick={() => confirmCapture(latestCaptureAction.id)}
                  disabled={captureBusy}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Confirm & execute — real Razorpay Capture API call
                </button>
              ) : latestCaptureAction.state === "executed" ? (
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                  Captured. Payment status above reflects the fresh Razorpay re-fetch.
                </div>
              ) : (
                <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-300">
                  Action state: {latestCaptureAction.state}
                </div>
              )
            ) : (
              <button
                onClick={requestCapture}
                disabled={captureBusy}
                className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                Re-check
              </button>
            )}
          </div>
        )}
        {captureError ? <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700">{captureError}</div> : null}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-3">Live-state reconciliation</div>
        {reconciliationEvents === null ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : reconciliationEvents.length === 0 ? (
          <div className="text-sm text-slate-400">No drift has been detected/corrected for this payment yet.</div>
        ) : (
          <ul className="space-y-2">
            {reconciliationEvents.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between text-sm border-b border-slate-50 dark:border-slate-800/50 pb-2 last:border-0">
                <span className="text-slate-800 dark:text-slate-200">
                  {ev.eventType}
                  {ev.detail.from && ev.detail.to ? ` — ${ev.detail.from} → ${ev.detail.to}` : ""}
                </span>
                <span className="text-xs text-slate-400">{new Date(ev.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
