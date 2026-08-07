import { createServiceRoleClient } from "@rooted-ems/database/server";
import {
  getExpiringOffers,
  getStaffPendingDocuments,
  getStalledRegistrations,
  getReleasableSeats,
  getDuplicateSuspects,
  getUpcomingDeadlines,
} from "@/lib/queries";
import { getRegistrationCompletion, getCallEscalationQueue } from "@/lib/queries/melt";
import {
  requireStaffSession,
  getAccessibleCampusIds,
  resolveActiveCampus,
} from "@/lib/auth/get-session";
import { TodayClient, type ExceptionRow, type SeatProgressGroup } from "./today-client";

export const dynamic = "force-dynamic";

const STALLED_DAYS_THRESHOLD = 5;
const OFFER_WINDOW_HOURS = 120; // 5 days — the class of "expiring soon" offers
const RED_WITHIN_HOURS = 72; // color is earned: red only inside 72h, per the design handoff

function prettify(itemType: string): string {
  return itemType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function StaffTodayPage({
  searchParams,
}: {
  searchParams: { campus?: string; denied?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;

  const supabase = createServiceRoleClient();

  const [
    { data: profile },
    { data: currentSY },
    expiringOffers,
    { rows: pendingDocuments },
    stalled,
    releasableSeatGroups,
    duplicateSuspects,
    deadlines,
    registrationCompletion,
    callEscalation,
  ] = await Promise.all([
    supabase.from("user_profile").select("first_name, full_name").eq("id", session.user_id).maybeSingle(),
    supabase.from("school_year").select("id, name").eq("is_current", true).maybeSingle(),
    getExpiringOffers(OFFER_WINDOW_HOURS, scopedCampusIds),
    getStaffPendingDocuments(scopedCampusIds.length > 0 ? scopedCampusIds : undefined),
    getStalledRegistrations(STALLED_DAYS_THRESHOLD, scopedCampusIds),
    getReleasableSeats(scopedCampusIds),
    getDuplicateSuspects(scopedCampusIds),
    getUpcomingDeadlines(activeCampus),
    getRegistrationCompletion(scopedCampusIds),
    getCallEscalationQueue(scopedCampusIds),
  ]);

  let capacityRows: Record<string, unknown>[] = [];
  if (currentSY?.id) {
    let capacityQuery = supabase
      .from("capacity_plan")
      .select(`total_seats, seats_offered, seats_accepted, seats_registered, campus_id, grade_level:grade_level_id (grade)`)
      .eq("school_year_id", currentSY.id as string)
      .gt("total_seats", 0);
    if (scopedCampusIds.length > 0) capacityQuery = capacityQuery.in("campus_id", scopedCampusIds);
    const { data } = await capacityQuery;
    capacityRows = (data ?? []) as Record<string, unknown>[];
  }

  const firstName =
    (profile?.first_name as string | null) ||
    (profile?.full_name as string | null)?.split(" ")[0] ||
    "there";

  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  // ─── Build exception rows in fixed, consequence-first order ───────────
  const rows: ExceptionRow[] = [];
  let timeCriticalCount = 0;

  // 1. Expiring offers — irreversible if missed (seat returns to waitlist automatically)
  if (expiringOffers.length > 0) {
    const earliestHours = Math.min(...expiringOffers.map((o) => o.hours_left));
    const isRed = earliestHours <= RED_WITHIN_HOURS;
    const earliestDate = new Date(
      expiringOffers.reduce((earliest, o) => (o.expires_at < earliest ? o.expires_at : earliest), expiringOffers[0].expires_at)
    );
    const dayLabel = earliestDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const count = expiringOffers.length;
    if (isRed) timeCriticalCount += expiringOffers.filter((o) => o.hours_left <= RED_WITHIN_HOURS).length;

    rows.push({
      key: "expiring_offers",
      urgency: isRed ? "red" : "amber",
      eyebrow: isRed
        ? `EXPIRES IN ${earliestHours <= 24 ? `${earliestHours}H` : `${Math.ceil(earliestHours / 24)} DAYS`}`
        : `EXPIRES BY ${dayLabel.toUpperCase()}`,
      sentence: `${count} offer${count === 1 ? "" : "s"} expire${count === 1 ? "s" : ""} by ${dayLabel} and ${count === 1 ? "that family has" : "those families have"} not opened the email.`,
      subline: "Seats return to the waitlist automatically. A text now is the difference.",
      actions: [
        {
          kind: "text_offers",
          label: `Text all ${count}`,
          offerIds: expiringOffers.map((o) => o.id),
          style: isRed ? "solid-red" : "solid-amber",
        },
        { kind: "navigate", label: "Review", href: "/staff/offers", style: "outline" },
      ],
    });
  }

  // 2. Documents waiting on staff — blocks the next verified/lottery step
  if (pendingDocuments.length > 0) {
    const distinctApps = new Set(pendingDocuments.map((d) => d.application_id)).size;
    const nextDeadline = deadlines[0];
    const isRed = !!nextDeadline && nextDeadline.daysLeft * 24 <= RED_WITHIN_HOURS;
    if (isRed) timeCriticalCount += pendingDocuments.length;

    rows.push({
      key: "documents_waiting",
      urgency: isRed ? "red" : "amber",
      eyebrow: nextDeadline ? `${nextDeadline.title.toUpperCase()} IN ${nextDeadline.daysLeft}D` : "NEEDS REVIEW",
      sentence: `${pendingDocuments.length} document${pendingDocuments.length === 1 ? "" : "s"} ${pendingDocuments.length === 1 ? "is" : "are"} waiting on you across ${distinctApps} application${distinctApps === 1 ? "" : "s"}.`,
      subline: nextDeadline
        ? `Unverified applications cannot move forward before ${nextDeadline.title} closes ${nextDeadline.date}.`
        : "Unverified applications cannot move to the next step.",
      actions: [{ kind: "navigate", label: "Start reviewing", href: "/staff/documents", style: "solid-green" }],
    });
  }

  // 3. Stalled registrations — cause-grouped, not deadline-driven
  if (stalled.rows.length > 0) {
    const count = stalled.rows.length;
    const modal = stalled.modalItemType;
    let subline: string;
    if (modal && modal.count === count) {
      subline = `All ${count} are stuck on the same step: ${modal.name}.`;
    } else if (modal) {
      subline = `${modal.count} of ${count} are stuck on the same step: ${modal.name}.`;
    } else {
      subline = "These families haven't touched their registration in a while.";
    }

    rows.push({
      key: "stalled_registrations",
      urgency: "green",
      eyebrow: null,
      sentence: `${count} famil${count === 1 ? "y has" : "ies have"} gone quiet mid-registration for ${STALLED_DAYS_THRESHOLD}+ days.`,
      subline,
      actions: [
        {
          kind: "send_nudges",
          label: "Send nudge",
          enrollmentIds: stalled.rows.map((r) => r.enrollment_id),
          style: "outline",
        },
      ],
    });
  }

  // 4. Releasable seats — real capacity computed from live enrollment/offer/waitlist rows
  const totalReleasable = releasableSeatGroups.reduce((sum, g) => sum + g.releasable, 0);
  if (totalReleasable > 0) {
    const primary = [...releasableSeatGroups].sort((a, b) => b.releasable - a.releasable)[0];
    const allNextInLine = releasableSeatGroups.flatMap((g) => g.next_in_line);
    const namesPreview = primary.next_in_line.slice(0, 3).map((n) => n.student_name);

    rows.push({
      key: "releasable_seats",
      urgency: "green",
      eyebrow: null,
      sentence:
        releasableSeatGroups.length === 1
          ? `${primary.releasable} seat${primary.releasable === 1 ? "" : "s"} opened in ${primary.grade} after recent declines and withdrawals.`
          : `${totalReleasable} seats opened across ${releasableSeatGroups.length} grades after recent declines and withdrawals.`,
      subline: namesPreview.length > 0 ? `Next on the waitlist: ${namesPreview.join(", ")}.` : undefined,
      actions: [
        {
          kind: "release_seats",
          label: "Release seats",
          waitlistPositionIds: allNextInLine.map((n) => n.waitlist_position_id),
          style: "outline",
        },
      ],
    });
  }

  // 5. Duplicate suspects — informational, lowest consequence
  if (duplicateSuspects.length > 0) {
    const count = duplicateSuspects.length;
    const compareTarget = duplicateSuspects[0]?.guardians[0]?.name.split(" ").slice(-1)[0] ?? "";

    rows.push({
      key: "duplicate_suspects",
      urgency: "stone",
      eyebrow: null,
      sentence: `${count} possible duplicate household${count === 1 ? "" : "s"}. Same phone, different guardian spelling.`,
      subline: undefined,
      actions: [
        {
          kind: "navigate",
          label: "Compare",
          href: compareTarget ? `/staff/applications?search=${encodeURIComponent(compareTarget)}` : "/staff/applications",
          style: "outline",
        },
      ],
    });
  }

  // ─── Per-grade seat progress bars ──────────────────────────────────────
  const byGrade = new Map<string, { total: number; registered: number; committed: number }>();
  for (const row of (capacityRows ?? []) as Record<string, unknown>[]) {
    const grade = (row.grade_level as Record<string, string> | null)?.grade ?? "?";
    const total = (row.total_seats as number) ?? 0;
    const offered = (row.seats_offered as number) ?? 0;
    const accepted = (row.seats_accepted as number) ?? 0;
    const registered = (row.seats_registered as number) ?? 0;
    const committed = Math.max(offered, accepted, registered);
    const existing = byGrade.get(grade) ?? { total: 0, registered: 0, committed: 0 };
    existing.total += total;
    existing.registered += registered;
    existing.committed += committed;
    byGrade.set(grade, existing);
  }
  const seatProgress: SeatProgressGroup[] = [...byGrade.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([grade, v]) => ({
      grade: `Grade ${grade}`,
      total: v.total,
      enrolled: v.registered,
      offerOut: Math.max(0, v.committed - v.registered),
      unfilled: Math.max(0, v.total - v.committed),
    }));

  return (
    <TodayClient
      firstName={firstName}
      timeOfDay={timeOfDay}
      schoolYearName={(currentSY?.name as string) ?? null}
      rows={rows}
      timeCriticalCount={timeCriticalCount}
      seatProgress={seatProgress}
      registrationCompletion={registrationCompletion}
      callEscalationQueue={callEscalation.rows}
      callEscalationAvailable={callEscalation.available}
      denied={searchParams?.denied === "1"}
    />
  );
}
