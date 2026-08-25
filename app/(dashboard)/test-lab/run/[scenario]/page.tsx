"use client";

import { useEffect, useState, use as usePromise } from "react";
import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client/apiClient";
import { getJudgeScenario } from "@/lib/judge/scenarios";

const AMOUNT_PAISE = 50000; // ₹500 — fixed, clearly a test amount, same scale as the existing dev checkout harness

interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature?: string;
}
interface RazorpayFailedResponse {
  error: {
    description?: string;
    metadata?: { order_id?: string; payment_id?: string };
  };
}
interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: RazorpayFailedResponse) => void) => void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

// Deliberately not a `declare global` augmentation of Window — that would
// collide with the identical (but nominally distinct) one already declared
// in app/dev/checkout/[orderId]/page.tsx, since global declarations merge
// across the whole program. A local cast keeps this file fully
// self-contained instead of touching that existing file.
function getRazorpayConstructor(): RazorpayConstructor | undefined {
  return (window as unknown as { Razorpay?: RazorpayConstructor }).Razorpay;
}

type Phase =
  | "creating-order"
  | "awaiting-checkout"
  | "syncing"
  | "submitting-refund"
  | "redirecting"
  | "error";

export default function TestLabRunPage({ params }: { params: Promise<{ scenario: string }> }) {
  const { scenario: scenarioId } = usePromise(params);
  const scenario = getJudgeScenario(scenarioId);
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("creating-order");
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [keyId, setKeyId] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Resets phase/error synchronously during render when "Retry from the
  // start" bumps `attempt` — React's own documented "adjusting state
  // during render" pattern (comparing to a previous-value state and
  // conditionally calling setState mid-render), the same technique
  // lib/client/useStaggerReveal.ts already uses elsewhere in this repo.
  // This project's lint config forbids synchronous setState inside an
  // effect body, which putting this reset in the effect below would hit.
  const [prevAttempt, setPrevAttempt] = useState(attempt);
  if (attempt !== prevAttempt) {
    setPrevAttempt(attempt);
    setPhase("creating-order");
    setError(null);
  }

  // Step 1 — create a fresh, real Razorpay Test Mode order (reuses the
  // existing POST /api/dev/orders route unchanged; capture_immediately:
  // false so the resulting payment is authorized-but-uncaptured for the
  // BLOCK/ALLOW scenarios — irrelevant for ESCALATE, since that payment
  // never successfully authorizes at all).
  useEffect(() => {
    if (!scenario) return;
    let cancelled = false;
    Promise.all([
      apiFetch<{ orderId: string }>("/api/dev/orders", {
        method: "POST",
        body: JSON.stringify({ amount: AMOUNT_PAISE, currency: "INR", capture_immediately: false }),
      }),
      apiFetch<{ keyId: string }>("/api/dev/checkout-config"),
    ])
      .then(([order, config]) => {
        if (cancelled) return;
        setOrderId(order.orderId);
        setKeyId(config.keyId);
        setPhase("awaiting-checkout");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, attempt]);

  // Step 3 — adopt the real payment into CaptureGuard (same live-fetch-
  // and-adopt GET /api/payments/:id already used everywhere else; no
  // webhook is required for this to work). Then either auto-submit a
  // refund query (BLOCK) or hand off to the existing Payment Detail page
  // (ALLOW/ESCALATE), which already has the real capture flow built in.
  async function syncAndProceed(razorpayPaymentId: string) {
    if (!scenario) return;
    setPhase("syncing");
    try {
      const detail = await apiFetch<{ payment: { id: string } }>(`/api/payments/${razorpayPaymentId}`);
      const localPaymentId = detail.payment.id;

      if (scenario.action === "refund") {
        setPhase("submitting-refund");
        const result = await apiFetch<{ queryId: string }>("/api/support-queries", {
          method: "POST",
          body: JSON.stringify({
            text: `Please refund my payment ${razorpayPaymentId} — Judge Demo (${scenario.label}).`,
            customerRef: "judge-demo",
            source: "demo",
          }),
        });
        setPhase("redirecting");
        router.push(`/inbox/${result.queryId}`);
      } else {
        setPhase("redirecting");
        router.push(`/payments/${localPaymentId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  function openCheckout() {
    const RazorpayCtor = getRazorpayConstructor();
    if (!keyId || !orderId || !RazorpayCtor || !scenario) return;
    const rzp = new RazorpayCtor({
      key: keyId,
      amount: AMOUNT_PAISE,
      currency: "INR",
      order_id: orderId,
      name: "CaptureGuard — Judge Demo (Test Mode)",
      description: `${scenario.label} — no real money moves`,
      handler: (response: RazorpayCheckoutResponse) => {
        syncAndProceed(response.razorpay_payment_id);
      },
      theme: { color: "#0f172a" },
    });
    rzp.on("payment.failed", (response) => {
      const failedPaymentId = response.error?.metadata?.payment_id;
      if (scenario.checkoutOutcome === "failure" && failedPaymentId) {
        // This IS the desired outcome for ESCALATE — not an app error.
        syncAndProceed(failedPaymentId);
        return;
      }
      setError(response.error?.description ?? "Checkout failed");
      setPhase("error");
    });
    rzp.open();
  }

  if (!scenario) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        Unknown scenario. <Link href="/test-lab" className="underline">Back to Test Lab</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/test-lab" className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
        ← Back to Test Lab
      </Link>

      <div>
        <span className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300">
          {scenario.label}
        </span>
        <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">{scenario.title}</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{scenario.description}</p>
      </div>

      <Script src="https://checkout.razorpay.com/v1/checkout.js" onReady={() => setScriptReady(true)} />

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        {phase === "creating-order" ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Preparing a fresh Test Mode payment…</div>
        ) : phase === "awaiting-checkout" ? (
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">
                Step 1 of 2 — authorize a real Razorpay Test Mode payment
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{scenario.checkoutGuidance}</p>
            </div>
            <button
              onClick={openCheckout}
              disabled={!scriptReady}
              className="w-full rounded-md bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50"
            >
              {!scriptReady ? "Loading Razorpay Checkout…" : "Pay with Razorpay (Test Mode) →"}
            </button>
            <p className="text-xs text-slate-400">₹{AMOUNT_PAISE / 100} · Test Mode only. This never moves real money.</p>
          </div>
        ) : phase === "syncing" ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Payment received — fetching its live state from Razorpay…
          </div>
        ) : phase === "submitting-refund" ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Live state confirmed — submitting the refund request through the real pipeline…
          </div>
        ) : phase === "redirecting" ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Verdict ready — opening the record…</div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            <button
              onClick={() => setAttempt((n) => n + 1)}
              className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Retry from the start
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
