"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface LensSyncProps {
  /** campus.ids the viewer can access — the lens is never synced to anything else. */
  validCampusIds: string[];
  /** campus.id of the current server-resolved lens, or null for "All campuses". */
  lensCampusId: string | null;
  /** setCampusLens server action (app/staff/lens-actions.ts). */
  setCampusLensAction: (campusId: string | null) => Promise<void>;
}

/**
 * Converges the campus-lens cookie onto an explicit ?campus= selection, so
 * the one campus context the shell themes and defaults from can never
 * disagree with what a page is actually showing.
 *
 * The header select writes the cookie itself before navigating, so this
 * component is the safety net for every OTHER way a ?campus= value can
 * arrive: the in-page filter selects (pipeline, applications, equity), a
 * shared link, an old bookmark. Renders nothing; when the URL and the lens
 * disagree it updates the cookie and refreshes, after which the server
 * re-renders the shell in the right campus's color and identity.
 *
 * "all" is the explicit all-campuses sentinel (resolveActiveCampus treats it
 * as no selection) — it clears the lens rather than being ignored, because a
 * user who chose All Campuses anywhere meant it globally; leaving the lens
 * set would snap them back to a campus on their next navigation.
 */
export function LensSync({ validCampusIds, lensCampusId, setCampusLensAction }: LensSyncProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  // Guards against re-firing for the same target while the refreshed server
  // render (which updates lensCampusId) is still in flight.
  const lastSynced = useRef<string | null>(null);

  const param = searchParams.get("campus");

  useEffect(() => {
    if (param === null) return;

    const target = param === "all" ? null : param;
    if (target === lensCampusId) {
      lastSynced.current = null;
      return;
    }
    if (target !== null && !validCampusIds.includes(target)) return;

    const syncKey = target ?? "all";
    if (lastSynced.current === syncKey) return;
    lastSynced.current = syncKey;

    startTransition(async () => {
      await setCampusLensAction(target);
      router.refresh();
    });
  }, [param, lensCampusId, validCampusIds, setCampusLensAction, router]);

  return null;
}
