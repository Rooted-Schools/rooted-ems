import { cookies } from "next/headers";
import {
  getCampusIdentityByShortCode,
  type CampusIdentity,
  type CampusShortCode,
} from "@/lib/campus-identity";

/**
 * Cookie holding the staff "campus lens" selection — a `campus.id` (uuid),
 * or absent for "All campuses" (the neutral default). Written only by
 * setCampusLens (app/staff/lens-actions.ts). httpOnly by default: the lens
 * is read server-side (app/staff/layout.tsx + the ~20 staff pages that
 * default their ?campus= filter to it), nothing client-side reads the raw
 * value.
 */
export const CAMPUS_LENS_COOKIE = "staff-campus-lens";

export interface CampusLensCampus {
  id: string;
  short_code: string;
}

export interface CampusLens {
  campusId: string;
  shortCode: CampusShortCode;
  identity: CampusIdentity;
}

/**
 * Resolve the active campus lens from the `staff-campus-lens` cookie.
 *
 * `accessibleCampuses` must be the caller's own already-scoped campus list —
 * the same `campuses` array app/staff/layout.tsx already computes (the
 * accessible campuses for scoped staff, every campus for org-wide staff).
 * Validating against that list rather than trusting the raw cookie means a
 * stale cookie (the user's access changed since it was set) or a tampered
 * one degrades to "All campuses" instead of leaking a theme/identity for
 * campus data the caller can't actually see — the lens only narrows within
 * already-authorized data, it never widens it.
 *
 * Single-campus staff (accessibleCampuses.length === 1 — e.g. Tim at
 * Cleveland, Lalah at C.R. Neal) always get their one campus, cookie or not:
 * there is no other campus for the lens to mean, and no switcher renders for
 * them to change it.
 */
export async function getCampusLens(
  accessibleCampuses: CampusLensCampus[]
): Promise<CampusLens | null> {
  if (accessibleCampuses.length === 1) {
    return toLens(accessibleCampuses[0]);
  }

  const cookieStore = await cookies();
  const selectedId = cookieStore.get(CAMPUS_LENS_COOKIE)?.value;
  if (!selectedId) return null;

  const match = accessibleCampuses.find((c) => c.id === selectedId);
  return match ? toLens(match) : null;
}

function toLens(campus: CampusLensCampus): CampusLens | null {
  const identity = getCampusIdentityByShortCode(campus.short_code);
  // Unknown short_code (a campus this module hasn't been taught yet) ⇒ no
  // identity to theme with. Same "degrade quietly to neutral" rule as an
  // invalid cookie value above.
  if (!identity) return null;
  return { campusId: campus.id, shortCode: identity.shortCode, identity };
}

/**
 * Lean variant for the staff pages that already call
 * `resolveActiveCampus(session, searchParams?.campus)` to scope their data
 * query (see lib/auth/get-session.ts). Those pages have `accessibleIds`
 * (string[], from getAccessibleCampusIds) on hand already but not a full
 * campus record list — fetching one per page just to resolve the lens would
 * add a Supabase round trip to every staff page render for what is, at that
 * call site, a purely cosmetic default. Returns the raw cookie value (or
 * null); resolveActiveCampus runs the exact same accessible-list check on it
 * that it already runs on an explicit `?campus=` value, so a stale or
 * tampered cookie can narrow but never widen what a page queries — the same
 * security posture as getCampusLens above, minus the identity lookup this
 * call site doesn't need.
 */
export async function getCampusLensId(accessibleIds: string[]): Promise<string | null> {
  if (accessibleIds.length === 1) return accessibleIds[0];

  const cookieStore = await cookies();
  return cookieStore.get(CAMPUS_LENS_COOKIE)?.value ?? null;
}
