# Recruiter Role — Design & Deliberate Deferral (LG-3)

*Status: DESIGNED, NOT BUILT. Deferred on purpose — see why below. Prepared July 2026.*

## What it is

A `recruiter` staff role with full access to the Recruitment module (leads, events, campaigns, journeys, funnel) for their campus, and **zero access to student records** — applications, offers, documents, lottery, enrollment. The point is a hard FERPA boundary so part-time recruiters, AmeriCorps members, or parent ambassadors can work the pipeline without ever seeing a student's protected record.

## Why it wasn't shipped in the LG-3 pass

Implementing it correctly is a **security-critical RLS change**, not a quick add, because of how the existing policies are written:

- Several student-record tables (`application_answer`, `offer`, `documents`, `enrollment` children) gate on **`user_has_campus_access(campus_id)`** — which is true for *any* role on the campus.
- If a recruiter were added to `user_campus_role` (the normal way staff get campus access), `user_has_campus_access` would return true for them, and **they would see student records.** The FERPA boundary would be silently broken.

Getting this wrong leaks protected student data. That is exactly the kind of change that must be done carefully and tested, not rushed at the end of a long build session. Deferring is the responsible call — and there are no part-time recruiters onboarded yet, so nothing is blocked.

## The safe design (for the focused follow-up)

**Do NOT** widen or weaken the existing student-record policies. Instead, keep recruiters entirely outside `user_campus_role`:

1. **New table `recruiter_campus (user_id, campus_id)`** — a separate access grant that student-record policies never consult.
2. **Helper `user_is_recruiter_for(campus_id)`** — SECURITY DEFINER, checks that table.
3. **Additive permissive policies** on CRM tables only — `lead`, `lead_activity`, `event`, `event_rsvp`, `lead_campaign`, `lead_campaign_recipient`, `journey_enrollment`, `channel_spend` — each gains a second policy: `USING (user_is_recruiter_for(campus_id))`. Because RLS policies are OR'd, this grants recruiters CRM access without touching the staff policies.
4. **Because recruiters have no `user_campus_role` row**, `user_has_campus_access` is false for them everywhere — so application/offer/document/student/enrollment tables reject them **by construction**. The boundary can't be misconfigured; it's the default.
5. **Session layer** (`lib/auth/get-session.ts`, staff layout, middleware) must recognize a recruiter as valid staff and compute their accessible campuses from `recruiter_campus`. This is the real work — the session model currently assumes `user_campus_role`.
6. **Sidebar** shows only Recruitment for recruiters; every EMS nav item hidden (defense in depth on top of the RLS boundary).

## Test plan (must pass before shipping)

- A recruiter can read/write leads, events, campaigns, journeys for their campus only.
- A recruiter querying `application`, `offer`, `documents`, `student`, `enrollment` gets **zero rows** (verified at the SQL/RLS level, not just hidden UI).
- A recruiter cannot access another campus's leads.
- Existing staff roles are completely unaffected (regression check on the current 63 tests + manual staff smoke).

## Recommendation

Schedule as a focused, single-purpose change with the test plan above run against a Supabase branch before touching production RLS. Estimated small, but the care required is high. Until then, grant recruitment help an `enrollment_staff` account only if they're already cleared for student-record access; otherwise wait for this role.
