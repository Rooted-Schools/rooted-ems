# Window-open readiness

How Rooted EMS behaves when an application window opens and many families apply
at once, what is already safe, and the operational items to confirm before the
first pilot window opens (C.R. Neal and Cleveland open 2026-10-26).

## Summary

The architecture is well suited to a burst of applicants. The two things that
break most systems under load, a database connection pool that exhausts and a
first-come race for limited inventory, do not apply here. The remaining risks
are operational configuration items on Supabase and Resend, not code defects,
plus running an actual load test for evidence.

## Why the fundamentals hold

1. No database connection pool to exhaust. The app talks to Supabase over HTTP
   (PostgREST and GoTrue via `@supabase/supabase-js`), not a raw Postgres
   driver. Each Vercel serverless invocation makes stateless HTTP calls, so
   there are no per-request Postgres connections to run out of. Vercel scales
   functions horizontally on its own.

2. Seats are awarded by lottery, not first-come. When the window opens there is
   no race for limited seats. Every application submitted before the window
   closes is entered, and the lottery runs later. The classic thundering-herd
   fight over inventory does not exist at submission time.

3. The one piece of shared mutable state, the seat counters on `capacity_plan`,
   is maintained by database triggers using atomic in-place increments
   (`SET seats_offered = seats_offered + 1`), with a reconciliation pass and
   negative guards (migrations 00010 and 00048). Those fire in the later offer
   and accept phase, not during the submission burst, and they are
   concurrency-safe.

4. Each family's submission writes its own independent rows (its own
   application, guardian, student). There is no row every submission contends
   on.

## Hardened in code

- Idempotent submit (PR #97). `submitApplication` now uses a compare-and-set on
  status, so a double-tap or two concurrent submits of the same draft result in
  exactly one submission and one set of notifications, instead of two.

## Operational items to confirm before window-open

Ranked by likelihood of causing a problem.

1. Supabase Auth email OTP rate limit (highest priority). Family login uses
   Supabase email one-time codes (`signInWithOtp`). Supabase's built-in email
   sender is heavily rate-limited and is intended only for testing. If a custom
   SMTP is not configured for Auth, a burst of families requesting login codes
   will hit the limit and codes will not arrive, locking families out at the
   worst possible moment. Action: in the Supabase dashboard, configure a custom
   SMTP provider for Auth (Resend works, and is already used for transactional
   mail) and raise the Auth rate limits to match expected concurrent logins.
   This is separate from the transactional Resend key the app uses.

2. Resend transactional throughput. Each submission triggers a confirmation
   email plus staff notification. Sends are fire-and-forget, so they never slow
   or fail a submission, but confirmations can be delayed or dropped if the
   Resend plan's rate limit is hit during a burst. Action: confirm the Resend
   plan's send rate covers the expected peak, or accept that confirmations may
   trail the burst by a few minutes.

3. Supabase compute tier. PostgREST throughput and rate limits scale with the
   Supabase plan. Action: confirm the project's compute tier is sized for the
   expected concurrent read and write volume before 2026-10-26.

4. Load test for evidence. Run `scripts/load/window-open.k6.js` against a
   preview or staging deployment (it is read-only and safe against production,
   but staging is preferable). Watch the k6 thresholds (error rate under 1%,
   p95 under 1.5s) and the Supabase and Vercel dashboards for saturation. Raise
   `VUS` to model the peak you expect.

## Lower-priority follow-ups

- Duplicate distinct-draft guard. A family who runs the full new-application
  flow twice for the same child could create two applications (each
  `createApplication` mints a fresh student row, so `student_id` is not a
  stable dedup key). This is a data-quality and lottery-fairness issue, not a
  stability one. A guard belongs at submit time keyed on guardian plus window
  plus student name, and needs care so it never blocks a legitimate submission
  during a burst.
- Rate limiting on public endpoints. There is no rate limiting on the public
  inquiry or login endpoints. This is an abuse and bot concern more than a
  legitimate-load one.

## What the load test does not cover

The authenticated submit path is gated behind Supabase email OTP and cannot be
driven end to end from a load generator without real inboxes. The idempotent
submit fix and this document's Auth SMTP item cover that path instead. The k6
script exercises the public read surface every applicant hits before signing
in.
