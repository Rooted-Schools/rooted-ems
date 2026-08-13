/**
 * Security-contract tests for family-facing registration mutations.
 *
 * Both mutations walk ownership through nested joins:
 *   completeRegistrationItem: registration_item → enrollment → application → guardian → user_id
 *   submitRegistrationPacket: enrollment → application → guardian → user_id
 *
 * Contract per mutation:
 *   1. Unauthenticated  → "Not authenticated", NO write
 *   2. Non-owner        → "Not authorized",    NO write
 *   3. Owner            → guard passes, write proceeds
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { supabaseMock, hasEqFilter } from "./helpers/supabase-mock";
import {
  completeRegistrationItem,
  submitRegistrationPacket,
} from "@/lib/mutations/registration";

vi.mock("@rooted-ems/database/server", async () => {
  const { supabaseMock } = await import("./helpers/supabase-mock");
  return {
    createServerClient: async () => supabaseMock.authClient(),
    createServiceRoleClient: () => supabaseMock.serviceClient(),
  };
});

vi.mock("@/lib/notify", () => ({
  notifyFamilyRegistrationReady: vi.fn(async () => {}),
  notifyFamilyRegistrationSubmitted: vi.fn(async () => {}),
  notifyStaffRegistrationSubmitted: vi.fn(async () => {}),
}));

const OWNER = { id: "user-owner" };
const ATTACKER = { id: "user-attacker" };
const ITEM_ID = "item-1";
const ENROLLMENT_ID = "enr-1";

/** Ownership walk result for registration_item → ... → guardian.user_id */
const itemOwnershipRow = (ownerUserId: string) => ({
  data: {
    id: ITEM_ID,
    enrollment: { application: { guardian: { user_id: ownerUserId } } },
  },
  error: null,
});

/** Ownership walk result for enrollment → application → guardian.user_id */
const enrollmentOwnershipRow = (ownerUserId: string) => ({
  data: { id: ENROLLMENT_ID, application: { guardian: { user_id: ownerUserId } } },
  error: null,
});

beforeEach(() => {
  supabaseMock.reset();
  vi.clearAllMocks();
});

// ─── completeRegistrationItem ───────────────────────────────────────────────

describe("completeRegistrationItem", () => {
  const input = { item_id: ITEM_ID, data: { signature: "Maya G." } };

  it("rejects unauthenticated users and performs no write", async () => {
    supabaseMock.setUser(null);

    const result = await completeRegistrationItem(input);

    expect(result.error).toBe("Not authenticated");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("rejects a user who does not own the item (ownership walk) and performs no write", async () => {
    supabaseMock.setUser(ATTACKER);
    supabaseMock.queueResult("registration_item", itemOwnershipRow(OWNER.id));

    const result = await completeRegistrationItem(input);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("rejects when the ownership walk resolves no guardian (unknown item), no write", async () => {
    supabaseMock.setUser(OWNER);
    // Queue nothing — the ownership select resolves to data:null.

    const result = await completeRegistrationItem(input);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("allows the owner to complete a pending item (conditional on status=pending)", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "registration_item",
      itemOwnershipRow(OWNER.id),
      { data: null, error: null }, // item update result
      { data: { enrollment_id: ENROLLMENT_ID }, error: null }, // enrollment_id lookup
      { data: [], error: null } // remaining pending items → none
    );
    supabaseMock.queueResult("registration_packet", { data: null, error: null });

    const result = await completeRegistrationItem(input);

    expect(result.error).toBeNull();
    const itemWrites = supabaseMock.writes("registration_item");
    expect(itemWrites).toHaveLength(1);
    expect(itemWrites[0].op).toBe("update");
    expect(itemWrites[0].payload).toMatchObject({ status: "submitted" });
    expect(hasEqFilter(itemWrites[0], "id", ITEM_ID)).toBe(true);
    // Guard against re-submitting an already-completed item.
    expect(hasEqFilter(itemWrites[0], "status", "pending")).toBe(true);
    // All items done → packet advanced to submitted.
    const packetWrites = supabaseMock.writes("registration_packet");
    expect(packetWrites).toHaveLength(1);
    expect(packetWrites[0].payload).toMatchObject({ status: "submitted" });
  });
});

// ─── submitRegistrationPacket ───────────────────────────────────────────────

describe("submitRegistrationPacket", () => {
  it("rejects unauthenticated users and performs no write", async () => {
    supabaseMock.setUser(null);

    const result = await submitRegistrationPacket(ENROLLMENT_ID);

    expect(result.error).toBe("Not authenticated");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("rejects a user who does not own the enrollment (ownership walk) and performs no write", async () => {
    supabaseMock.setUser(ATTACKER);
    supabaseMock.queueResult("enrollment", enrollmentOwnershipRow(OWNER.id));

    const result = await submitRegistrationPacket(ENROLLMENT_ID);

    expect(result.error).toBe("Not authorized");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("allows the owner to submit when no required items are pending", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "enrollment",
      enrollmentOwnershipRow(OWNER.id),
      {
        data: { campus_id: "c-1", school_year_id: "sy-1", application_id: "app-1" },
        error: null,
      }
    );
    // Two separate packet_requirement queries, in order: (1) the active-
    // requirements guard — must be non-empty or submission is refused
    // outright (NO_REQUIREMENTS_ERROR); (2) the is_required-only lookup used
    // to decide whether anything still blocks. Here nothing is marked
    // required, so the pending-items check is skipped entirely.
    supabaseMock.queueResult(
      "packet_requirement",
      { data: [{ item_type: "immunization_record" }], error: null }, // active requirements guard
      { data: [], error: null } // required-only lookup — nothing required
    );
    supabaseMock.queueResult("registration_packet", { data: null, error: null });

    const result = await submitRegistrationPacket(ENROLLMENT_ID);

    expect(result.error).toBeNull();
    const packetWrites = supabaseMock.writes("registration_packet");
    expect(packetWrites).toHaveLength(1);
    expect(packetWrites[0].op).toBe("update");
    expect(packetWrites[0].payload).toMatchObject({ status: "submitted" });
    expect(hasEqFilter(packetWrites[0], "enrollment_id", ENROLLMENT_ID)).toBe(true);
  });

  it("blocks submission while required items are still pending (no write)", async () => {
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "enrollment",
      enrollmentOwnershipRow(OWNER.id),
      {
        data: { campus_id: "c-1", school_year_id: "sy-1", application_id: "app-1" },
        error: null,
      }
    );
    supabaseMock.queueResult(
      "packet_requirement",
      { data: [{ item_type: "immunization_record" }], error: null }, // active requirements guard
      { data: [{ item_type: "immunization_record" }], error: null } // required-only lookup
    );
    supabaseMock.queueResult("registration_item", {
      data: [{ id: "item-9", item_type: "immunization_record" }],
      error: null,
    });

    const result = await submitRegistrationPacket(ENROLLMENT_ID);

    expect(result.error).toBe("1 required item(s) still need to be completed.");
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("refuses to submit — and treats the packet as complete on nothing — when the campus/year has zero active packet requirements", async () => {
    // The hard error this refusal exists for: an empty requirement set makes
    // every "nothing is still pending" check pass vacuously, so a packet
    // with zero items would otherwise read as complete and the family would
    // be marked fully registered without submitting anything.
    supabaseMock.setUser(OWNER);
    supabaseMock.queueResult(
      "enrollment",
      enrollmentOwnershipRow(OWNER.id),
      {
        data: { campus_id: "c-1", school_year_id: "sy-1", application_id: "app-1" },
        error: null,
      }
    );
    supabaseMock.queueResult("packet_requirement", { data: [], error: null }); // active requirements guard — empty

    const result = await submitRegistrationPacket(ENROLLMENT_ID);

    expect(result.error).toBe(
      "No registration requirements are configured for this school year. Add them in Settings before registering families."
    );
    expect(supabaseMock.writes()).toHaveLength(0);
  });
});
