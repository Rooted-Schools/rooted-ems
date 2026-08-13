/**
 * Governance, rehearsal isolation, and crash safety in the lottery engine.
 *
 * The three contracts asserted here are the ones that, if broken, produce
 * consequences that cannot be undone:
 *
 *   1. REHEARSAL ISOLATION — a test rehearsal writes only its own run records.
 *      Asserted as the absence of writes, because "we did not touch anything"
 *      is the only form of that claim worth testing.
 *
 *   2. GOVERNANCE — a run cannot become official without an adopted board
 *      policy behind it, and a rehearsal can never become official at all.
 *
 *   3. CRASH SAFETY — finalize commits snapshot then status, both idempotent,
 *      and family notifications fan out only after the commit, from a ledger
 *      that a resume can walk without notifying anyone twice.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseMock, hasEqFilter, type RecordedOp } from "./helpers/supabase-mock";

// Default: a channel actually delivered, so the fan-out counts these as
// "sent". Individual tests override with mockRejectedValueOnce / a
// no-delivery object to exercise the failure path.
const { notifyOfferMock, notifyWaitlistMock } = vi.hoisted(() => ({
  notifyOfferMock: vi.fn(async () => ({ inApp: true, email: true, sms: false })),
  notifyWaitlistMock: vi.fn(async () => ({ inApp: true, email: true, sms: false })),
}));

vi.mock("@rooted-ems/database/server", async () => {
  const { supabaseMock } = await import("./helpers/supabase-mock");
  return {
    createServerClient: async () => supabaseMock.authClient(),
    createServiceRoleClient: () => supabaseMock.serviceClient(),
  };
});

// The @rooted-ems/utils barrel pulls in a zod-dependent module that does not
// load under this runner. Only two functions are needed here, and the seed is
// pinned so the draw is reproducible inside the test.
vi.mock("@rooted-ems/utils", () => ({
  generateLotterySeed: () => "test-seed-0001",
  runDeterministicLottery: (
    _seed: string,
    entries: Array<{ id: string; priority_tier: number }>,
    seats: number
  ) => ({
    ranked: entries.map((e, i) => ({
      ...e,
      random_number: (i + 1) / 100,
      final_rank: i + 1,
      is_selected: i < seats,
    })),
    seed: _seed,
    total_entries: entries.length,
    total_selected: Math.min(seats, entries.length),
  }),
}));

vi.mock("@/lib/audit", () => ({
  logAuditEvent: vi.fn(async () => {}),
  AuditAction: {
    Create: "create",
    Update: "update",
    Delete: "delete",
    StatusChange: "status_change",
    Export: "export",
  },
}));

vi.mock("@/lib/notify", () => ({
  notifyFamilyOfOffer: notifyOfferMock,
  notifyFamilyApplicationWaitlisted: notifyWaitlistMock,
  // The fan-out only marks a ledger row "sent" when a channel actually
  // delivered — read what notifyOfferMock/notifyWaitlistMock resolve to,
  // exactly like the real notify.ts helper does.
  anyChannelDelivered: (delivery: { inApp: boolean; email: boolean; sms: boolean }) =>
    delivery.inApp || delivery.email || delivery.sms,
}));

import {
  createLotteryRun,
  finalizeLotteryRun,
  sendOffersFromLottery,
  runNotificationFanOut,
} from "@/lib/mutations/lottery";
import { NO_ADOPTED_POLICY_MESSAGE } from "@/lib/lottery-policy";
import { createServiceRoleClient } from "@rooted-ems/database/server";

/** Minimal valid adopted configuration, matching the seeded RSV policy shape. */
const RSV_SNAPSHOT = {
  schemaVersion: 1,
  jurisdiction: "WA",
  adoptedBy: "Rooted School Vancouver Board of Directors",
  sourceDocument: "RSV Enrollment Policy (adopted 2023-01-25, revised 2024-08-20)",
  administeredBy: "Director of Operations",
  applicationWindow: { opensMonthDay: "11-01", closesRule: "last_day_of_february", note: "" },
  lotteryDate: { monthDay: "03-01", weekendRule: "next_weekday", note: "" },
  absolutePreferences: [
    {
      key: "sibling_current_enrolled",
      label: "Sibling of a currently enrolled student",
      enabled: true,
      autoOfferBeforeDraw: true,
      overflowToPriorityWaitlist: true,
      siblingDefinition: "shared_legal_guardian",
      definition: "Shares a legal parent or guardian.",
      fosterExcludedUntilLegalGuardianship: true,
      verificationMayBeRequired: true,
      falseClaimForfeitsSeat: true,
      authorityNote: "RSV Board Enrollment Policy, revised 2024-08-20.",
    },
  ],
  defaultWeight: 1,
  weightedTiers: [
    {
      key: "staff_child",
      label: "Child of contracted full-time staff",
      weight: 5,
      enabled: true,
      optional: false,
      source: { kind: "application_answer", field: "is_staff_child" },
      authorityNote: "RSV Board Enrollment Policy, revised 2024-08-20.",
    },
  ],
  linkedSiblingActivation: true,
  legacyPreference: false,
  preferencesFromOriginalApplicationOnly: true,
  falsifiedInformationInvalidates: true,
  preferenceClaimNote: "",
  acceptanceWindowDays: 14,
  acceptanceCutoffTime: "16:00",
  acceptanceNote: "",
  waitlistNotifyDayOffset: 15,
  enrollmentPacketDueDays: 30,
  reenrollmentDueDays: 30,
  waitlistOfferWindow: { days: 2, cutoffTime: "16:00", note: "" },
  waitlistScope: "per_grade",
  waitlistCarryover: false,
  waitlistNote: "",
  observers: [{ role: "Board representative", required: true }],
  openMeetingsActCompliance: true,
  openMeetingsActNote: "",
  postLotteryRolling: { allowed: false, exceptions: [] },
  backfillRule: "",
  mckinneyVentoNote: "",
  optionalFeatures: {
    multiBirthSingleUnit: { enabled: false, authorityNote: "" },
    foundersChildren: { enabled: false, weight: 1, capPercent: 0, authorityNote: "" },
    geographicZone: { enabled: false, weight: 1, zoneDescription: "", authorityNote: "" },
    militaryFamily: { enabled: false, weight: 1, authorityNote: "" },
    boardMemberChildren: { enabled: false, weight: 1, authorityNote: "" },
    returningStudentExemption: { enabled: false, note: "", authorityNote: "" },
  },
};

const ADOPTED_POLICY_ROW = {
  id: "policy-1",
  campus_id: "campus-1",
  name: "Rooted School Vancouver Enrollment Policy",
  version: 1,
  status: "adopted",
  config: RSV_SNAPSHOT,
  adopted_date: "2024-08-20",
  adopted_note: null,
  created_at: "2024-08-20T00:00:00Z",
  updated_at: "2024-08-20T00:00:00Z",
};

/** Queue everything createLotteryRun reads, in the order it reads it. */
function queueCreateRunReads(options: { adopted: boolean }) {
  supabaseMock.queueResult(
    "lottery_run",
    { data: [{ run_number: 2 }], error: null }, // next run number
    { data: { id: "run-new" }, error: null } // insert
  );
  supabaseMock.queueResult(
    "application",
    { data: null, error: null }, // eligible count (head)
    { data: [{ id: "app-1" }, { id: "app-2" }], error: null }, // eligible applications
    { data: [], error: null } // tier column matcher
  );
  supabaseMock.queueResult("lottery_rule_set", { data: [], error: null });
  supabaseMock.queueResult("lottery_policy", {
    data: options.adopted ? [ADOPTED_POLICY_ROW] : [],
    error: null,
  });
  supabaseMock.queueResult("application_answer", { data: [], error: null });
  supabaseMock.queueResult("lottery_entry", { data: null, error: null });
}

function opIndex(predicate: (op: RecordedOp) => boolean): number {
  return supabaseMock.ops.findIndex(predicate);
}

beforeEach(() => {
  supabaseMock.reset();
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
//  1. Rehearsal isolation
// ═══════════════════════════════════════════════════════════════════════════

describe("rehearsal isolation — a test run touches nothing a family can see", () => {
  it("writes only its own run and entry records", async () => {
    queueCreateRunReads({ adopted: true });

    const result = await createLotteryRun({
      enrollment_window_id: "win-1",
      campus_id: "campus-1",
      grade_level_id: "grade-1",
      total_seats: 30,
      is_rehearsal: true,
    });

    expect(result.error).toBeNull();

    // The whole contract, stated as absence.
    expect(supabaseMock.writes("application")).toEqual([]);
    expect(supabaseMock.writes("offer")).toEqual([]);
    expect(supabaseMock.writes("waitlist")).toEqual([]);
    expect(supabaseMock.writes("waitlist_position")).toEqual([]);
    expect(supabaseMock.writes("waitlist_position_history")).toEqual([]);
    expect(supabaseMock.writes("lottery_notification")).toEqual([]);
    expect(supabaseMock.writes("notification")).toEqual([]);
    expect(supabaseMock.writes("enrollment")).toEqual([]);
    expect(notifyOfferMock).not.toHaveBeenCalled();
    expect(notifyWaitlistMock).not.toHaveBeenCalled();

    // What it DOES write: its own run, and its own entries.
    const runWrites = supabaseMock.writes("lottery_run");
    expect(runWrites).toHaveLength(1);
    expect(runWrites[0].op).toBe("insert");
    expect((runWrites[0].payload as Record<string, unknown>).is_rehearsal).toBe(true);

    const entryWrites = supabaseMock.writes("lottery_entry");
    expect(entryWrites).toHaveLength(1);
    expect(entryWrites[0].op).toBe("insert");
    expect((entryWrites[0].payload as Array<unknown>).length).toBe(2);
  });

  it("still moves applications to lottery_assigned for a real (non-rehearsal) run", async () => {
    // The contrast case: this proves the isolation above is caused by the
    // rehearsal flag and not by the test's queueing.
    queueCreateRunReads({ adopted: true });

    await createLotteryRun({
      enrollment_window_id: "win-1",
      campus_id: "campus-1",
      grade_level_id: "grade-1",
      total_seats: 30,
      is_rehearsal: false,
    });

    const appWrites = supabaseMock.writes("application");
    expect(appWrites).toHaveLength(1);
    expect(appWrites[0].op).toBe("update");
    expect((appWrites[0].payload as Record<string, unknown>).status).toBe("lottery_assigned");
  });

  it("binds the adopted policy onto the run and freezes a snapshot of it", async () => {
    queueCreateRunReads({ adopted: true });

    const result = await createLotteryRun({
      enrollment_window_id: "win-1",
      campus_id: "campus-1",
      grade_level_id: "grade-1",
      total_seats: 30,
    });

    const payload = supabaseMock.writes("lottery_run")[0].payload as Record<string, unknown>;
    expect(payload.policy_id).toBe("policy-1");
    expect(payload.policy_snapshot).toEqual(RSV_SNAPSHOT);
    expect(result.data?.governed).toBe(true);
    expect(result.data?.policyWarning).toBeNull();
  });

  it("creates an unbound run with an honest warning when no policy is adopted", async () => {
    queueCreateRunReads({ adopted: false });

    const result = await createLotteryRun({
      enrollment_window_id: "win-1",
      campus_id: "campus-1",
      grade_level_id: "grade-1",
      total_seats: 30,
    });

    expect(result.error).toBeNull();
    expect(result.data?.governed).toBe(false);
    expect(result.data?.policyWarning).toContain(NO_ADOPTED_POLICY_MESSAGE);
    expect(result.data?.policyWarning).toMatch(/cannot be finalized as official/);

    const payload = supabaseMock.writes("lottery_run")[0].payload as Record<string, unknown>;
    expect(payload.policy_id).toBeNull();
    expect(payload.policy_snapshot).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  2. Governance gate on finalize
// ═══════════════════════════════════════════════════════════════════════════

describe("finalize — governance gate", () => {
  it("refuses to make a run official when the campus has no adopted policy", async () => {
    supabaseMock.queueResult(
      "lottery_run",
      {
        data: {
          id: "run-1",
          status: "preview",
          total_seats: 30,
          campus_id: "campus-1",
          is_rehearsal: false,
        },
        error: null,
      },
      { data: { policy_id: null, policy_snapshot: null }, error: null }
    );

    const result = await finalizeLotteryRun("run-1", "user-1");

    expect(result.error).toBe(NO_ADOPTED_POLICY_MESSAGE);
    // Nothing at all was written: no snapshot, no status change.
    expect(supabaseMock.writes("lottery_entry_snapshot")).toEqual([]);
    expect(supabaseMock.writes("lottery_run")).toEqual([]);
  });

  it("refuses to make a run official when its policy snapshot fails validation", async () => {
    supabaseMock.queueResult(
      "lottery_run",
      {
        data: {
          id: "run-1",
          status: "preview",
          total_seats: 30,
          campus_id: "campus-1",
          is_rehearsal: false,
        },
        error: null,
      },
      {
        data: {
          policy_id: "policy-1",
          policy_snapshot: { ...RSV_SNAPSHOT, acceptanceWindowDays: 0 },
        },
        error: null,
      }
    );

    const result = await finalizeLotteryRun("run-1", "user-1");

    expect(result.error).toBe(NO_ADOPTED_POLICY_MESSAGE);
    expect(supabaseMock.writes("lottery_entry_snapshot")).toEqual([]);
    expect(supabaseMock.writes("lottery_run")).toEqual([]);
  });

  it("refuses to promote a rehearsal, before it even looks at the policy", async () => {
    supabaseMock.queueResult("lottery_run", {
      data: {
        id: "run-1",
        status: "preview",
        total_seats: 30,
        campus_id: "campus-1",
        is_rehearsal: true,
      },
      error: null,
    });

    const result = await finalizeLotteryRun("run-1", "user-1");

    expect(result.error).toMatch(/test rehearsal and can never become the official record/i);
    expect(result.error).toMatch(/fresh run/);
    expect(supabaseMock.writes("lottery_entry_snapshot")).toEqual([]);
    expect(supabaseMock.writes("lottery_run")).toEqual([]);
  });

  it("refuses to finalize a run that is not in preview", async () => {
    supabaseMock.queueResult("lottery_run", {
      data: {
        id: "run-1",
        status: "draft",
        total_seats: 30,
        campus_id: "campus-1",
        is_rehearsal: false,
      },
      error: null,
    });

    const result = await finalizeLotteryRun("run-1", "user-1");
    expect(result.error).toMatch(/must be preview/);
    expect(supabaseMock.writes("lottery_run")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  3. Crash safety: commit order, idempotency, resumable fan-out
// ═══════════════════════════════════════════════════════════════════════════

describe("finalize — commit order and crash recovery", () => {
  function queueGovernedPreviewRun() {
    supabaseMock.queueResult(
      "lottery_run",
      {
        data: {
          id: "run-1",
          status: "preview",
          total_seats: 2,
          campus_id: "campus-1",
          is_rehearsal: false,
        },
        error: null,
      },
      { data: { policy_id: "policy-1", policy_snapshot: RSV_SNAPSHOT }, error: null }
    );
  }

  it("writes the snapshot before flipping the status", async () => {
    queueGovernedPreviewRun();
    supabaseMock.queueResult("lottery_entry_snapshot", { data: [], error: null }, {
      data: null,
      error: null,
    });
    supabaseMock.queueResult("lottery_entry", {
      data: [
        {
          id: "e1",
          priority_tier: 0,
          random_number: 0.1,
          final_rank: 1,
          is_selected: true,
          application: {
            id: "app-1",
            student: { first_name: "Ada", last_name: "Lovelace" },
            grade_level: { grade: "9" },
          },
        },
      ],
      error: null,
    });
    // The status-flip update now carries .select("id"); an empty result is
    // treated as "nothing flipped", so the compare-and-swap must return the row.
    supabaseMock.queueResult("lottery_run", { data: [{ id: "run-1" }], error: null }); // status update

    const result = await finalizeLotteryRun("run-1", "user-1");
    expect(result.error).toBeNull();

    const snapshotWrite = opIndex((o) => o.table === "lottery_entry_snapshot" && o.op === "insert");
    const statusWrite = opIndex(
      (o) =>
        o.table === "lottery_run" &&
        o.op === "update" &&
        (o.payload as Record<string, unknown>)?.status === "official"
    );

    expect(snapshotWrite).toBeGreaterThan(-1);
    expect(statusWrite).toBeGreaterThan(-1);
    expect(snapshotWrite).toBeLessThan(statusWrite);
  });

  it("notifies nobody as a side effect of going official", async () => {
    queueGovernedPreviewRun();
    supabaseMock.queueResult("lottery_entry_snapshot", { data: [], error: null }, {
      data: null,
      error: null,
    });
    supabaseMock.queueResult("lottery_entry", {
      data: [
        {
          id: "e1",
          priority_tier: 0,
          random_number: 0.1,
          final_rank: 1,
          is_selected: true,
          application: {
            id: "app-1",
            student: { first_name: "Ada", last_name: "Lovelace" },
            grade_level: { grade: "9" },
          },
        },
      ],
      error: null,
    });
    supabaseMock.queueResult("lottery_run", { data: [{ id: "run-1" }], error: null });

    await finalizeLotteryRun("run-1", "user-1");

    expect(notifyOfferMock).not.toHaveBeenCalled();
    expect(notifyWaitlistMock).not.toHaveBeenCalled();
    expect(supabaseMock.writes("lottery_notification")).toEqual([]);
  });

  it("resumes after a crash between the snapshot and the status flip without duplicating snapshots", async () => {
    // The crashed attempt already wrote snapshots; the run is still in preview.
    queueGovernedPreviewRun();
    supabaseMock.queueResult("lottery_entry_snapshot", { data: [{ id: "snap-1" }], error: null });
    supabaseMock.queueResult("lottery_run", { data: [{ id: "run-1" }], error: null });

    const result = await finalizeLotteryRun("run-1", "user-1");

    expect(result.error).toBeNull();
    // No second snapshot insert...
    expect(supabaseMock.writes("lottery_entry_snapshot")).toEqual([]);
    // ...and the run still reaches official.
    const statusUpdate = supabaseMock
      .writes("lottery_run")
      .find((o) => (o.payload as Record<string, unknown>)?.status === "official");
    expect(statusUpdate).toBeDefined();
    // Guarded so a concurrent finalize cannot flip an already-official run.
    expect(hasEqFilter(statusUpdate as RecordedOp, "status", "preview")).toBe(true);
  });
});

describe("offer send — commit before fan-out, deadline from policy", () => {
  function queueOfficialRunForOffers() {
    supabaseMock.queueResult(
      "lottery_run",
      {
        data: {
          id: "run-1",
          status: "official",
          campus_id: "campus-1",
          grade_level_id: "grade-1",
          is_rehearsal: false,
        },
        error: null,
      },
      { data: { policy_id: "policy-1", policy_snapshot: RSV_SNAPSHOT }, error: null }
    );
    supabaseMock.queueResult("lottery_entry", {
      data: [
        {
          id: "e1",
          application_id: "app-1",
          application: { student: { first_name: "Ada", last_name: "Lovelace" } },
        },
      ],
      error: null,
    });
    supabaseMock.queueResult("offer", { data: [], error: null }, { data: { id: "offer-1" }, error: null });
    supabaseMock.queueResult("application", { data: null, error: null });
  }

  it("takes the response deadline from the adopted policy when none is given", async () => {
    queueOfficialRunForOffers();
    supabaseMock.queueResult(
      "lottery_notification",
      { data: null, error: null }, // ledger upsert
      { data: [], error: null } // fan-out select, nothing pending in this stub
    );

    const before = Date.now();
    const result = await sendOffersFromLottery("run-1", null, "user-1");
    expect(result.error).toBeNull();

    const offerInsert = supabaseMock.writes("offer").find((o) => o.op === "insert")!;
    const expiresAt = new Date(
      (offerInsert.payload as Record<string, string>).expires_at
    ).getTime();

    // 14 days, from the policy — not a number typed into a dialog.
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeGreaterThanOrEqual(before + fourteenDays - 5000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + fourteenDays + 5000);
  });

  it("commits every offer before any notification is attempted", async () => {
    queueOfficialRunForOffers();
    supabaseMock.queueResult(
      "lottery_notification",
      { data: null, error: null },
      {
        data: [
          {
            id: "ln-1",
            application_id: "app-1",
            kind: "offer",
            offer_id: "offer-1",
            student_name: "Ada Lovelace",
            expires_at: "2026-03-16T00:00:00Z",
            attempts: 0,
          },
        ],
        error: null,
      },
      { data: null, error: null } // mark sent
    );

    await sendOffersFromLottery("run-1", null, "user-1");

    const offerInsert = opIndex((o) => o.table === "offer" && o.op === "insert");
    const ledgerWrite = opIndex((o) => o.table === "lottery_notification" && o.op === "upsert");
    const fanOutRead = opIndex((o) => o.table === "lottery_notification" && o.op === "select");

    expect(offerInsert).toBeLessThan(ledgerWrite);
    expect(ledgerWrite).toBeLessThan(fanOutRead);
    expect(notifyOfferMock).toHaveBeenCalledTimes(1);
  });

  it("refuses to send offers from a rehearsal", async () => {
    supabaseMock.queueResult("lottery_run", {
      data: {
        id: "run-1",
        status: "preview",
        campus_id: "campus-1",
        grade_level_id: "grade-1",
        is_rehearsal: true,
      },
      error: null,
    });

    const result = await sendOffersFromLottery("run-1", null, "user-1");

    expect(result.error).toMatch(/Rehearsals never send offers/i);
    expect(supabaseMock.writes("offer")).toEqual([]);
    expect(notifyOfferMock).not.toHaveBeenCalled();
  });

  it("refuses to guess a deadline when there is no policy and none was given", async () => {
    supabaseMock.queueResult(
      "lottery_run",
      {
        data: {
          id: "run-1",
          status: "official",
          campus_id: "campus-1",
          grade_level_id: "grade-1",
          is_rehearsal: false,
        },
        error: null,
      },
      { data: { policy_id: null, policy_snapshot: null }, error: null }
    );

    const result = await sendOffersFromLottery("run-1", null, "user-1");

    expect(result.error).toMatch(/Choose a deadline explicitly/);
    expect(supabaseMock.writes("offer")).toEqual([]);
  });
});

describe("notification fan-out — resumable without double-notifying", () => {
  it("only ever claims rows that are pending or failed", async () => {
    supabaseMock.queueResult("lottery_notification", { data: [], error: null });

    await runNotificationFanOut(createServiceRoleClient(), "run-1", "campus-1");

    const read = supabaseMock.ops.find(
      (o) => o.table === "lottery_notification" && o.op === "select"
    )!;
    const statusFilter = read.filters.find((f) => f.method === "in" && f.args[0] === "status");
    expect(statusFilter?.args[1]).toEqual(["pending", "failed"]);
    // A family already marked 'sent' is therefore never revisited.
  });

  it("sends each pending family exactly once and marks the ledger row sent", async () => {
    supabaseMock.queueResult(
      "lottery_notification",
      {
        data: [
          {
            id: "ln-1",
            application_id: "app-1",
            kind: "offer",
            offer_id: "offer-1",
            student_name: "Ada Lovelace",
            expires_at: "2026-03-16T00:00:00Z",
            attempts: 0,
          },
          {
            id: "ln-2",
            application_id: "app-2",
            kind: "waitlist",
            position_number: 4,
            student_name: "Grace Hopper",
            attempts: 0,
          },
        ],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null }
    );

    const result = await runNotificationFanOut(createServiceRoleClient(), "run-1", "campus-1");

    expect(result).toEqual({ attempted: 2, sent: 2, failed: 0 });
    expect(notifyOfferMock).toHaveBeenCalledTimes(1);
    expect(notifyWaitlistMock).toHaveBeenCalledTimes(1);
    expect(notifyWaitlistMock).toHaveBeenCalledWith({
      applicationId: "app-2",
      campusId: "campus-1",
      studentName: "Grace Hopper",
      position: 4,
    });

    const updates = supabaseMock.writes("lottery_notification");
    expect(updates).toHaveLength(2);
    for (const update of updates) {
      expect((update.payload as Record<string, unknown>).status).toBe("sent");
      expect((update.payload as Record<string, unknown>).attempts).toBe(1);
    }
  });

  it("records a failure without aborting the rest of the batch, leaving it resumable", async () => {
    notifyOfferMock.mockRejectedValueOnce(new Error("provider timeout"));

    supabaseMock.queueResult(
      "lottery_notification",
      {
        data: [
          { id: "ln-1", application_id: "app-1", kind: "offer", offer_id: "o1", attempts: 0 },
          { id: "ln-2", application_id: "app-2", kind: "offer", offer_id: "o2", attempts: 0 },
        ],
        error: null,
      },
      { data: null, error: null },
      { data: null, error: null }
    );

    const result = await runNotificationFanOut(createServiceRoleClient(), "run-1", "campus-1");

    expect(result).toEqual({ attempted: 2, sent: 1, failed: 1 });

    const updates = supabaseMock.writes("lottery_notification");
    const failed = updates.find(
      (u) => (u.payload as Record<string, unknown>).status === "failed"
    )!;
    expect((failed.payload as Record<string, unknown>).last_error).toBe("provider timeout");
    expect((failed.payload as Record<string, unknown>).attempts).toBe(1);

    const sent = updates.find((u) => (u.payload as Record<string, unknown>).status === "sent");
    expect(sent).toBeDefined();
  });

  it("does nothing at all when the ledger has no outstanding rows", async () => {
    supabaseMock.queueResult("lottery_notification", { data: [], error: null });

    const result = await runNotificationFanOut(createServiceRoleClient(), "run-1", "campus-1");

    expect(result).toEqual({ attempted: 0, sent: 0, failed: 0 });
    expect(notifyOfferMock).not.toHaveBeenCalled();
    expect(notifyWaitlistMock).not.toHaveBeenCalled();
    expect(supabaseMock.writes("lottery_notification")).toEqual([]);
  });

  it("reports honestly rather than crashing when the ledger table is absent", async () => {
    supabaseMock.queueResult("lottery_notification", {
      data: null,
      error: { message: 'relation "lottery_notification" does not exist' },
    });

    const result = await runNotificationFanOut(createServiceRoleClient(), "run-1", "campus-1");

    expect(result).toEqual({ attempted: 0, sent: 0, failed: 0 });
    expect(notifyOfferMock).not.toHaveBeenCalled();
  });
});
