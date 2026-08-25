"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client/apiClient";
import { StatusBadge, DataSourceBadge, VerdictBadge } from "@/components/badges";
import { useStaggerReveal } from "@/lib/client/useStaggerReveal";
import { useNewlyAdded } from "@/lib/client/useNewlyAdded";
import { formatRelativeTime } from "@/lib/client/formatRelativeTime";

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
  razorpayEventId: string;
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
  executedAt: string | null;
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

interface TimelineNode {
  id: string;
  timestamp: string;
  title: string;
  observed: boolean;
  evidence: Record<string, unknown> | null;
}

/**
 * Merges the three real event sources already returned by GET
 * /api/payments/:id (webhookEvents, decisions, actions) plus the
 * already-fetched reconciliation audit events into one chronological
 * forensic record. No new data, no new API calls — purely a client-side
 * re-presentation of what's already on the page. "Not observed" nodes are
 * derived the same way: only from real fields (payment.status,
 * payment.captured) checked against the real webhook list, never guessed.
 */
function buildForensicTimeline(data: Detail, reconciliationEvents: AuditEvent[]): TimelineNode[] {
  const nodes: TimelineNode[] = [];
  const hasWebhook = (type: string) => data.timeline.some((e) => e.eventType === type);

  if (data.payment.status !== "created" && data.payment.status !== "failed" && !hasWebhook("payment.authorized")) {
    nodes.push({
      id: "gap-authorized",
      timestamp: data.payment.razorpayCreatedAt,
      title: "payment.authorized webhook — not observed",
      observed: false,
      evidence: null,
    });
  }
  if (data.payment.captured && !hasWebhook("payment.captured")) {
    nodes.push({
      id: "gap-captured",
      timestamp: data.payment.lastSyncedAt,
      title: "payment.captured webhook — not observed (state reflects a live/manual sync instead)",
      observed: false,
      evidence: null,
    });
  }

  for (const ev of data.timeline) {
    nodes.push({
      id: `wh-${ev.id}`,
      timestamp: ev.createdAt,
      title: `${ev.eventType} webhook received${ev.signatureValid ? "" : " — signature invalid"}`,
      observed: true,
      evidence: { razorpayEventId: ev.razorpayEventId, signatureValid: ev.signatureValid, processedAt: ev.processedAt },
    });
  }

  for (const d of data.decisions) {
    nodes.push({
      id: `dec-${d.id}`,
      timestamp: d.createdAt,
      title: `Decision: ${d.verdict} · ${d.ruleId} (${d.requestedAction})`,
      observed: true,
      evidence: { verdict: d.verdict, ruleId: d.ruleId, requestedAction: d.requestedAction, explanation: d.explanation },
    });
  }

  for (const a of data.actions) {
    nodes.push({
      id: `act-staged-${a.id}`,
      timestamp: a.createdAt,
      title:
        a.state === "blocked"
          ? `Action blocked (${a.actionType})`
          : `Action staged (${a.actionType}) — awaiting confirmation`,
      observed: true,
      evidence: { actionType: a.actionType, state: a.state, agentId: a.agentId, overrideReason: a.overrideReason },
    });
    // executedAt is a distinct, real, separately-stored timestamp — confirm
    // and execute happen atomically server-side, so this single node
    // honestly represents both rather than inventing a separate
    // "confirmed" moment the data doesn't have.
    if (a.executedAt) {
      nodes.push({
        id: `act-executed-${a.id}`,
        timestamp: a.executedAt,
        title:
          a.state === "executed"
            ? `Action confirmed & executed${a.overrideReason ? " (via override)" : ""}${a.razorpayRefundId ? ` — refund ${a.razorpayRefundId}` : ""}`
            : `Action confirmed & executed, state now "${a.state}"`,
        observed: true,
        evidence: { state: a.state, razorpayRefundId: a.razorpayRefundId, overrideReason: a.overrideReason },
      });
    }
  }

  for (const ev of reconciliationEvents) {
    nodes.push({
      id: `rec-${ev.id}`,
      timestamp: ev.createdAt,
      title:
        ev.eventType === "payment_state_reconciled"
          ? `Live state verified — reconciled: ${ev.detail.from ?? "?"} → ${ev.detail.to ?? "?"}`
          : `Live state verified — unexpected transition logged, not applied: ${ev.detail.from ?? "?"} → ${ev.detail.to ?? "?"}`,
      observed: true,
      evidence: ev.detail as Record<string, unknown>,
    });
  }

  return nodes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function TimelineNodeRow({ node, visible, isNew }: { node: TimelineNode; visible: boolean; isNew: boolean }) {
  return (
    <li
      className={`relative pl-6 pb-5 last:pb-0 rounded-md transition-[opacity,transform,background-color] duration-300 ease-out motion-reduce:transition-none motion-reduce:duration-0 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
      } ${isNew ? "bg-blue-50 dark:bg-blue-950/40" : "bg-transparent"}`}
    >
      <span
        className={`absolute left-0 top-1 h-2.5 w-2.5 rounded-full border-2 ${
          node.observed
            ? "border-slate-900 bg-slate-900 dark:border-slate-100 dark:bg-slate-100"
            : "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950"
        }`}
        aria-hidden
      />
      <span className="absolute left-[4.5px] top-4 bottom-0 w-px bg-slate-200 dark:bg-slate-800" aria-hidden />
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-sm ${node.observed ? "text-slate-800 dark:text-slate-200" : "text-amber-700 dark:text-amber-400 italic"}`}>
          {node.title}
          {isNew ? <span className="ml-2 text-[10px] font-mono uppercase tracking-wide text-blue-600 dark:text-blue-400">new</span> : null}
        </span>
        <span className="shrink-0 font-mono text-xs text-slate-400">{new Date(node.timestamp).toLocaleString()}</span>
      </div>
      {node.evidence ? (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 select-none">
            Evidence
          </summary>
          <pre className="mt-1.5 overflow-x-auto rounded bg-slate-50 dark:bg-slate-950 p-2 font-mono text-xs text-slate-600 dark:text-slate-400">
            {JSON.stringify(node.evidence, null, 2)}
          </pre>
        </details>
      ) : null}
    </li>
  );
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
    // reading /api/audit filtered to this payment.
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

  // Hooks must run unconditionally on every render — compute this before
  // the early returns below, with a safe empty default while data is
  // still loading, rather than calling useStaggerReveal after a return.
  const forensicNodes = data ? buildForensicTimeline(data, reconciliationEvents ?? []) : [];
  const revealedCount = useStaggerReveal(forensicNodes.length, id, 50);
  const webhookNodeIds = forensicNodes.filter((n) => n.id.startsWith("wh-")).map((n) => n.id);
  const newlyAddedWebhookIds = useNewlyAdded(webhookNodeIds);

  if (error) return <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!data) return <div className="text-sm text-slate-400">Loading…</div>;

  const { payment, decisions, actions } = data;
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
            className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors duration-150 ease-out motion-reduce:transition-none"
          >
            {syncing ? "Syncing…" : "Re-sync from Razorpay"}
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4 font-mono">
          <div><dt className="text-slate-400 text-xs font-sans">amount</dt><dd className="text-slate-900 dark:text-slate-100">{payment.currency} {(payment.amount / 100).toFixed(2)}</dd></div>
          <div><dt className="text-slate-400 text-xs font-sans">captured</dt><dd className="text-slate-900 dark:text-slate-100">{String(payment.captured)}</dd></div>
          <div><dt className="text-slate-400 text-xs font-sans">order id</dt><dd className="text-slate-900 dark:text-slate-100 text-xs">{payment.razorpayOrderId ?? "—"}</dd></div>
          <div><dt className="text-slate-400 text-xs font-sans">customer ref</dt><dd className="text-slate-900 dark:text-slate-100">{payment.customerRef ?? "—"}</dd></div>
          <div><dt className="text-slate-400 text-xs font-sans">created at (Razorpay)</dt><dd className="text-slate-900 dark:text-slate-100">{new Date(payment.razorpayCreatedAt).toLocaleString()}</dd></div>
          <div>
            <dt className="text-slate-400 text-xs font-sans">last synced</dt>
            <dd className="text-slate-900 dark:text-slate-100">
              {new Date(payment.lastSyncedAt).toLocaleString()}{" "}
              <span className="text-slate-400 text-xs">({formatRelativeTime(payment.lastSyncedAt)})</span>
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">Forensic timeline</div>
        <p className="text-xs text-slate-400 mb-4">
          Every recorded webhook, decision, action, and reconciliation event for this payment, in order. Amber
          entries are expected events that were not actually observed — never invented to fill a gap.
        </p>
        {forensicNodes.length === 0 ? (
          <div className="text-sm text-slate-400">No recorded events for this payment yet.</div>
        ) : (
          <ul>
            {forensicNodes.map((node, i) => (
              <TimelineNodeRow key={node.id} node={node} visible={revealedCount > i} isNew={newlyAddedWebhookIds.has(node.id)} />
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-3">Capture (manual)</div>
        {!latestCaptureDecision ? (
          <button
            onClick={requestCapture}
            disabled={captureBusy}
            className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors duration-150 ease-out motion-reduce:transition-none"
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
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors duration-150 ease-out motion-reduce:transition-none"
                >
                  Stage capture
                </button>
              ) : latestCaptureAction.state === "pending" ? (
                <>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Staged only — Razorpay has not been called yet.</div>
                  <button
                    onClick={() => confirmCapture(latestCaptureAction.id)}
                    disabled={captureBusy}
                    className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors duration-150 ease-out motion-reduce:transition-none"
                  >
                    {captureBusy ? "Confirming…" : "Confirm & execute — real Razorpay Capture API call"}
                  </button>
                </>
              ) : latestCaptureAction.state === "executed" ? (
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                  Executed — Razorpay confirmed the mutation. Payment status above reflects the fresh re-fetch.
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
                className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors duration-150 ease-out motion-reduce:transition-none"
              >
                Re-check
              </button>
            )}
          </div>
        )}
        {captureError ? <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-700">{captureError}</div> : null}
      </div>
    </div>
  );
}
