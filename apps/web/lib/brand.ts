/**
 * RSF Brand Book — Campus accent colors & brand utilities
 *
 * Color usage ratio per brand book:
 *   70% Rooted Green + neutrals
 *   20% regional accent
 *   10% other
 *
 * Tailwind class names use the `campus-{slug}` namespace
 * defined in tailwind.config.ts (e.g. `bg-campus-vancouver`).
 */

export interface CampusBrand {
  name: string;
  accentHex: string;
  /** Tailwind color slug, e.g. "campus-vancouver" */
  tw: string;
  logo: string;
}

const BRANDS: Record<string, CampusBrand> = {
  RSV: {
    name: "Rooted School Vancouver",
    accentHex: "#4A8C7F",
    tw: "campus-vancouver",
    logo: "/logos/rooted-vancouver.png",
  },
  CRN: {
    name: "C.R. Neal Academy",
    accentHex: "#7B2D3B",
    tw: "campus-neal",
    logo: "/logos/cr-neal-academy.png",
  },
  RSC: {
    name: "Rooted School Cleveland",
    accentHex: "#B45A2B",
    tw: "campus-cleveland",
    logo: "/logos/rooted-cleveland.png",
  },
};

const DEFAULT_BRAND: CampusBrand = {
  name: "rootedschools",
  accentHex: "#81A780",
  tw: "rooted-green",
  logo: "/logo.svg",
};

/**
 * Resolve a campus brand from a short code (RSV, CRN, RSC)
 * or a campus name substring.
 */
export function getCampusBrand(identifier: string): CampusBrand {
  const upper = identifier.toUpperCase().trim();
  if (BRANDS[upper]) return BRANDS[upper];

  const lower = identifier.toLowerCase();
  if (lower.includes("vancouver")) return BRANDS.RSV;
  if (lower.includes("neal") || lower.includes("columbia")) return BRANDS.CRN;
  if (lower.includes("cleveland")) return BRANDS.RSC;

  return DEFAULT_BRAND;
}

/* ── Convenience helpers returning Tailwind classes ── */

export function campusBg(name: string) {
  return `bg-${getCampusBrand(name).tw}`;
}

export function campusBgLight(name: string) {
  return `bg-${getCampusBrand(name).tw}/10`;
}

export function campusText(name: string) {
  return `text-${getCampusBrand(name).tw}`;
}

export function campusBorder(name: string) {
  return `border-${getCampusBrand(name).tw}`;
}

export function campusLogo(name: string) {
  return getCampusBrand(name).logo;
}

/**
 * Inline style for accent color (useful when dynamic Tailwind classes
 * aren't safe-listed and JIT can't detect them at build time).
 */
export function campusAccentStyle(name: string): React.CSSProperties {
  return { borderColor: getCampusBrand(name).accentHex };
}

export function campusAccentBgStyle(name: string): React.CSSProperties {
  return { backgroundColor: getCampusBrand(name).accentHex };
}
