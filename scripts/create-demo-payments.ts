// Creates the real Razorpay Test Mode orders for Payments A, B, C, E
// (Section 15). This is the ONLY part that can be fully automated
// server-side: Razorpay Checkout itself is a hosted widget that requires an
// actual browser completing a real (Test Mode) card entry — there is no
// pure API call that "completes a checkout." That manual/semi-manual step
// is unavoidable and is exactly what the blueprint's own testing strategy
// (Section 19) calls out: "a manually-run smoke-test script exercises the
// real Test Mode API end-to-end before each demo/deploy."
//
// Each order carries a fixed, memorable `customer_ref` in its notes
// (demo-a / demo-b / demo-c / demo-e) — lib/payment-state/service.ts reads
// this into payments.customer_ref on sync, which is what lets the
// Support Inbox demo match a query by customer reference (the realistic
// flow) instead of requiring the raw pay_... id pasted into every message.
//
// What this script does:
//   1. Creates real orders via the Orders API for A, B, C, E.
//   2. Prints the order id + a checkout URL (served by this app at
//      /dev/checkout/[orderId]) for each — open that page in a browser and
//      complete Test Checkout with a Razorpay test card to produce a real
//      authorized/captured/failed payment.
//   3. Once checkout completes, the webhook (if registered) or the
//      Payment Detail page's "re-sync" button pulls the resulting payment
//      into CaptureGuard.
//
// Payment D ("already refunded") is deliberately NOT a separate order:
// run this script, complete Payment A's checkout, then use the app itself
// to ALLOW+confirm a real refund on it (R3) — Payment A immediately
// becomes Payment D. Trying to refund it again live is what demonstrates
// R6. See docs/DEMO_SCRIPT.md for the full walkthrough.
import "./env"; // must be first: loads .env before any project import reads process.env
import { createOrder } from "../lib/razorpay/client";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

async function main() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error(
      "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set in .env. Fill them in with your real Test Mode credentials before running this script."
    );
    process.exit(1);
  }

  console.log("Creating real Razorpay Test Mode orders for the demo walkthrough...\n");

  const orderA = await createOrder({
    amount: 150000, // ₹1,500.00
    capture_immediately: true,
    notes: {
      demo_case: "A",
      customer_ref: "demo-a",
      label: "Normal ALLOW — captured immediately, refund it live on stage",
    },
  });
  console.log("Payment A (normal ALLOW):");
  console.log(`  order: ${orderA.id}`);
  console.log(`  customer ref: demo-a`);
  console.log(`  checkout: ${APP_URL}/dev/checkout/${orderA.id}?amount=150000&currency=INR\n`);

  const orderB = await createOrder({
    amount: 95000, // ₹950.00
    capture_immediately: false,
    notes: {
      demo_case: "B",
      customer_ref: "demo-b",
      label: "The central BLOCK case — authorized, never captured",
    },
  });
  console.log("Payment B (the central BLOCK case):");
  console.log(`  order: ${orderB.id}`);
  console.log(`  customer ref: demo-b`);
  console.log(`  checkout: ${APP_URL}/dev/checkout/${orderB.id}?amount=95000&currency=INR\n`);

  const orderC = await createOrder({
    amount: 60000, // ₹600.00
    capture_immediately: false,
    notes: {
      demo_case: "C",
      customer_ref: "demo-c",
      label: "ESCALATE edge case — shorten the demo window in /admin later to let this elapse instantly",
    },
  });
  console.log("Payment C (ESCALATE — past-window edge case):");
  console.log(`  order: ${orderC.id}`);
  console.log(`  customer ref: demo-c`);
  console.log(`  checkout: ${APP_URL}/dev/checkout/${orderC.id}?amount=60000&currency=INR`);
  console.log(
    "  Complete this checkout now; you'll come back to it later in the ESCALATE step of docs/DEMO_SCRIPT.md.\n"
  );

  const orderE = await createOrder({
    amount: 30000, // ₹300.00
    capture_immediately: false,
    notes: {
      demo_case: "E",
      customer_ref: "demo-e",
      label: "Informational only — complete checkout with a card that fails",
    },
  });
  console.log("Payment E (informational, no money at stake):");
  console.log(`  order: ${orderE.id}`);
  console.log(`  customer ref: demo-e`);
  console.log(`  checkout: ${APP_URL}/dev/checkout/${orderE.id}?amount=30000&currency=INR`);
  console.log("  Use a Razorpay test card documented to fail at the bank step to produce a real payment.failed webhook.\n");

  console.log(
    "Payment D (double-refund prevention) is not a separate order — see the comment at the top of this file and docs/DEMO_SCRIPT.md."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
