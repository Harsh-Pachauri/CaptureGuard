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
  override_recorded: "text-amber-600 dark:text-amber-400",
  override_attempted: "text-amber-600 dark:text-amber-400",
  action_executed: "text-emerald-600 dark:text-emerald-400",
};

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
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${EVENT_TONE[ev.eventType] ?? "text-slate-800 dark:text-slate-200"}`}>{ev.eventType}</span>
                <span className="text-xs text-slate-400">{new Date(ev.createdAt).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-xs text-slate-400">{ev.refTable} · {ev.refId}</div>
              <pre className="mt-2 overflow-x-auto rounded bg-slate-50 dark:bg-slate-950 p-2 text-xs text-slate-600 dark:text-slate-400">
                {JSON.stringify(ev.detail, null, 2)}
              </pre>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
