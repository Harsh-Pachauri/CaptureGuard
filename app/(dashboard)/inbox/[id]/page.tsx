"use client";

import { useCallback, useEffect, useRef, useState, use as usePromise } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/client/apiClient";
import { VerdictBadge, StatusBadge } from "@/components/badges";

interface Snapshot {
  razorpayPaymentId?: string;
  status?: string;
  captured?: boolean;
  amount?: number;
  amountFormatted?: string;
  currency?: string;
  razorpayCreatedAt?: string;
  checkedAt?: string;
  autoReversalWindowHours?: number;
  windowEndsAt?: string;
  elapsedHours?: number;
  requestedAction?: string;
  matchConfidence?: number | null;
  matchThreshold?: number;
}

interface ActionRow {
  id: string;
  actionType: string;
  state: string;
  razorpayRefundId: string | null;
  overrideReason: string | null;
}

interface DecisionRow {
  id: string;
  verdict: "ALLOW" | "BLOCK" | "ESCALATE";
  ruleId: string;
  explanation: string;
  paymentSnapshot: Snapshot;
  actions: ActionRow[];
}

interface QueryDetail {
  query: {
    id: string;
    rawText: string;
    language: string | null;
    status: string;
    customerRef: string | null;
    createdAt: string;
    matchedPayment: { id: string; razorpayPaymentId: string } | null;
  };
  extraction: {
    intent: string;
    payment_reference: string | null;
    requested_action: string;
    language: string;
    confidence: number;
  } | null;
  match: { matched: boolean; matchConfidence: number | null; matchMethod: string };
  decision: DecisionRow | null;
}

const AGENT_ID = "agent_demo";

export default function DecisionPanelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [data, setData] = useState<QueryDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const autoAttemptedFor = useRef<Set<string>>(new Set());

  function refresh() {
    apiFetch<QueryDetail>(`/api/support-queries/${id}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(refresh, [id]);

  // Derived above the early returns (not just in JSX) because the
  // auto-attempt effect below needs them, and hooks can't follow a
  // conditional return.
  const decision = data?.decision ?? null;
  const snapshot = decision?.paymentSnapshot;
  const requestedAction = snapshot?.requestedAction ?? data?.extraction?.requested_action;
  const isMoneyAction = requestedAction === "refund" || requestedAction === "compensate";
  const latestAction = decision?.actions?.[0] ?? null;

  const attemptAction = useCallback(async () => {
    if (!decision) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/actions", {
        method: "POST",
        body: JSON.stringify({
          decisionId: decision.id,
          actionType: requestedAction === "compensate" ? "compensate" : "refund",
          agentId: AGENT_ID,
        }),
      });
      refresh();
    } catch (err) {
      // A BLOCK verdict's attempt correctly returns 409 (Section 5) — the
      // Action row + action_blocked audit event were already written
      // server-side before that response was sent. This is the expected
      // outcome, not a UI error to surface (pre-existing bug in this
      // catch block, previously unreachable since nothing ever called
      // attemptAction() on a BLOCK decision until now).
      if (err instanceof ApiError && err.status === 409) {
        refresh();
      } else {
        setError(err instanceof ApiError ? err.message : String(err));
      }
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision, requestedAction]);

  /**
   * Minimal integration point for the action_blocked audit gap: a BLOCK
   * verdict's primary button is intentionally disabled (Section 16 —
   * "disabled/greyed... not hidden"), so nothing ever called
   * POST /api/actions for it, so the existing, unmodified Action Guard
   * (lib/action-guard/actionGuard.ts#attempt) and its audit write never
   * ran. This fires the SAME attemptAction() the ALLOW path already uses,
   * automatically, once per decision, the moment a BLOCK verdict with a
   * money action is known. No change to Action Guard, POST /api/actions,
   * the Decision Engine, or the ALLOW flow.
   */
  useEffect(() => {
    if (!decision || decision.verdict !== "BLOCK" || !isMoneyAction || latestAction) return;
    if (autoAttemptedFor.current.has(decision.id)) return;
    autoAttemptedFor.current.add(decision.id);
    attemptAction();
  }, [decision, isMoneyAction, latestAction, attemptAction]);

  if (error) return <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!data) return <div className="text-sm text-slate-400">Loading…</div>;

  const { query, extraction, match } = data;

  async function confirmAction() {
    if (!latestAction) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/actions/${latestAction.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({ agentId: AGENT_ID }),
      });
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitOverride() {
    if (!latestAction || overrideReason.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/actions/${latestAction.id}/override`, {
        method: "POST",
        body: JSON.stringify({ agentId: AGENT_ID, reason: overrideReason }),
      });
      setShowOverride(false);
      setOverrideReason("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/inbox" className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
        ← Back to Inbox
      </Link>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Customer query</div>
        <p className="mt-2 text-base text-slate-900 dark:text-slate-100">&ldquo;{query.rawText}&rdquo;</p>
        <div className="mt-2 flex gap-3 text-xs text-slate-400">
          {query.customerRef ? <span>customer: {query.customerRef}</span> : null}
          <span>{new Date(query.createdAt).toLocaleString()}</span>
        </div>
      </div>

      {extraction ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">AI extraction (structured, validated)</div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div><dt className="text-slate-400">intent</dt><dd className="text-slate-900 dark:text-slate-100">{extraction.intent}</dd></div>
            <div><dt className="text-slate-400">requested_action</dt><dd className="text-slate-900 dark:text-slate-100">{extraction.requested_action}</dd></div>
            <div><dt className="text-slate-400">language</dt><dd className="text-slate-900 dark:text-slate-100">{extraction.language}</dd></div>
            <div><dt className="text-slate-400">confidence</dt><dd className="text-slate-900 dark:text-slate-100">{extraction.confidence.toFixed(2)}</dd></div>
          </dl>
          <div className="mt-3 text-xs text-slate-400">
            payment match: {match.matched ? `matched (${match.matchMethod}, confidence ${match.matchConfidence?.toFixed(2)})` : "no confident match"}
          </div>
        </div>
      ) : null}

      {decision ? (
        <div className="rounded-xl border-2 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">CaptureGuard decision</div>
            <VerdictBadge verdict={decision.verdict} ruleId={decision.ruleId} />
          </div>
          <div className="p-5 space-y-4">
            <p className="text-sm leading-relaxed text-slate-800 dark:text-slate-200">{decision.explanation}</p>

            {snapshot?.razorpayPaymentId ? (
              <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">Razorpay evidence (live-fetched)</div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                  <div><dt className="text-slate-400">payment id</dt><dd className="font-mono text-slate-900 dark:text-slate-100">{snapshot.razorpayPaymentId}</dd></div>
                  <div><dt className="text-slate-400">status</dt><dd>{snapshot.status ? <StatusBadge status={snapshot.status} /> : "—"}</dd></div>
                  <div><dt className="text-slate-400">captured</dt><dd className="text-slate-900 dark:text-slate-100">{String(snapshot.captured)}</dd></div>
                  <div><dt className="text-slate-400">amount</dt><dd className="text-slate-900 dark:text-slate-100">{snapshot.amountFormatted}</dd></div>
                  <div><dt className="text-slate-400">created at</dt><dd className="text-slate-900 dark:text-slate-100">{snapshot.razorpayCreatedAt ? new Date(snapshot.razorpayCreatedAt).toLocaleString() : "—"}</dd></div>
                  <div><dt className="text-slate-400">window</dt><dd className="text-slate-900 dark:text-slate-100">{snapshot.autoReversalWindowHours}h</dd></div>
                  {snapshot.windowEndsAt ? <div><dt className="text-slate-400">window ends</dt><dd className="text-slate-900 dark:text-slate-100">{new Date(snapshot.windowEndsAt).toLocaleString()}</dd></div> : null}
                  {typeof snapshot.elapsedHours === "number" ? <div><dt className="text-slate-400">elapsed</dt><dd className="text-slate-900 dark:text-slate-100">{snapshot.elapsedHours.toFixed(2)}h</dd></div> : null}
                </dl>
                <Link href={`/payments/${query.matchedPayment?.id}`} className="mt-3 inline-block text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline">
                  View full payment detail →
                </Link>
              </div>
            ) : null}

            {isMoneyAction ? (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-2">Action Guard</div>

                {decision.verdict === "BLOCK" ? (
                  <div className="space-y-2">
                    <button disabled className="w-full rounded-md border border-red-300 bg-red-50 dark:bg-red-950 px-4 py-2.5 text-sm font-medium text-red-400 cursor-not-allowed">
                      Refund/compensate — blocked
                    </button>
                    {!latestAction ? (
                      <div className="w-full rounded-md border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs text-slate-400 text-center">
                        Recording this attempt for the audit trail…
                      </div>
                    ) : latestAction.state === "overridden" || latestAction.state === "executed" ? (
                      <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                        Overridden by {AGENT_ID}: &ldquo;{latestAction.overrideReason}&rdquo; — state: {latestAction.state}
                        {latestAction.razorpayRefundId ? ` (refund ${latestAction.razorpayRefundId})` : ""}
                      </div>
                    ) : !showOverride ? (
                      <button
                        onClick={() => setShowOverride(true)}
                        className="w-full rounded-md border-2 border-amber-400 bg-amber-50 dark:bg-amber-950 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100"
                      >
                        Override (requires reason)
                      </button>
                    ) : (
                      <div className="space-y-2 rounded-md border-2 border-amber-400 bg-amber-50 dark:bg-amber-950 p-3">
                        <textarea
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="Required: why are you overriding this block? (min 5 characters)"
                          rows={2}
                          className="w-full rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={submitOverride}
                            disabled={busy || overrideReason.trim().length < 5}
                            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                          >
                            Confirm override & execute
                          </button>
                          <button onClick={() => setShowOverride(false)} className="text-xs text-slate-500">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : decision.verdict === "ALLOW" ? (
                  <div className="space-y-2">
                    {!latestAction ? (
                      <button
                        onClick={attemptAction}
                        disabled={busy}
                        className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Stage refund/compensation
                      </button>
                    ) : latestAction.state === "pending" ? (
                      <button
                        onClick={confirmAction}
                        disabled={busy}
                        className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Confirm & execute — real Razorpay Refunds API call
                      </button>
                    ) : latestAction.state === "executed" ? (
                      <div className="rounded-md bg-emerald-50 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                        Executed. {latestAction.razorpayRefundId ? `Razorpay refund id: ${latestAction.razorpayRefundId}` : ""}
                      </div>
                    ) : (
                      <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-300 dark:border-red-800 p-3 text-xs text-red-800 dark:text-red-300">
                        Action state: {latestAction.state}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                    Escalated for manual review — no automated action taken.
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950 p-5 text-sm text-amber-800 dark:text-amber-300">
          No payment could be matched confidently for this query — escalated for manual handling.
        </div>
      )}

      {error ? <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
    </div>
  );
}
