"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import { CAMPUS_LENS_COOKIE } from "@/lib/campus-lens";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Set (or clear, with `campusId: null`) the staff campus lens — the sidebar
 * switcher's selection (components/layout/campus-lens-switcher.tsx). Only
 * rendered for multi-campus/org-wide staff; single-campus staff never call
 * this (their lens is forced to their one campus regardless — see
 * lib/campus-lens.ts).
 *
 * Validated against the caller's own accessible campuses before the cookie
 * is written — same rule resolveActiveCampus already applies to an explicit
 * ?campus= selection — so a scoped staff member can never lens into a campus
 * they can't otherwise see. Org-wide staff (empty accessible list) may
 * select any real campus.
 *
 * revalidatePath("/staff", "layout") re-renders the shell (hairline, sidebar
 * brand block, active-nav colors) and every page under it on the next
 * request, so the theme and the default ?campus= filter both pick up the
 * change immediately.
 */
export async function setCampusLens(campusId: string | null): Promise<void> {
  const session = await requireStaffSession();
  const cookieStore = await cookies();

  if (campusId === null) {
    cookieStore.delete(CAMPUS_LENS_COOKIE);
    revalidatePath("/staff", "layout");
    return;
  }

  const accessible = getAccessibleCampusIds(session);
  if (accessible.length > 0 && !accessible.includes(campusId)) {
    // Silently ignore rather than throw: this is a cosmetic preference
    // action, not a data mutation, and the read path (getCampusLens /
    // getCampusLensId) independently re-validates on every read anyway — but
    // reject the write here too so the cookie itself never holds a campus
    // this session can't access.
    return;
  }

  cookieStore.set(CAMPUS_LENS_COOKIE, campusId, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/staff", "layout");
}
