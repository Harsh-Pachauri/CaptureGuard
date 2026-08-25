# CaptureGuard — Live Demo Walkthrough

A run-along guide — read each numbered step right before you do it, not all at once. Every step:
what you click, what's happening behind it, why it matters, what you should see, and what to check
if it doesn't look right. Deeper design reasoning lives in `docs/ARCHITECTURE.md` instead.

**If anything goes sideways mid-rehearsal, don't debug live — run `npm run demo:reset` and restart
from Step 1.** It wipes local demo state (not your eval data, not real Razorpay orders) in one shot.

---

## Part 0 — Setup (once per rehearsal, before judges arrive)

**Step 1 — Reset local state (skip on a first-ever run).**
DO: `npm run demo:reset`
BEHIND THE SCENES: Deletes local rows for any previously-created real payments, their decisions/
actions/webhook events, demo support queries, and the audit rows about them. Resets the safety
window and match threshold back to defaults.
WHY: A half-finished previous attempt (e.g. Payment A refunded, B still pending) will contradict this
script's expected states.
EXPECT: A line like `Deleted: N payments, N decisions, ...` and `Merchant policy reset: window=24h`.
IF IT FAILS: `No merchant row found` → run `npm run db:seed:merchant` first.

**Step 2 — Start the app.**
DO: `npm run dev`, then open `http://localhost:3000`.
BEHIND THE SCENES: Boots the Next.js dev server.
WHY: Everything below needs it running.
EXPECT: Terminal shows `Ready`. Browser shows the public landing page.
IF IT FAILS: Port 3000 busy → another `next dev` is already running; stop it first.

**Step 3 — Log in to the dashboard.**
DO: Click **Sign in** from the landing page (or go straight to `/login`) and enter the admin password.
BEHIND THE SCENES: A real, HttpOnly-cookie session is created (`lib/auth/session.ts`) — the browser
doesn't hold or send any token itself. This rehearsal script uses the admin login throughout, not the
separate Judge Demo (`/judge` → `/test-lab`), because Step 12c needs `/admin`'s safety-window control
— a restricted Judge Demo session is deliberately not allowed to reach `/admin` at all. If you haven't
set an admin password yet: `npx tsx scripts/hash-admin-password.ts "your chosen password"` and put the
printed hash in `ADMIN_PASSWORD_HASH` in `.env`.
WHY: Every dashboard route and `/api/*` route (except the webhook receiver) requires an authenticated
session.
EXPECT: You land on **Overview**, with KPI tiles (Payments synced, Queries handled, Blocks issued,
Duplicate-payout risk prevented).
IF IT FAILS: "Invalid password" → check it matches what `ADMIN_PASSWORD_HASH` in `.env` was generated
from. Bounced straight back to `/login` → `SESSION_SECRET` in `.env` isn't set to 32+ random
characters.

**Step 4 — Create the four real Razorpay orders.**
DO: In a terminal, run `npx tsx scripts/create-demo-payments.ts` (or `npm run db:seed:demo`). Keep
this output visible — you'll need it for the next four steps.
BEHIND THE SCENES: Four real calls to Razorpay's Test Mode Orders API. Each order's notes include a
fixed customer reference (`demo-a`, `demo-b`, `demo-c`, `demo-e`) that CaptureGuard will read once the
payment syncs — this is what lets you reference a payment in Support Inbox by customer ref instead of
always pasting the raw payment id.
WHY: Order creation is the one part of this that's fully automatable; completing checkout isn't —
Razorpay Checkout is a hosted widget that needs a real browser.
EXPECT: Four blocks printed, each with an `order_...` id, its customer ref, and a checkout URL like
`http://localhost:3000/dev/checkout/order_XXXX?amount=150000&currency=INR`.
IF IT FAILS: `"RAZORPAY_KEY_ID/SECRET not set"` → not running from the project root, or `.env` is
incomplete. 401 from Razorpay → you've pasted Live keys instead of Test keys.

---

## Part 1 — Complete the four checkouts

Do all four now, back to back — it's the slow, manual part, so get it out of the way before judges
arrive. **Payment C is a special case: complete it now, but you won't use it again until Step 12.**

**Step 5 — Payment A: captured immediately.**
DO: Open Payment A's checkout URL from Step 4 → click **Pay (Test Mode)** → enter card
`4111 1111 1111 1111`, any future expiry (e.g. `12/30`), any 3-digit CVV → submit.
BEHIND THE SCENES: This order was created with `capture_immediately: true`, so Razorpay auto-captures
the moment the charge succeeds.
WHY: This is the payment you'll issue a *real* refund against later — proof the integration is
genuine, not simulated.
EXPECT: The checkout page shows a green success box with a real `pay_...` id.
IF IT FAILS: Card declined → you mistyped the test card number. Page stuck on "Loading Razorpay
Checkout…" → the `/api/dev/checkout-config` call failed; make sure you're logged in (Step 3).

**Step 6 — Payment B: authorized, not captured.**
DO: Same as Step 5, but on Payment B's checkout URL.
BEHIND THE SCENES: This order was created with `capture_immediately: false` — Razorpay leaves it
`authorized` instead of capturing it.
WHY: This is the exact state CaptureGuard exists to protect against.
EXPECT: Success screen with a real `pay_...` id (don't worry that nothing *looks* different from
Payment A yet — the difference is server-side, you'll see it in Step 11).
IF IT FAILS: Same as Step 5.

**Step 7 — Payment C: authorized, saved for later.**
DO: Same again, on Payment C's checkout URL.
BEHIND THE SCENES: Also authorized/uncaptured. You're completing it early on purpose so real time
passes while you run the rest of the demo.
WHY: By Step 12, you can shorten the safety window below however many minutes have already elapsed
and get an instant ESCALATE — no live waiting on stage.
EXPECT: Success screen, real `pay_...` id.
IF IT FAILS: Same as Step 5.

**Step 8 — Payment E: fails at the bank.**
DO: Open Payment E's checkout URL → use a Razorpay-documented "always fails" Test Mode card (check
your Razorpay Dashboard's Test Mode card reference — generic declines can behave inconsistently, so
use their specific failing card number).
BEHIND THE SCENES: The charge fails; Razorpay marks the payment `failed`.
WHY: Shows CaptureGuard treats a failed charge as informational only — never blocked, never escalated.
EXPECT: Checkout shows a failure message (this is the correct, desired outcome for this one payment).
IF IT FAILS (i.e. it succeeds instead): you used a card that doesn't reliably fail — swap for
Razorpay's documented failing test card.

---

## Part 2 — The live decisions

Go to **Support Inbox** in the nav bar for all of Steps 9–13.

**Step 9 — ALLOW: refund Payment A.**
DO: In the message box, type `refund my payment please`. In the customer ref field below it, type
`demo-a`. Click **Submit**.
BEHIND THE SCENES: Intent is extracted (refund_request) → the Matcher resolves `demo-a` to Payment A
→ CaptureGuard live-fetches Payment A from Razorpay (`captured: true`, no existing refund) → rule
**R3** fires.
WHY: The ordinary, unambiguous case — nothing to protect against, so the system lets the real action
through.
EXPECT: Decision Panel shows **ALLOW · R3**. Click **Stage refund/compensation**, then click
**Confirm & execute — real Razorpay Refunds API call**. A real `razorpay_refund_id` appears.
IF IT FAILS: Verdict is ESCALATE → the customer ref field didn't save; check you typed `demo-a`
exactly, no extra spaces. "Confirm" errors → check `RAZORPAY_KEY_SECRET` in `.env`.
SAY: *"The system checked Razorpay's live state, saw it's genuinely safe, and now — with your
confirmation — makes the real refund call."*

**Step 10 — Verify the refund landed.**
DO: Go to **Payments** in the nav → click Payment A's row.
BEHIND THE SCENES: Payment Detail always live-fetches on load.
WHY: Confirms the refund is real before you build the double-refund demo on top of it.
EXPECT: Status shows `refunded`, and the Decisions & Actions panel lists the executed action with its
refund id.
IF IT FAILS: Still shows `captured` → Step 9's confirm click didn't go through; redo it.

**Step 11 — BLOCK: try to refund Payment B.**
DO: Back in **Support Inbox**, submit: `bhai payment ho gaya but order failed dikha raha hai, refund
kar do`, with customer ref `demo-b`.
BEHIND THE SCENES: CaptureGuard live-fetches Payment B (`authorized`, `captured: false`, inside the
window) → rule **R4** fires.
WHY: This is the whole reason CaptureGuard exists — acting now risks paying the customer twice while
Razorpay is already handling the reversal on its own.
EXPECT: Decision Panel shows **BLOCK · R4**, the refund button greyed out, and an explanation citing
the real payment id, status, and the exact time the safety window ends.
IF IT FAILS: Verdict is ESCALATE (R0) → the live Razorpay fetch failed, check network/credentials.
Verdict is ALLOW → wrong customer ref, double-check `demo-b`.
SAY: *"Razorpay has accepted the payment, but it hasn't been captured. CaptureGuard prevents support
from blindly compensating the customer in this state."*

**Step 12a — Payment D: the double-refund catch.**
DO: Submit a second refund request for `demo-a` — e.g. `please refund me again, I never got my
money`.
BEHIND THE SCENES: Live fetch now shows `status: refunded` (from Step 9) → rule **R6** fires instead
of R3.
WHY: The other direction of the same risk — an agent who hasn't refreshed their screen, trying to
refund an already-resolved payment.
EXPECT: **BLOCK · R6** — "already resolved, refunding again risks paying twice."
IF IT FAILS: Shows ALLOW → Step 9's refund didn't actually execute; go verify via Step 10 again.
SAY: *"Same guard, opposite direction — it catches double refunds on the far side of the timeline too,
not just the near side."*

**Step 12b — ESCALATE: ambiguous query.**
DO: Submit a vague query with **no customer ref**: `customer bol raha hai paisa deduct hua`.
BEHIND THE SCENES: No payment can be confidently matched → rule **R1** fires.
WHY: Never guess which payment a vague message refers to.
EXPECT: **ESCALATE · R1** — "not confident enough, please provide a reference."
IF IT FAILS: It matched something anyway → you left a customer ref filled in from the previous step;
clear the field first.

**Step 12c — ESCALATE: the past-window edge case (Payment C).**
DO: Go to **Admin** in the nav. Note how many minutes have passed since Step 7 (when you completed
Payment C's checkout). Set **Auto-reversal safety window (hours)** to something smaller than that —
e.g. if ~10 minutes have passed, enter `0.1`. Click **Save**. Go back to **Support Inbox** and submit
`refund my payment please` with customer ref `demo-c`.
BEHIND THE SCENES: Elapsed time since Payment C's checkout now exceeds the (freshly shortened) window
→ rule **R5** fires instead of R4.
WHY: Razorpay's own stated window has passed with nothing observed yet — a genuine edge case for a
human to check directly, never a guess.
EXPECT: **ESCALATE · R5**.
IF IT FAILS: Still BLOCK · R4 → not enough real time has passed yet; lower the window further (try
`0.02`), save again, resubmit.
SAY: *"When the system isn't confident, or Razorpay's own window has quietly passed, it hands this to
a human instead of guessing either way."*

**Step 13 — Reset the window before moving on.**
DO: Back in **Admin**, set the window back to `24` and click **Save**.
WHY: So a leftover 6-minute window doesn't quietly break the rest of the demo (or a real merchant's
traffic, in production).
EXPECT: Field shows `24` after saving.

---

## Part 3 — The bigger picture

**Step 14 — Evaluation Dashboard.**
DO: Go to **Evaluation** → click **Run Evaluation**.
BEHIND THE SCENES: 23 synthetic cases run through the *exact same pipeline* you just used live —
AI/fallback → Matcher → Decision Engine — using seeded fixture payments instead of real Razorpay
calls.
WHY: Proves the false-allow rate — the single number that actually costs a merchant money — is a
real, re-runnable measurement, not a slide.
EXPECT: False-allow rate 0%, false-block rate 0%, verdict accuracy 100%, a ₹ "duplicate-payout risk
prevented" figure, and a by-category breakdown table.
IF IT FAILS: Numbers regress after you've edited the engine/matcher → that's the dashboard doing its
job; check which category broke in the table.
SAY: *"This is the number that matters most to a merchant — the false-allow rate — and it's zero,
computed live just now."*

**Step 15 — Audit Trail.**
DO: Go to **Audit Trail** → open the event-type dropdown → select `action_blocked`.
BEHIND THE SCENES: Every decision and action from this whole walkthrough has an append-only row with
full structured detail (rule id, verdict, explanation, real payment id).
WHY: Nothing was silent — a real support lead could reconstruct exactly why every block happened.
EXPECT: Entries for the BLOCK on Payment B (Step 11) and the double-refund attempt (Step 12a), each
with a JSON detail block.
IF IT FAILS: List looks empty → wrong filter selected, or you're in a different browser session than
the one the demo ran in.
SAY: *"Every block you just saw is permanently logged here — including if someone had overridden
it."*

---

## Demo-day checklist

- [ ] Ran `npm run demo:reset` if this isn't the first attempt today
- [ ] `npm run dev` running, logged into the dashboard with the admin password
- [ ] `npx tsx scripts/create-demo-payments.ts` run; A, B, C checkouts completed (E can wait)
- [ ] Payment A refunded (Step 9) *before* judges arrive, so Payment D is ready to go in one click
- [ ] `/admin` safety window is `24` (not left shortened from the ESCALATE step)
- [ ] Evaluation run once so the Overview tiles aren't empty
- [ ] This file open on a second screen/tab, scrolled to Step 9
