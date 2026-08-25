"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/apiClient";

interface AuditEvent {
  id: string;
  eventType: string;
  refTable: string;
  refId: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

const EVENT_TONE: Record<string, string> = {
  action_blocked: "text-red-600 dark:text-red-400",
  action_failed: "text-red-600 dark:text-red-400",
  webhook_signature_invalid: "text-red-600 dark:text-red-400",
  invalid_state_transition_rejected: "text-red-600 dark:text-red-400",
  override_recorded: "text-amber-600 dark:text-amber-400",
  override_attempted: "text-amber-600 dark:text-amber-400",
  payment_state_reconciled: "text-amber-600 dark:text-amber-400",
  action_executed: "text-emerald-600 dark:text-emerald-400",
};

/**
 * One human-readable sentence per event type, built only from fields the
 * codebase actually writes (grep-verified against every auditService.record
 * call site) — never a reformatting guess. Unmapped/future event types fall
 * back to a generic line; the raw detail JSON stays available underneath
 * either way, so nothing is hidden, just led with a sentence instead of a
 * JSON dump.
 */
function describeEvent(ev: AuditEvent): string {
  const d = ev.detail;
  const str = (k: string): string | undefined => (typeof d[k] === "string" ? (d[k] as string) : undefined);
  const num = (k: string): number | undefined => (typeof d[k] === "number" ? (d[k] as number) : undefined);
  const overridden = d.overridden === true ? " (via override)" : "";

  switch (ev.eventType) {
    case "decision_made":
      return `Decision made: ${str("verdict") ?? "?"} · ${str("ruleId") ?? "?"}${
        str("requestedAction") ? ` — requested action: ${str("requestedAction")}` : ""
      }`;
    case "action_blocked":
      return `Blocked — ${str("ruleId") ?? "?"}: ${str("explanation") ?? "no reason recorded"}`;
    case "action_executed":
      if (str("razorpayRefundId")) {
        return `Executed — refund ${str("razorpayRefundId")} on ${str("razorpayPaymentId") ?? "the payment"}${overridden}`;
      }
      if (str("capturedStatus")) {
        return `Executed — ${str("razorpayPaymentId") ?? "payment"} captured (status: ${str("capturedStatus")})${overridden}`;
      }
      return `Action executed${overridden}`;
    case "action_failed":
      return `Failed${str("razorpayPaymentId") ? ` on ${str("razorpayPaymentId")}` : ""}: ${str("error") ?? "unknown error"}`;
    case "override_recorded":
      return `Overridden by ${str("agentId") ?? "an agent"} (was ${str("ruleId") ?? "?"}) — "${str("reason") ?? ""}"`;
    case "override_attempted":
      return `Override endpoint called on a non-BLOCK decision (${str("verdict") ?? "?"}) — rejected server-side`;
    case "sync_failure":
      return `Live sync failed for ${str("razorpayPaymentId") ?? "a payment"}: ${str("reason") ?? "unknown reason"}`;
    case "payment_state_reconciled":
      return `Payment state reconciled: ${str("from") ?? "?"} → ${str("to") ?? "?"}`;
    case "invalid_state_transition_rejected":
      return `Unexpected state transition on ${str("razorpayPaymentId") ?? "a payment"}: ${str("from") ?? "?"} → ${str("to") ?? "?"} (logged, not applied)`;
    case "payment_match_failed":
      return `No confident payment match: ${str("reason") ?? "reason not recorded"}`;
    case "ai_failure":
      return `AI provider failed — fell back to the deterministic matcher: ${str("error") ?? "unknown error"}`;
    case "low_confidence_escalation":
      return `Escalated — AI confidence ${num("confidence")?.toFixed(2) ?? "?"} below the ${num("threshold")?.toFixed(2) ?? "?"} threshold`;
    case "webhook_signature_invalid":
      return `Webhook rejected — invalid signature${d.signaturePresent === false ? " (no signature header sent)" : ""}`;
    case "webhook_malformed_payload":
      return `Webhook rejected — malformed payload${str("reason") ? `: ${str("reason")}` : ""}`;
    case "webhook_duplicate_ignored":
      return `Duplicate webhook delivery ignored (${str("eventType") ?? "event"})`;
    case "razorpay_api_unavailable":
    case "razorpay_api_timeout":
      return `Razorpay unreachable for ${str("razorpayPaymentId") ?? "a payment"}: ${str("error") ?? "unknown error"}`;
    default:
      return "See details below.";
  }
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [eventType, setEventType] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = eventType ? `?eventType=${encodeURIComponent(eventType)}&limit=200` : "?limit=200";
    apiFetch<{ events: AuditEvent[] }>(`/api/audit${qs}`)
      .then((r) => setEvents(r.events))
      .catch((err) => setError(err.message));
  }, [eventType]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Audit Trail</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Append-only. Every decision, action, block, and override.</p>
        </div>
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200"
        >
          <option value="">All event types</option>
          <option value="decision_made">decision_made</option>
          <option value="action_blocked">action_blocked</option>
          <option value="action_executed">action_executed</option>
          <option value="action_failed">action_failed</option>
          <option value="override_recorded">override_recorded</option>
          <option value="override_attempted">override_attempted</option>
          <option value="webhook_signature_invalid">webhook_signature_invalid</option>
          <option value="webhook_duplicate_ignored">webhook_duplicate_ignored</option>
          <option value="payment_match_failed">payment_match_failed</option>
          <option value="low_confidence_escalation">low_confidence_escalation</option>
          <option value="razorpay_api_unavailable">razorpay_api_unavailable</option>
          <option value="payment_state_reconciled">payment_state_reconciled</option>
          <option value="invalid_state_transition_rejected">invalid_state_transition_rejected</option>
        </select>
      </div>

      {error ? <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        {events === null ? (
          <div className="p-4 text-sm text-slate-400">Loading…</div>
        ) : events.length === 0 ? (
          <div className="p-4 text-sm text-slate-400">No audit events yet.</div>
        ) : (
          events.map((ev) => (
            <div key={ev.id} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <span className={`text-xs font-mono uppercase tracking-wide ${EVENT_TONE[ev.eventType] ?? "text-slate-500 dark:text-slate-400"}`}>
                  {ev.eventType}
                </span>
                <span className="text-xs text-slate-400 shrink-0">{new Date(ev.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">{describeEvent(ev)}</p>
              <div className="mt-1 text-xs text-slate-400">{ev.refTable} · {ev.refId}</div>
              <details className="mt-2 group">
                <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 select-none">
                  Raw event detail
                </summary>
                <pre className="mt-2 overflow-x-auto rounded bg-slate-50 dark:bg-slate-950 p-2 text-xs text-slate-600 dark:text-slate-400">
                  {JSON.stringify(ev.detail, null, 2)}
                </pre>
              </details>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
