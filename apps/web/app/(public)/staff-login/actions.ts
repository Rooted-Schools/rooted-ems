"use server";

import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";

export type StaffAccessDenial = "not_staff" | "no_campus_access" | "not_authenticated";

export interface StaffAccessResult {
  ok: boolean;
  reason?: StaffAccessDenial;
}

/**
 * Is the currently authenticated user a provisioned staff member?
 *
 * Staff access is granted by an administrator, never self-served: someone
 * with a real Google account, or a family who already has a password on this
 * site, is authenticated but not staff. Both facts have to hold:
 *
 *   1. user_profile.is_staff is true. The is_staff bit cannot be set by the
 *      user themselves (fn_protect_is_staff, migration 00039).
 *   2. They hold at least one user_campus_role row. A staff flag with no
 *      campus assignment means a half-finished provisioning or a completed
 *      offboarding, and it must read as no access rather than as access to
 *      everything (see lib/auth/get-session.ts).
 *
 * This is the same pair requireStaffSession enforces on every staff page. It
 * runs here too so a rejected sign-in ends at the login screen with a clear
 * reason, instead of leaving the person holding a live session that only
 * fails once they reach a staff route.
 *
 * Uses the service-role client for the lookup because a brand new session
 * may not satisfy the RLS read on its own profile row, and returns only a
 * yes or no so nothing about the account leaks to an unprovisioned caller.
 */
export async function verifyStaffAccess(): Promise<StaffAccessResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, reason: "not_authenticated" };

  const admin = createServiceRoleClient();

  const { data: profile } = await admin
    .from("user_profile")
    .select("is_staff")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_staff) return { ok: false, reason: "not_staff" };

  const { count } = await admin
    .from("user_campus_role")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (!count || count === 0) return { ok: false, reason: "no_campus_access" };

  return { ok: true };
}
