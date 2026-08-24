// Shared HTTP plumbing for both Razorpay clients: retry-with-backoff and a
// single error type the rest of the app treats as "Razorpay is unreachable."
// Per Section 6/12 of the blueprint: two retries with short backoff, then the
// call is treated as unavailable — for a live-fetch feeding the Decision
// Engine this becomes a hard ESCALATE trigger (R0), never a silent fallback
// to cached data.

export class RazorpayUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RazorpayUnavailableError";
  }
}

export function razorpayAuthHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new RazorpayUnavailableError(
      "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured"
    );
  }
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

const REQUEST_TIMEOUT_MS = 8000;
const RETRIES = 2;
const BACKOFF_MS = 300;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch with a timeout and up to two retries on network failure or 5xx.
 * 4xx responses are returned as-is (not retried) — those are caller errors
 * (bad request, wrong id), not availability problems.
 */
export async function requestWithRetry(
  url: string,
  options: RequestInit
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.status >= 500) {
        lastError = new Error(`Razorpay responded ${res.status}`);
        if (attempt < RETRIES) {
          await sleep(BACKOFF_MS * (attempt + 1));
          continue;
        }
        throw new RazorpayUnavailableError(
          `Razorpay API returned ${res.status} after ${RETRIES + 1} attempts`
        );
      }

      return res;
    } catch (err) {
      if (err instanceof RazorpayUnavailableError) throw err;
      lastError = err;
      if (attempt < RETRIES) {
        await sleep(BACKOFF_MS * (attempt + 1));
        continue;
      }
      throw new RazorpayUnavailableError(
        `Razorpay API unreachable after ${RETRIES + 1} attempts: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  // Unreachable, but keeps TypeScript happy.
  throw new RazorpayUnavailableError(
    `Razorpay API unreachable: ${String(lastError)}`
  );
}
