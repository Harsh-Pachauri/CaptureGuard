import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { verifyWebhookSignature } from "@/lib/razorpay/webhookVerify";
import { applyEvent, extractPaymentEntityId } from "@/lib/payment-state/service";
import * as auditService from "@/lib/audit/auditService";

const SUPPORTED_EVENTS = new Set([
  "payment.authorized",
  "payment.captured",
  "payment.failed",
  "refund.created",
  "refund.processed",
]);

/**
 * Razorpay webhook receiver. Auth is the HMAC signature, not the bearer
 * token (Razorpay doesn't send one). Dedupe is enforced at the DB level via
 * the unique constraint on razorpay_event_id — a second delivery of the
 * same event is a confirmed no-op, not just skipped by application logic.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    await auditService.record({
      eventType: "webhook_signature_invalid",
      refTable: "webhook_events",
      refId: "unknown",
      detail: { signaturePresent: Boolean(signature), bodyPreview: rawBody.slice(0, 200) },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await auditService.record({
      eventType: "webhook_malformed_payload",
      refTable: "webhook_events",
      refId: "unknown",
      detail: { bodyPreview: rawBody.slice(0, 200) },
    });
    return NextResponse.json({ error: "Malformed payload" }, { status: 400 });
  }

  const eventType = payload.event;
  const createdAt = payload.created_at;
  if (typeof eventType !== "string" || typeof createdAt !== "number") {
    await auditService.record({
      eventType: "webhook_malformed_payload",
      refTable: "webhook_events",
      refId: "unknown",
      detail: { reason: "missing event/created_at field", bodyPreview: rawBody.slice(0, 200) },
    });
    return NextResponse.json({ error: "Malformed payload: missing event/created_at" }, { status: 400 });
  }

  // Razorpay's webhook body carries no event-id field of its own (unlike
  // e.g. Stripe's `id: evt_...`) — `event` + `created_at` + the affected
  // payment/refund id is what's stable across Razorpay's retries of the
  // same delivery and distinct across genuinely different events.
  const entityId = extractPaymentEntityId(payload);
  const eventId = entityId ? `${eventType}:${createdAt}:${entityId}` : `${eventType}:${createdAt}`;

  let webhookEventRow;
  try {
    webhookEventRow = await prisma.webhookEvent.create({
      data: {
        razorpayEventId: eventId,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        signatureValid: true,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await auditService.record({
        eventType: "webhook_duplicate_ignored",
        refTable: "webhook_events",
        refId: eventId,
        detail: { eventType },
      });
      return NextResponse.json({ status: "duplicate" }, { status: 200 });
    }
    throw err;
  }

  if (SUPPORTED_EVENTS.has(eventType)) {
    const result = await applyEvent(payload);
    await prisma.webhookEvent.update({
      where: { id: webhookEventRow.id },
      data: {
        processedAt: new Date(),
        razorpayPaymentId: result.razorpayPaymentId ?? undefined,
        paymentId: result.paymentDbId ?? undefined,
      },
    });
    if (!result.applied) {
      await auditService.record({
        eventType: "sync_failure",
        refTable: "webhook_events",
        refId: webhookEventRow.id,
        detail: { reason: result.reason, razorpayPaymentId: result.razorpayPaymentId },
      });
    }
  } else {
    // Not one of the events we act on, but still recorded for the audit
    // trail — an unrecognized event type is not itself an error.
    await prisma.webhookEvent.update({
      where: { id: webhookEventRow.id },
      data: { processedAt: new Date() },
    });
  }

  return NextResponse.json({ status: "accepted" }, { status: 200 });
}
