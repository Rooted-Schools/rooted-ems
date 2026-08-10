# Rooted EMS — Red-Team Remediation Handoff

> ## ✅ VERIFICATION RESULTS — 2026-08-10
> Run directly against production (project `rooted-ems`, read-only object-level checks):
>
> - **Section 1 (migration 00039): APPLIED.** `trg_protect_is_staff` exists, `profile_own_update` has its WITH CHECK, `audit_event` has zero insert policies, storage staff-read policy is re-keyed to `user_campus_role`. Migrations **00035–00044 are ALL applied** (verified by object existence, not the ledger).
> - **Section 2 (bucket): PASS.** `documents` bucket is **private**.
> - **Section 3 (data state): CLEAN.** 0 staff without campus roles; 0 orphaned waitlist promotions (no families were dropped by the old broken cron); packet requirements populated (36 per campus, 2026-27); all three campus reply-to emails set. **Open: still exactly 1 system_admin** — the single-point-of-failure decision remains with Steven.
> - **Journey engine ("Push to Apply" 7/0/0): NOT frozen — genuinely waiting.** 7 active enrollments, zero overdue; the earliest step comes due 2026-08-11 19:29 UTC, so the first sends should go out with the 2026-08-12 16:30 UTC cron run. No journey step, offer reminder, or registration nudge has ever left a DB trace — consistent with "nothing due yet," but cron liveness itself is still unproven until the first heartbeat stamps land (PR #20) or a Vercel invocation log is checked.
> - **Section 4 (Vercel) — VERIFIED 2026-08-10 via dashboard:** `CRON_SECRET` EXISTS (all environments), as do `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `LEAD_WEBHOOK_SECRET`, Supabase vars, and `NEXT_PUBLIC_SENTRY_DSN`. Cron feature is Enabled with the full schedule live, including `event-followups` hourly (Pro plan accepted it) and `keep-the-seat` daily. **Twilio vars confirmed absent** — SMS stays off until added (Section 5). Minor hygiene: Vercel flags `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` "Needs Attention" (not marked Sensitive) — 30-second fix in the dashboard.
> - **Still open: Section 5 (Twilio, when ready) and Section 6 (governance decisions, incl. the single system_admin).**

**For:** a Claude session with access to the Rooted EMS production Supabase project (and ideally the Vercel + Twilio dashboards).
**From:** the 2026-08-06 full red team + fix wave (see PR "fix/notification-context-and-nudge-ux" and commit history).
**Context:** Rooted EMS is the production enrollment system at enroll.rootedschool.org for Rooted School Foundation (charter network; minor-student PII). A four-dimension red team (functional, security, UX, operability) found ~60 issues. Everything fixable in code was fixed and is in the PR. This file is the remainder: actions that need database access, dashboard access, or a human decision. Work top to bottom — the order is by risk.

Rules for the executing session:
- Read-only queries freely; every WRITE/DDL step below requires a fresh backup/PITR confirmation first (Supabase → Database → Backups).
- Never fabricate results. If a check can't be run, say so explicitly.
- Do not weaken any policy beyond what a step specifies.

---

## 1. APPLY MIGRATION 00039 (security-critical — do this first)

File: `supabase/migrations/00039_security_hardening.sql` in the repo (merged with the PR). Paste the whole file into the SQL Editor and run once.

What it closes (all confirmed exploitable in the red team):
- Any family user could set `is_staff = true` on their own profile via PostgREST (the update policy had no WITH CHECK), then read **every student document in the network** through the storage policy keyed to that bit.
- Any authenticated user could insert forged rows into `audit_event`, `communication_log`, and `contact_log` (e.g., fabricate an audit trail entry attributed to any staff member).
- Any authenticated user had full write access to null-campus rows in `message_template`, `note`, `tag`, `setting`, and `journey`.
- The email suppression list (bounced/complaining family addresses) was readable by any authenticated user.

Post-apply verification (run each; expected result in parentheses):

```sql
-- Trigger exists (1 row)
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_protect_is_staff';

-- Update policy now has a WITH CHECK (with_check column not null)
SELECT polname, pg_get_expr(polwithcheck, polrelid) AS with_check
FROM pg_policy WHERE polname = 'profile_own_update';

-- audit_event has NO insert policy left (0 rows)
SELECT polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'audit_event' AND p.polcmd = 'a';

-- Storage staff-read policy no longer references is_staff (definition shows user_campus_role)
SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname = 'objects' AND polname = 'Staff can read all documents';
```

## 2. VERIFY THE DOCUMENTS BUCKET IS PRIVATE

The repo never creates the bucket, so its visibility was set in the dashboard and could not be verified from the code side. If it is public, every uploaded family document (birth certificates, custody orders, IEPs) is fetchable by URL with no auth at all.

```sql
SELECT id, name, public FROM storage.buckets;
```
Expected: `documents` row with `public = false`. If `true`: flip it in Dashboard → Storage → documents → Configuration immediately, then spot-check that the app's signed-URL flows still work (they should — the app already uses signed URLs everywhere).

## 3. DATA-STATE CHECKS (read-only, then report)

```sql
-- 3a. Anyone with staff powers but no campus role? (Should be zero rows.
-- Such an account is an implicit org-wide reader; either give it a real
-- role or clear is_staff.)
SELECT up.id, up.email FROM user_profile up
WHERE up.is_staff = true
AND NOT EXISTS (SELECT 1 FROM user_campus_role ucr WHERE ucr.user_id = up.id);

-- 3b. Is there a second system_admin? (Red team: Steven is a single point
-- of failure for team management, school-year setup, and lockouts.)
SELECT ucr.role, up.email, c.name AS campus
FROM user_campus_role ucr
JOIN user_profile up ON up.id = ucr.user_id
JOIN campus c ON c.id = ucr.campus_id
ORDER BY ucr.role, up.email;
-- Report: how many distinct humans hold system_admin. If only one, flag it.

-- 3c. Packet requirements exist for live campus/year pairs? (If empty, a
-- family who accepts an offer gets a registration packet with ZERO items
-- and a blank page.)
SELECT c.name, sy.name AS school_year, count(pr.id) AS requirements
FROM campus c
CROSS JOIN school_year sy
LEFT JOIN packet_requirement pr ON pr.campus_id = c.id AND pr.school_year_id = sy.id
WHERE sy.is_current = true
GROUP BY 1, 2 ORDER BY 1;

-- 3d. Campus reply-to emails populated? (Drives every family email Reply-To.)
SELECT name, email FROM campus;

-- 3e. Orphaned "promoted" waitlist families: the broken cron path stamped
-- some waitlist rows promoted without ever creating the offer. Find victims:
SELECT wp.id, wp.application_id, wp.removed_at
FROM waitlist_position wp
WHERE wp.removal_reason = 'promoted'
AND NOT EXISTS (
  SELECT 1 FROM offer o
  WHERE o.application_id = wp.application_id
  AND o.created_at >= wp.removed_at - interval '1 hour'
);
-- Any rows returned = families silently dropped from the waitlist with no
-- offer. Report them; restoring is a human decision (Steven), not automatic.
```

## 4. VERCEL ENVIRONMENT (dashboard)

Settings → Environment Variables (Production). Confirm each EXISTS (do not paste values anywhere):

| Variable | Why it matters |
|---|---|
| `CRON_SECRET` | Every cron 401s without it — all 10 schedules silently dead. Also signs inquiry step-2 tokens and salts rate limits. |
| `NEXT_PUBLIC_APP_URL` = `https://enroll.rootedschool.org` | Twilio webhook signature reconstruction; links in SMS. Code now falls back to the production URL, but set it explicitly. |
| `RESEND_API_KEY` | All family email. |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS activation (all three or SMS stays off; the code treats a partial set as not connected). |
| `LEAD_WEBHOOK_SECRET` | Lead-ingest webhook auth. |

Then confirm the cron schedule took effect after the PR's deploy: Vercel → Settings → Cron Jobs should list **10** jobs including `event-followups` (hourly) and `keep-the-seat` (daily). Hourly crons need a paid plan — if the plan blocks it, report which cadence was accepted.

## 5. TWILIO (dashboard, if/when SMS goes live)

1. Phone number → Messaging → "A message comes in" → Webhook `https://enroll.rootedschool.org/api/webhooks/twilio`, HTTP POST.
2. After env vars are set + redeployed: text the number from a personal phone → a staff in-app notification "Text reply from …" should appear; reply STOP → `sms_consent` should flip false:
```sql
SELECT phone, sms_consent, updated_at FROM guardian
WHERE phone LIKE '%<last4>%' ORDER BY updated_at DESC LIMIT 5;
```

## 6. DECISIONS THAT NEED STEVEN (report, don't act)

- **Second system_admin**: who? (Team management, year setup, and lockouts currently die with one person.)
- **CAN-SPAM postal address**: marketing emails carry no physical address. Which address (per campus or RSF central)? Once decided, it's a one-line template change.
- **TCPA consent copy**: the inquiry checkbox ("It's OK to text me at this number") should be reviewed by counsel as prior express written consent for recruitment texts; outbound marketing SMS should carry "Reply STOP to opt out" — copy change pending this review.
- **Data-processor inventory**: Resend, Twilio, Sentry, Google Sheets sync all touch family PII — do DPAs exist?
- **Breach-notification plan**: WA / OH / SC / LA all differ.
- **Key rotation**: `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` have never rotated; `CRON_SECRET` currently secures three unrelated controls (cron auth, token signing, rate-limit salt) — consider splitting.

## 7. KNOWN REMAINING BACKLOG (code-side, none security-critical)

Tracked for future sessions, deliberately not in the fix wave: per-campus storage path scoping (deeper fix behind item 1), school-year/grade-level setup UI (currently DB-locked to system_admin — biggest operability gap for a new cycle), cron-health surface (last-run timestamps on Settings), off-token color maps on audit/team/reports/seats pages, structured call-log table, the five season runbooks (Lottery Day, New School Year Handoff, Offer Season, Daily Rhythm, When Something Breaks), and a real dry run — Lalah or a Vancouver staffer soloing a lottery + offer batch without Steven.
