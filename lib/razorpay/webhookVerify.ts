import crypto from "node:crypto";

/**
 * Verifies Razorpay's HMAC-SHA256 webhook signature: recompute the HMAC over
 * the *raw* request body using the webhook secret, compare to the
 * X-Razorpay-Signature header with a constant-time comparison. Never parse
 * the body into JSON and re-stringify before verifying — that can change
 * byte-for-byte formatting and produce false rejects or, worse, false
 * accepts if done carelessly.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!signature || !secret) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "utf8");
  const givenBuf = Buffer.from(signature, "utf8");

  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}
