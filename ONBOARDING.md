# Rooted EMS — Onboarding

Rooted EMS is the enrollment management system for **Rooted School Foundation**, a charter network focused on equity and career-connected learning. It runs the full family journey from inquiry → application → lottery → offer → registration → enrollment, across multiple campuses, with a staff console and a family portal.

**Repo:** https://github.com/Rooted-Schools/rooted-ems · **Production:** https://enroll.rootedschool.org (auto-deploys from `main` via Vercel)

---

## Before you can run it (ask Steven)
1. **GitHub access** — you need to be a collaborator on `Rooted-Schools/rooted-ems`.
2. **`apps/web/.env.local`** — Steven provides this. It holds:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`
   Never commit it; never paste these values into chat.

## Run it locally
```bash
pnpm install
pnpm turbo run dev --filter=web       # dev server
pnpm turbo run build --filter=web     # production build
```
Verify a change before calling it done (run from `apps/web`):
```bash
npx tsc --noEmit && npx vitest run && npx next build
```

---

## Layout
```
apps/web/            Next.js 14 App Router (the app)
  app/staff/*        staff console (dashboard→today, pipeline, applications, lottery, ...)
  app/family/*       family portal (dashboard, applications, offers, registration, documents)
  lib/queries/*      read operations (staff.ts, family.ts, applications.ts, ...)
  lib/mutations/*    write operations
  lib/auth/get-session.ts   requireStaffSession / requireSession / getSession
  lib/i18n/translations.ts  typed EN+ES strings (tx server-side, useLocale client-side)
  components/ui/icons.tsx    the shared inline-SVG icon set (NO emoji anywhere)
packages/database    Supabase client helpers (createServerClient / createServiceRoleClient)
supabase/migrations  schema history (latest: 00034_waitlist_position_history)
```

## Conventions that matter
- **Data access:** Server Components / Server Actions use `createServerClient` (RLS, user-scoped). Admin/cross-user reads use `createServiceRoleClient` (bypasses RLS — only after the caller has RLS-proven the id, e.g. via a prior user-scoped read). Client components get data as props.
- **Auth guards:** `requireStaffSession()` in staff actions/layouts, `requireSession()` for family, `getSession()` only when null is valid. Middleware handles edge JWT for `/staff/*` and `/family/*`.
- **Route file pattern:** `page.tsx` (server, fetches) → `*-client.tsx` (`"use client"`, interactive) → `actions.ts` (`"use server"` mutations).
- **No emoji anywhere** — firm brand standard. Use `components/ui/icons.tsx`; add icons there, never inline ad-hoc SVG or emoji in UI.
- **Every family-facing string ships EN + ES** in `lib/i18n/translations.ts`. Staff-facing is English only.
- **Design tokens** (Tailwind): `warm-white` bg, `rooted-green`/`deep-green`, `ink`, `stone`, `line` hairlines, `sunken`, `warn`/`error`/`info`. Buttons are **6px rectangular, never pill**; hairline borders over shadows. Display font Archivo (uppercase labels/headlines), body Instrument Sans.
- **Data honesty (important, this is a real enrollment system):** never fabricate or estimate counts, positions, or statuses. If backing data doesn't exist, render nothing rather than a made-up value. This is enforced throughout the recent work.

## How changes ship
- **Branch → PR → merge to `main`.** Merging `main` **deploys to production** (Vercel). Don't push straight to `main` without intent.
- **Database migrations are applied manually** — a new `supabase/migrations/00xxx_*.sql` does NOT run on deploy. It's applied to production Supabase by a maintainer (Supabase SQL Editor, or `supabase db push`) after a PITR/backup check. Write migrations additive-only where possible.
- Vercel **preview deployments** exist per-PR but are behind Vercel Authentication (project `carnsters-projects`).

---

## Current state (as of this handoff)
A full **UX overhaul just shipped to production** — 5 phases, `main` at `71f18e7`:
1. Family home rewrite, nav simplification, staff sidebar 17→6, no-emoji standard
2. Staff **Today** exception queue (`/staff/today`, replaced the KPI dashboard)
3. **Pipeline** (`/staff/pipeline`) — stage tabs, "what it needs" columns, bulk cause bar, CSV export
4. Review **queue mode** + split of the staff application `detail-client.tsx` into `_components/`
5. Type system (Archivo/Instrument Sans), camera-first document capture, waitlist position history (migration `00034`, applied), household inheritance

**Application status state machine:** `submitted → verified → lottery_assigned/accepted → offered → accepted → registered → placement_review → enrolled` (↘ `waitlisted / withdrawn / rejected`).

## Good next work / open items
- **Twilio SMS** — the notify fan-out (`lib/notify.ts`) supports SMS but Twilio credentials aren't set; add `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER` to activate. Actions honestly report "not connected" until then.
- **Recruiter-role security review** — noted as deferred; worth a look before broadening staff roles.
- Consolidated **shell pages** for the 6-item sidebar are partially done (Pipeline absorbs Applications/Documents/Students as tabs); Insights/Seats-&-Lottery shells can be fleshed out further.

## Reference
- `CLAUDE.md` (repo root) — fuller developer context.
- `docs/superpowers/plans/` — implementation plans for recent features.
- `supabase/migrations/` — schema history.
