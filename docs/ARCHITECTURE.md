# CaptureGuard — Architecture

One Next.js app (App Router), one Postgres-compatible database (SQLite locally, Postgres/Supabase in
production), one frontend. No microservices, no message queue.

## Module map

```
/app/api/...                    every backend endpoint, as route handlers
/lib
  /razorpay
    client.ts                   READ-ONLY: create order, fetch payment
    mutationClient.ts           the ONLY module that can call Refunds API — imported ONLY by lib/action-guard
    webhookVerify.ts            HMAC-SHA256 signature verification
    http.ts                     retry-with-backoff, RazorpayUnavailableError
  /decision-engine
    types.ts, rules.ts, engine.ts   pure functions, zero I/O, the rule table (R0..R8)
  /ai
    schema.ts                   Zod structured-output contract + validation
    extract.ts                  AIExtractionService — talks to the configured provider, returns IntentExtraction|null
    fallbackMatcher.ts          deterministic keyword fallback (English + Hinglish)
    providers/anthropic.ts      one interchangeable adapter behind AI_PROVIDER
    index.ts                    resolveExtraction() — the single entry point production AND eval both call
  /matcher/paymentMatcher.ts    explicit-reference-first, customer-ref heuristic fallback, DB-validated
  /payment-state/service.ts     normalization, invalid-transition rejection, getLive() (mandatory fresh fetch), applyEvent()
  /action-guard/actionGuard.ts  attempt / confirmAndExecute / override — verdict re-checked server-side every time
  /audit/auditService.ts        append-only record() + query()
  /pipeline/runSupportQuery.ts  orchestrates AI → Matcher → live fetch → Decision Engine → persistence, once
  /eval/runner.ts               replays eval_cases through the SAME pipeline, with a fixture-reading payment source
  /db/client.ts, merchant.ts    Prisma singleton, single-merchant lookup
/prisma/schema.prisma           schema (Section 4 of the blueprint)
/scripts                        one-off setup utilities, not part of the request path
/tests/unit, /tests/integration mirrors the module structure
```

## The one rule that matters most

**Every gated decision performs its own live Razorpay fetch, regardless of cache state.** Webhooks
update the local cache for speed and UI responsiveness only. `lib/payment-state/service.ts#getLive()`
is the only function that is allowed to feed the Decision Engine, and it always calls Razorpay fresh.
If that call fails, `sourceAvailable: false` is passed to the engine, and rule **R0** fires:
**ESCALATE**, never a guess.

## The security boundary that's enforced structurally, not just by convention

`lib/razorpay/mutationClient.ts` exports `createRefund()`. It is imported in exactly one place:
`lib/action-guard/actionGuard.ts`. Nowhere else in the codebase — not the AI module, not a route
handler directly, not the matcher — imports it. A `grep -rn "mutationClient" --include=*.ts` from the
repo root should always return exactly two files: the module itself and the Action Guard. This is
what makes "the AI accidentally calls the refund API" architecturally impossible.

## Why the auto-reversal-vs-merchant-refund distinction doesn't depend on an unverified webhook field

Section 7 of the blueprint flags this explicitly as unverified: telling a Razorpay-initiated
auto-reversal apart from a merchant-initiated refund by inspecting a webhook payload's `reason`
field. `lib/payment-state/service.ts#normalizeStatus()` avoids depending on that field entirely: a
refund can only ever reach a payment that was captured via the merchant's own Refunds API (Razorpay
requires capture before refund), so `captured === false` at the moment status resolves to
`"refunded"` can only mean Razorpay's own auto-reversal of an authorization that was never captured.
This is derived from a field the blueprint's Section 1 already confirmed (`captured`), not the
unverified one — and it doesn't change any BLOCK/ESCALATE behavior either way, since rule R6 blocks
on `refunded`, `partially_refunded`, and `auto_reversed` identically.

## Data source labeling

`payments.data_source` is one of `real` (from an actual Razorpay Test Mode payment), `fixture` (a
seeded, clearly-labeled historical fixture used to demo a past-window state without waiting hours),
or `eval` (100% synthetic, evaluation-only). The UI badges every payment with this. The live dashboard
pipeline (Support Inbox → Decision Panel) always calls the real Razorpay API regardless of a payment's
data source — this is intentional: it's what proves a `fixture`/`eval` payment id that doesn't exist
at Razorpay correctly triggers R0 (fail-safe ESCALATE) rather than a guessed verdict, when driven
through the live path instead of the eval runner's fixture-reading path.

## Local dev vs. deployment

Locally: SQLite (`prisma/schema.prisma`, `provider = "sqlite"`), zero external services required.
For deployment: change `provider` to `"postgresql"`, point `DATABASE_URL` at Supabase (or any
Postgres), run `npx prisma db push`. Every field type used in the schema (`String`, `Int`, `Float`,
`Boolean`, `DateTime`, `Json`) is portable across both providers — no other schema changes needed.
