"use client";

import { Suspense, useEffect, useState, use as usePromise } from "react";
import Script from "next/script";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/client/apiClient";
import { TokenGate } from "@/components/TokenGate";

interface RazorpayCheckoutResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature?: string;
}
interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
}
type RazorpayConstructor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

type SyncState = "syncing" | "synced" | "failed";

function CheckoutInner({ orderId }: { orderId: string }) {
  const searchParams = useSearchParams();
  const [keyId, setKeyId] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [result, setResult] = useState<RazorpayCheckoutResponse | null>(null);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ keyId: string }>("/api/dev/checkout-config")
      .then((r) => setKeyId(r.keyId))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // In production a webhook does this the moment Razorpay sends
  // payment.authorized/captured. Locally there's no public URL for Razorpay
  // to deliver a webhook to, so nothing else will ever pull this payment
  // into CaptureGuard's database on its own — without this, the payment is
  // real and correct at Razorpay but invisible to the Matcher, which only
  // ever searches local rows. GET /api/payments/:id already does exactly
  // this live-fetch-and-adopt on first view; this just triggers it
  // immediately instead of requiring a manual click.
  function syncPayment(razorpayPaymentId: string) {
    setSyncState("syncing");
    setSyncError(null);
    apiFetch(`/api/payments/${razorpayPaymentId}`)
      .then(() => setSyncState("synced"))
      .catch((err) => {
        setSyncState("failed");
        setSyncError(err instanceof Error ? err.message : String(err));
      });
  }

  function open() {
    if (!keyId || !window.Razorpay) return;
    const amount = Number(searchParams.get("amount") ?? "0");
    const currency = searchParams.get("currency") ?? "INR";

    const rzp = new window.Razorpay({
      key: keyId,
      amount,
      currency,
      order_id: orderId,
      name: "CaptureGuard — Test Mode Demo",
      description: "Test Mode checkout — no real money moves",
      handler: (response: RazorpayCheckoutResponse) => {
        setResult(response);
        syncPayment(response.razorpay_payment_id);
      },
      theme: { color: "#0f172a" },
    });
    rzp.on("payment.failed", (response) => {
      setError(`Payment failed (this is expected/fine for the Payment E demo case): ${response.error?.description ?? "unknown reason"}`);
    });
    rzp.open();
  }

  return (
    <div className="mx-auto max-w-lg py-16 px-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" onReady={() => setScriptReady(true)} />
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Complete Test Checkout</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        Order <span className="font-mono">{orderId}</span>. Use a Razorpay published Test Mode card (e.g. 4111 1111
        1111 1111, any future expiry, any CVV) — this never moves real money.
      </p>

      {error ? <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {result ? (
        <div className="mt-4 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800 space-y-2">
          <div>Checkout completed. Razorpay payment id:</div>
          <div className="font-mono">{result.razorpay_payment_id}</div>

          {syncState === "syncing" ? (
            <div className="text-emerald-700">Syncing into CaptureGuard…</div>
          ) : syncState === "synced" ? (
            <div className="text-emerald-700">✓ Synced — this payment is now live in CaptureGuard.</div>
          ) : syncState === "failed" ? (
            <div className="space-y-1">
              <div className="text-red-700">Sync failed: {syncError}</div>
              <button
                onClick={() => syncPayment(result.razorpay_payment_id)}
                className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                Retry sync
              </button>
            </div>
          ) : null}

          <a
            href={`/payments/${result.razorpay_payment_id}`}
            className="inline-block text-emerald-700 underline"
          >
            Open this payment in CaptureGuard →
          </a>
        </div>
      ) : (
        <button
          onClick={open}
          disabled={!keyId || !scriptReady}
          className="mt-6 w-full rounded-md bg-slate-900 dark:bg-slate-100 px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-50"
        >
          {!scriptReady ? "Loading Razorpay Checkout…" : "Pay (Test Mode)"}
        </button>
      )}
    </div>
  );
}

export default function DevCheckoutPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = usePromise(params);
  return (
    <TokenGate>
      <Suspense fallback={null}>
        <CheckoutInner orderId={orderId} />
      </Suspense>
    </TokenGate>
  );
}
