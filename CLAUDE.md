# Rooted EMS — Developer Context

Rooted EMS is the enrollment management system for **Rooted School Foundation** — a charter school network focused on equity and career-connected learning. It manages the full family journey from inquiry through enrollment across multiple campuses.

---

## Monorepo Structure

```
rooted-ems/
├── apps/web/              — Next.js 14 App Router (the main application)
├── packages/database/     — Supabase client helpers (createServerClient, createServiceRoleClient)
├── packages/types/        — Shared TypeScript types
├── packages/utils/        — Shared utilities
├── supabase/              — Database migrations and seed data
└── docs/                  — Architecture docs, implementation plans
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router (TypeScript) |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui |
| Monorepo | Turborepo + pnpm workspaces |
| Deployment | Vercel |
| Email/SMS | Resend (configured), Twilio (planned) |

---

## App Routes

### Staff Portal (`/staff/*`)
- `/staff/dashboard` — overview of applications, enrollment, tasks
- `/staff/applications` — application queue with filtering
- `/staff/applications/[id]` — detailed application review, document verification, status transitions
- `/staff/offers` — manage admission offers
- `/staff/enrollment` — enrollment pipeline and registration packet tracking
- `/staff/lottery` — lottery management
- `/staff/communications` — messaging families
- `/staff/settings` — campus config, grade levels, enrollment windows

### Family Portal (`/family/*`)
- `/family/dashboard` — family overview
- `/family/applications` — submit and track applications
- `/family/offers` — view and accept/decline seat offers
- `/family/registration` — complete registration packet after accepting offer
- `/family/documents` — upload required documents

### Auth
- `/login` — family login
- `/staff-login` — staff login
- `/auth/callback` — Supabase OAuth callback

---

## Key Conventions

### Data Access Pattern
- **Server Components / Server Actions** → use `createServerClient` (from `@rooted-ems/database/server`) for user-scoped queries that respect RLS
- **Service operations** (admin tasks, cross-user queries) → use `createServiceRoleClient` (bypasses RLS — use carefully)
- **Client Components** → data is passed as props from server components; direct Supabase calls from client are rare

### Auth Guards
- `requireStaffSession()` — use in staff server actions and layouts; redirects to `/staff-login` if not authenticated or not staff
- `requireSession()` — use in family server actions; redirects to `/login` if not authenticated
- `getSession()` — returns `AuthSession | null` without redirecting (use only when null is a valid state)
- Middleware at `apps/web/middleware.ts` handles edge-level JWT verification for all `/staff/*` and `/family/*` routes

### File Organization in `apps/web/`
```
app/
  staff/[route]/
    page.tsx           — server component, fetches data, passes to client
    [route]-client.tsx — "use client" interactive component
    actions.ts         — "use server" server actions for mutations
lib/
  auth/get-session.ts  — session helpers (requireStaffSession, requireSession, getSession)
  mutations/           — database write operations
  queries/             — database read operations (staff.ts, family.ts)
  notify.ts            — in-app + email notification helpers
```

### Application Status State Machine
```
submitted → verified → lottery_assigned / accepted → offered → accepted
→ registered → placement_review → enrolled
                                             ↘ waitlisted / withdrawn / rejected
```

---

## Running Locally

```bash
# Install dependencies
pnpm install

# Run the web app
pnpm turbo run dev --filter=web

# Build
pnpm turbo run build --filter=web
```

You'll need a `.env.local` in `apps/web/` — get this from Steven. It contains:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`

---

## Current Pilot Campuses

| Campus | School Year | Grades | Status |
|--------|------------|--------|--------|
| C.R. Neal Academy (RSSC) | 2027-28 | 6, 9 | Active pilot |
| Rooted School Vancouver (RSV) | 2026-27 | 9, 10, 11, 12 | Active pilot |

## Staff Accounts
- `scarney@rootedschool.org` — system_admin (Steven Carney)
- `lradney@rootedschoolcola.org` — enrollment_manager (Lalah Radney, CRN)

---

## Useful Reference Docs
- `docs/superpowers/plans/` — implementation plans for recent features
- `supabase/migrations/` — database schema history
- `apps/web/lib/mutations/` — all write operations (good reference for data model)
