import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * UX Phase 5A display-type treatment — Archivo (the free Klavika substitute),
 * uppercase only, tracked out. Use for eyebrows, section labels, headlines,
 * and primary buttons on high-visibility surfaces. Never apply to body copy
 * (Instrument Sans / font-body / the default font-sans stays sentence case),
 * and never pair with `lowercase`.
 */
export const displayClass = "font-display uppercase tracking-[0.08em]";
