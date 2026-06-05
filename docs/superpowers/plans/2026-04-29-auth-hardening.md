# Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two auth gaps — missing edge middleware and unguarded layout components — so unauthenticated requests are blocked before touching the database.

**Architecture:** Add a `middleware.ts` using `@supabase/ssr` to verify Supabase JWTs at the edge and redirect unauthenticated requests to the correct login page. Then add redirect guards to the staff and family layout server components so even if middleware is bypassed, layouts protect themselves.

**Tech Stack:** Next.js App Router, `@supabase/ssr`, `@rooted-ems/database/server`, TypeScript

---

### Task 1: Restore `middleware.ts` with proper Supabase SSR session verification

**Files:**
- Create: `apps/web/middleware.ts`
- Reference: `apps/web/middleware.ts.bak` (old cookie-presence-only version — do not use as-is)
- Reference: `apps/web/lib/auth/get-session.ts` (uses `createServerClient` from `@rooted-ems/database/server`)

**Context:** The middleware file was renamed to `.bak` and never replaced, leaving zero edge-level protection. The new version must use `createServerClient` from `@supabase/ssr` directly (not the database package wrapper, which isn't available in edge runtime) to call `supabase.auth.getUser()` and verify the JWT cryptographically.

- [ ] **Step 1: Write the middleware file**

Create `apps/web/middleware.ts`:

```typescript
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// Routes that never require auth
const PUBLIC_EXACT = ["/", "/login", "/staff-login", "/inquiry"];
const PUBLIC_PREFIXES = ["/api/", "/auth/", "/_next/", "/favicon"];

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Cryptographically verifies the Supabase JWT — not just cookie presence
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Family routes → /login
  if (pathname.startsWith("/family") && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Staff routes → /staff-login
  if (pathname.startsWith("/staff") && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/staff-login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 2: Verify `@supabase/ssr` is available**

```bash
cd /Users/stevencarney/Desktop/Cowork\ OS/rooted-ems/apps/web
grep "@supabase/ssr" package.json
```

Expected: a line like `"@supabase/ssr": "^0.x.x"`. If missing, run:
```bash
pnpm add @supabase/ssr
```

- [ ] **Step 3: Verify env vars exist in Vercel**

The middleware needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. These should already be set (they're used in the app). Confirm:
```bash
grep "NEXT_PUBLIC_SUPABASE" /Users/stevencarney/Desktop/Cowork\ OS/rooted-ems/apps/web/.env.local 2>/dev/null || echo "Check Vercel env vars dashboard"
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
cd /Users/stevencarney/Desktop/Cowork\ OS/rooted-ems
pnpm turbo run build --filter=web
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/stevencarney/Desktop/Cowork\ OS/rooted-ems
git add apps/web/middleware.ts
git commit -m "security: restore middleware with Supabase SSR JWT verification

Replaces the deleted middleware (now .bak) with a proper edge-level
auth guard. Uses @supabase/ssr createServerClient + auth.getUser()
for cryptographic JWT verification rather than cookie presence check.
Unauthenticated /family/* → /login, /staff/* → /staff-login."
```

---

### Task 2: Add redirect guard to staff layout

**Files:**
- Modify: `apps/web/app/staff/layout.tsx:20` (currently calls `getSession()` without redirecting)
- Reference: `apps/web/lib/auth/get-session.ts` (`requireStaffSession()` does redirect + staff check)

**Context:** The staff layout calls `getSession()` which returns `null` for unauthenticated users but doesn't redirect. Each page has its own guard, but the layout is the right place for a catch-all — if any page was ever added without an explicit check, the layout protects it.

- [ ] **Step 1: Update staff layout to use `requireStaffSession()`**

In `apps/web/app/staff/layout.tsx`, change line 20 from:
```typescript
const [session, allCampuses] = await Promise.all([
  getSession(),
  getCampuses(),
]);
```

To:
```typescript
const [session, allCampuses] = await Promise.all([
  requireStaffSession(),
  getCampuses(),
]);
```

And update the import at the top from:
```typescript
import { getSession, getAccessibleCampusIds, getHighestRole } from "@/lib/auth/get-session";
```

To:
```typescript
import { requireStaffSession, getAccessibleCampusIds, getHighestRole } from "@/lib/auth/get-session";
```

The `requireStaffSession()` function returns `AuthSession` (not `AuthSession | null`) and redirects to `/staff-login` if unauthenticated, or `/login` if authenticated but not staff. This means all downstream code in the layout can remove `session?.` optional chaining and use `session.` directly.

- [ ] **Step 2: Remove null guards that are no longer needed**

In `apps/web/app/staff/layout.tsx`, update the code that uses `session`:

Change:
```typescript
const unreadResult = session?.user_id
  ? await db
      .from("notification")
      .select("id", { count: "exact", head: true })
      .eq("user_id", session.user_id)
      .eq("is_read", false)
  : { count: 0 };
```

To:
```typescript
const unreadResult = await db
  .from("notification")
  .select("id", { count: "exact", head: true })
  .eq("user_id", session.user_id)
  .eq("is_read", false);
```

Change:
```typescript
const accessibleIds = session ? getAccessibleCampusIds(session) : [];
const highestRole = session ? getHighestRole(session) : "compliance_auditor";
```

To:
```typescript
const accessibleIds = getAccessibleCampusIds(session);
const highestRole = getHighestRole(session);
```

And in the JSX:
```typescript
// Change:
userEmail={session?.email}
// To:
userEmail={session.email}
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd /Users/stevencarney/Desktop/Cowork\ OS/rooted-ems
pnpm turbo run build --filter=web
```

Expected: Build succeeds. No `session?.` TypeScript warnings.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/staff/layout.tsx
git commit -m "security: require staff session in layout catch-all

Upgrades staff layout from getSession() (returns null, no redirect)
to requireStaffSession() (redirects unauthenticated/non-staff users).
Removes null guards on session usage since it is now guaranteed non-null."
```

---

### Task 3: Add redirect guard to family layout

**Files:**
- Modify: `apps/web/app/family/layout.tsx`
- Reference: `apps/web/lib/auth/get-session.ts` (`requireSession()`)

**Context:** Family layout fetches `user` via `supabase.auth.getUser()` but doesn't redirect if `user` is null. It just renders with empty badge counts. Same catch-all pattern as Task 2.

- [ ] **Step 1: Update family layout to redirect unauthenticated users**

In `apps/web/app/family/layout.tsx`, add `redirect` import and a guard after getting the user.

Change the imports at the top to include:
```typescript
import { redirect } from "next/navigation";
```

After the `supabase.auth.getUser()` call, add:
```typescript
const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  redirect("/login");
}
```

- [ ] **Step 2: Remove null guards on `user` downstream**

Update `getFamilyPendingOffers` and notification query — since `user` is now guaranteed non-null:

Change:
```typescript
const [pendingOffers, unreadResult] = await Promise.all([
  user ? getFamilyPendingOffers(user.id) : Promise.resolve([]),
  user
    ? db.from("notification")...
    : Promise.resolve({ count: 0 }),
]);
```

To:
```typescript
const [pendingOffers, unreadResult] = await Promise.all([
  getFamilyPendingOffers(user.id),
  db
    .from("notification")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false),
]);
```

And update `FamilyHeader`:
```typescript
// Change:
userEmail={user?.email}
userPhone={user?.phone}
// To:
userEmail={user.email}
userPhone={user.phone}
```

- [ ] **Step 3: Build**

```bash
cd /Users/stevencarney/Desktop/Cowork\ OS/rooted-ems
pnpm turbo run build --filter=web
```

Expected: Build passes.

- [ ] **Step 4: Commit and push**

```bash
git add apps/web/app/family/layout.tsx
git commit -m "security: redirect unauthenticated users in family layout

Family layout now redirects to /login if no auth session exists,
matching the staff layout guard added in the previous commit."

git push
```

---

## Self-Review

**Spec coverage:**
- ✅ Middleware restored with JWT verification (Task 1)
- ✅ Staff layout catch-all guard (Task 2)
- ✅ Family layout catch-all guard (Task 3)
- ✅ Null-safety cleanup in layouts (Tasks 2 & 3, Step 2)

**Placeholder scan:** No TBDs, no "add validation" filler, all steps have exact code.

**Type consistency:** `requireStaffSession()` returns `AuthSession` (not null), `requireSession()` returns `AuthSession` (not null) — optional chaining removed consistently in Steps 2 of Tasks 2 and 3.
