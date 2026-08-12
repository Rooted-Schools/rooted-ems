/**
 * Single source of truth for per-campus public identity: which DB
 * `campus.short_code` maps to which public route slug, which accent color
 * system, and which logo file lives under public/logos.
 *
 * Consumed by:
 *  - app/(public)/[campusSlug]/page.tsx — the campus's own landing page
 *  - app/(public)/page.tsx — network landing page's school cards (schoolDefs)
 *  - app/(public)/landing-client.tsx — accent colors for those cards, via
 *    CAMPUS_ACCENT_BY_MATCH_KEY (see the comment on that map for why it
 *    still keys by matchKey rather than shortCode)
 *  - components/layout/family-header.tsx — family's campus logo + name
 *  - components/layout/staff-sidebar.tsx — single-campus staff brand block
 *  - lib/notify.ts (resolveCampus) — campus logo in transactional email
 *
 * Pure data module — no server-only imports — so it is safe to import from
 * both Server and Client Components.
 */

export type CampusShortCode = "RSV" | "CRN" | "RSC";

export interface CampusAccent {
  topBorder: string;
  border: string;
  hoverBorder: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  dot: string;
}

export interface CampusIdentity {
  shortCode: CampusShortCode;
  /** Public route slug — app/(public)/[campusSlug]/page.tsx */
  slug: string;
  /**
   * Legacy lookup key used by the network landing page to match a campus
   * against enrollment_window rows by substring on campus.name (see
   * app/(public)/page.tsx). Kept distinct from `slug` because it predates
   * this module and changing it would require a data migration of nothing
   * (it's just a string literal) but does require re-verifying every call
   * site — not worth doing as a drive-by in this change.
   */
  matchKey: string;
  displayName: string;
  location: string;
  /** Grade range without the "Grades" prefix, e.g. "9-12" */
  gradesRange: string;
  logoPath: string;
  accent: CampusAccent;
}

export const CAMPUS_IDENTITIES: Record<CampusShortCode, CampusIdentity> = {
  RSV: {
    shortCode: "RSV",
    slug: "vancouver",
    matchKey: "vancouver",
    displayName: "rootedschools vancouver",
    location: "Vancouver, WA",
    gradesRange: "9-12",
    logoPath: "/logos/rooted-vancouver.png",
    accent: {
      topBorder: "border-t-rooted-green",
      border: "border-rooted-green/30",
      hoverBorder: "hover:border-rooted-green/60",
      badgeBg: "bg-rooted-green/10",
      badgeBorder: "border-rooted-green/30",
      badgeText: "text-rooted-green",
      dot: "bg-rooted-green",
    },
  },
  CRN: {
    shortCode: "CRN",
    slug: "columbia",
    matchKey: "neal",
    displayName: "C.R. Neal Academy",
    location: "Columbia, SC",
    gradesRange: "6-12",
    logoPath: "/logos/cr-neal-academy.png",
    accent: {
      topBorder: "border-t-amber-500",
      border: "border-amber-300/60",
      hoverBorder: "hover:border-amber-400",
      badgeBg: "bg-amber-50",
      badgeBorder: "border-amber-300",
      badgeText: "text-amber-700",
      dot: "bg-amber-500",
    },
  },
  RSC: {
    shortCode: "RSC",
    slug: "cleveland",
    matchKey: "cleveland",
    displayName: "rootedschools cleveland",
    location: "Cleveland, OH",
    gradesRange: "6-12",
    logoPath: "/logos/rooted-cleveland.png",
    accent: {
      topBorder: "border-t-blue-500",
      border: "border-blue-300/60",
      hoverBorder: "hover:border-blue-400",
      badgeBg: "bg-blue-50",
      badgeBorder: "border-blue-300",
      badgeText: "text-blue-700",
      dot: "bg-blue-500",
    },
  },
};

/** Insertion order above (RSV, CRN, RSC) is relied on by app/(public)/page.tsx's card order. */
export const CAMPUS_IDENTITY_LIST: CampusIdentity[] = Object.values(CAMPUS_IDENTITIES);

export function getCampusIdentityBySlug(slug: string): CampusIdentity | undefined {
  return CAMPUS_IDENTITY_LIST.find((c) => c.slug === slug);
}

export function getCampusIdentityByShortCode(
  shortCode: string | null | undefined
): CampusIdentity | undefined {
  if (!shortCode) return undefined;
  return CAMPUS_IDENTITIES[shortCode.toUpperCase() as CampusShortCode];
}

/** Accent lookup keyed by the network landing page's legacy matchKey. */
export const CAMPUS_ACCENT_BY_MATCH_KEY: Record<string, CampusAccent> = Object.fromEntries(
  CAMPUS_IDENTITY_LIST.map((c) => [c.matchKey, c.accent])
);

/**
 * Absolute logo URL for contexts that can't resolve a relative path — email
 * clients being the main one. Returns undefined for an unknown short_code so
 * callers degrade to their current (logo-less) behavior instead of guessing.
 */
export function getCampusLogoAbsoluteUrl(
  shortCode: string | null | undefined,
  appUrl: string
): string | undefined {
  const identity = getCampusIdentityByShortCode(shortCode);
  return identity ? `${appUrl}${identity.logoPath}` : undefined;
}
