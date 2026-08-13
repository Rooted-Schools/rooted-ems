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

> ## ✅ 2026-08-12 — Full Red Team (functional, security, UX, operability)
> This pass covered the app code, the operational runbooks, and the family-facing email copy, on top of the database/infra items above.
>
> - **Documents storage bucket: VERIFIED PRIVATE in production.** Re-confirmed directly against the live `storage.buckets` table; `documents.public = false` still holds.
> - **Per-campus storage scoping and family-write RLS hardening: SHIPPED and APPLIED in migration `00048_redteam_hardening.sql`, plus `00049_email_event_campus_scope.sql`.** Both were applied to production on 2026-08-12 and each object was verified present afterwards (storage policy replaced, bucket private, four new triggers, split guardian_student and application_answer policies, year-scoped capacity triggers). They close the gap where any staff role on any campus could read another campus's family documents through storage directly rather than through the app layer, close the family-side write gaps on `application`, `application_answer`, `guardian_student`, `registration_item` and `document` that PostgREST allowed even though the app never exposed them (self-verified paperwork, forged status, self-granted sibling priority, binding another family's student to your own guardian record), and scope `email_event` reads by the lead's campus.
>
>   Note for anyone reading an older working copy: a duplicate `00048_redteam_hardening_2.sql` briefly existed and was removed. It overlapped the applied migration and shared its number. Its one unique fix became `00049`. One idea from it was deliberately not taken: splitting `app_family` into per-command policies with `WITH CHECK`. The column-protection trigger in `00048` already blocks the exploit, and splitting the policy risks breaking legitimate family draft edits, so it is available as optional future defense in depth rather than a pending fix.
> - **Campus phone numbers: fictional `555` seed values cleared from production.** The seed migrations (`00012`, `00016`, `00017`) originally loaded placeholder `555` numbers for campus contact info. These have been cleared from the production `campus` table until real numbers are supplied; do not backfill with another placeholder. Confirm real campus phone numbers are entered before anything in the app (or a runbook) implies a family can call a campus at the number on file.
>
> **Remaining human-only items from this pass (report only, no automated fix possible):**
> - **Supabase backups / PITR:** the one-time verification checklist in `docs/runbook-backup-restore.md` ("Supabase Dashboard → Project → Database → Backups: confirm daily backups are listed and note the retention period," and the PITR enable/skip decision) is still unchecked. Someone with dashboard access needs to actually look, record what they find, and check the boxes in that file.
> - **Data processing agreements:** confirm whether DPAs exist for Resend, Twilio, and Sentry. All three handle family personal information (email/SMS content and error-tracking payloads respectively), and this has not been verified as of this pass. (This duplicates the open item already tracked in Section 6 below; recording it here too so it isn't lost in a partial read of this file.)
> - **Retention schedule for inactive family records:** there is currently no deletion path for families whose enrollment has ended (withdrawn, graduated, or otherwise no longer active) and no decided retention period for their records. This needs a policy decision (how long to retain, and from whom: RSF leadership, counsel, or both) before any deletion tooling gets built.

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

### Email open tracking (00045)

File: `supabase/migrations/00045_email_events.sql`. Adds `email_event`, keyed
by the Resend message id, so journey/campaign/welcome/re-engagement sends can
be matched back to delivery/open/click webhook events and shown on the
journey roster and lead timeline. Purely additive; every reader/writer in the
codebase (`lib/email.ts`, `app/api/webhooks/resend/route.ts`,
`lib/queries/journeys.ts`) degrades gracefully when this table doesn't exist
yet, so applying it is not urgent, but two things are both required before
opens/clicks actually populate:

1. Apply this migration (same paste-into-SQL-Editor process as Section 1).
2. In the Resend dashboard, enable open tracking and click tracking on the
   sending domain — Resend does not emit `email.opened` / `email.clicked`
   webhook events at all until that's turned on.

Read the migration's header comment before treating "opened" as a real
metric — Apple Mail Privacy Protection inflates it toward 100% on an
iOS-heavy list; clicks are the reliable signal.

### Two-way email (00046)

File: `supabase/migrations/00046_inbound_email.sql`. Adds `inbound_email` so
a parent replying to any system email lands on the family's timeline, alerts
campus staff in-app, and still reaches a human (a full copy forwards to the
campus's real inbox with the parent's address as the forward's Reply-To).
Handled in `lib/inbound-email.ts`, wired into the existing Resend webhook
(`app/api/webhooks/resend/route.ts`, `email.received` event). Purely
additive plus one constraint loosening (`note.created_by` becomes nullable,
for system-authored notes — see the migration's own comment); every
reader/writer degrades gracefully when this table doesn't exist yet, so
applying it is not urgent, but **nothing in this feature does anything at
all** until every step below is done — until then, current behavior (Reply-To
= campus inbox, no inbound capture) is untouched, exactly as before.

Owner's setup steps, in order, from Resend's documented inbound-receiving
flow (resend.com/docs/dashboard/receiving/introduction and
resend.com/docs/dashboard/webhooks/introduction):

1. **Apply this migration** (same paste-into-SQL-Editor process as Section 1).
2. **Enable inbound receiving in Resend** — Resend dashboard → Emails → your
   sending domain → **Receiving** tab.
   - Fastest path (no DNS work): click the three-dot menu → **Receiving
     address** to get a Resend-managed address like
     `<anything>@<id>.resend.app`. Fine for a pilot; every reply comes back
     as `something@<id>.resend.app`, which is fine since only the `From`
     matters to this app, not the receiving alias.
   - Real path (recommended for production): add the **MX record** Resend
     shows you to the domain or subdomain you want receiving email at (e.g.
     `reply.rootedschool.org`). Once that MX record resolves, Resend
     receives mail for **any** address at that domain/subdomain — pick one
     specific address for INBOUND_REPLY_ADDRESS (step 3) rather than a
     shared catch-all.
3. **Set `INBOUND_REPLY_ADDRESS` in Vercel** (Settings → Environment
   Variables → Production) to the address you just enabled receiving for
   (e.g. `inbound@reply.rootedschool.org`, or the `Name <addr>` form).
   Leaving this unset keeps current behavior — do this last, after the
   webhook subscription below is confirmed live, so there's no gap where
   family replies go to an address nothing is listening to yet.
4. **Subscribe the webhook to `email.received`** — Resend dashboard →
   Webhooks → the existing endpoint already receiving
   `email.bounced`/`email.complained`/`email.delivered`/`email.opened`/
   `email.clicked` for `https://enroll.rootedschool.org/api/webhooks/resend`
   → add the `email.received` event to that same subscription (no new
   endpoint or secret needed — same Svix signature, same
   `RESEND_WEBHOOK_SECRET`).
5. **Verify end-to-end**: send yourself a system email that carries a campus
   Reply-To (any family-facing notification once step 3 is live), reply to
   it from a personal inbox, and confirm within a minute or two that (a) the
   reply appears on the matching lead/application timeline, (b) a staff
   in-app notification fired, and (c) the campus inbox received the
   forwarded copy with the personal address as its Reply-To.

```sql
-- Confirm replies are landing once live:
SELECT from_email, subject, matched_lead_id, matched_guardian_id,
       campus_id, forwarded_at, received_at
FROM inbound_email ORDER BY received_at DESC LIMIT 10;
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
