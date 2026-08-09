# Red team: playbook alignment work
**Date:** 2026-08-09 · Branch `feat/playbook-alignment`, commit `dd3cfd1`
**Verification:** typecheck clean · 168/168 tests · production build clean ·
every query shape validated against the live schema · security advisor unchanged

---

## 1. CRITICAL (process): the working tree was reset mid-build and work was lost

Partway through, the repo was reset: the branch reverted to `main` and **every
edit to an existing tracked file was discarded**. New files survived only
because untracked files are not touched by a reset.

14 separate edits were destroyed across 12 files, including the entire melt
cadence rewrite, the decline UI, and the equity changes. Nothing was
recoverable from git, because I had not committed.

All 14 were re-applied and verified individually, and the work is now committed
(`dd3cfd1`) so a repeat cannot destroy it.

**Root cause is almost certainly the repo living on the iCloud-synced Desktop.**
It caused two `mmap`/`index.lock` git failures earlier in the day. Moving the
repo somewhere unsynced is the fix.

**My mistake, not the environment's:** I deferred committing because commits are
normally gated on an explicit ask. For work of this size that was the wrong
call. A dirty tree holding hours of work is a single point of failure.

## 2. HIGH (pre-existing, and my new page inherits it)

**Any account with `is_staff = true` and no campus role sees every campus.**

- `requireStaffSession()` gates only on `is_staff`.
- `getAccessibleCampusIds()` returns `Object.keys(session.campus_roles)`, which
  is `[]` for such an account.
- Every staff page treats `[]` as "no filter", i.e. all campuses.

**Such an account exists in production right now:**
`staff.columbia@rootedschool.org`, confirmed by query during this pass.

This predates my work — `/staff/today`, `/staff/pipeline` and `/staff/equity`
all follow the convention — but `/staff/funnel` now follows it too, so I have
widened the blast radius by one page. Migration 00039 closed the *storage* half
of this (documents now require a real campus role); the page-scoping half is
still open.

**Fix options, neither of which I applied unilaterally because both change
behaviour for every staff page:**
1. Give that account a campus role or clear its `is_staff` bit (one-line, fixes
   the live exposure today).
2. Make `[]` mean "no access" and identify org-wide admins by an explicit
   `system_admin` check. Safer, but it is a real behaviour change and deserves
   its own review.

I recommend (1) now and (2) as a scoped follow-up.

## 3. MEDIUM (found and fixed during this pass)

**`application` has no `school_year_id` column.** My funnel query filtered on
it, which would have thrown at runtime and 500'd `/staff/funnel` the first time
anyone opened it. Typecheck did not catch it because the Supabase client types
that filter loosely.

Fixed: the year is now resolved through `enrollment_window`, the same way
`equity-funnel.ts` does it. Validated against the live schema afterward.

Two smaller ones fixed the same way:
- A value import from the `@/lib/queries` barrel into a `"use client"`
  component pulled `next/headers` into the browser bundle and broke the build.
  Now imports from the leaf module.
- `followUpSlaHours()` returned 24 for both "same day" and "within 24 hours",
  silently relaxing the stricter tour standard by up to 15 hours. Replaced with
  `followUpDeadline()`, which computes each correctly. Test added.

## 4. LOW

**Lint is not configured repo-wide.** `pnpm lint` prompts for ESLint setup and
fails non-interactively. Pre-existing, not a regression, but it means lint is
not protecting anything today.

## 5. Deliberately incomplete, and why

- **SIS adapters (item 6).** Interface, platform mapping, and campus assignment
  are done and seeded. Neither adapter is implemented, and `getSisAdapter()`
  throws rather than returning a no-op. A silent stub would let the funnel's
  Retain stage render as healthy against an empty dataset, which is the exact
  failure mode this codebase keeps designing against. Genuinely blocked on API
  credentials and sandbox instances.
- **Equity corrective-action workflow.** The 10pp flag now fires per playbook,
  but the 14-day written-plan workflow and the notification to the RSF Director
  of Growth & Innovation are not built. That is process tooling and deserves
  its own scoping.
- **Orientation / `ORI_CONFIRMED`.** Deferred by agreement.
- **FRL and McKinney-Vento fields.** Schema landed, deliberately on
  `enrollment` so they cannot exist during a lottery. **Nothing writes them
  yet, pending counsel sign-off.**

## 6. Checked and clean

- Security advisor: 7 findings, identical to before these migrations. Five are
  the RLS helper functions, which must stay callable by `authenticated` or
  every policy breaks. No new issues introduced.
- All four migrations (00040–00043) verified present in the live database.
- Campus SIS assignment verified: RSV `qmlativ`, CRN and RSC `powerschool`.
- Every table, column and join the new queries touch resolves against the live
  schema.
- Empty-state behaviour verified against real data: 0 declines renders "none
  recorded" rather than a fake 0%; 0 complete packets hides the melt section
  rather than showing a false all-clear; Retain reports why it cannot be
  measured instead of a number.

## 7. Worth knowing about the numbers you will see

Live data is 1,396 leads against 1,190 planned seats. That is an inquiry
multiple of **1.2x against a 3x target**, so the funnel will open on RED at the
top of funnel, and the funnel-math card will show roughly 3,500 inquiries
needed against 1,396 actual.

That is the math working correctly on demo data, not a bug. It is also a fair
preview of what the view is for.
