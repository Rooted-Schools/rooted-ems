import { describe, it, expect, vi } from "vitest";
import type { ExistingLead, CandidateLead } from "../lead-sync";

// computeMerge is a pure function and never touches Supabase or the inquiry
// mutation — but lead-sync.ts imports createLeadFromInquiry at module scope,
// which transitively pulls in get-session.ts's React cache() wrapper. Mock
// the immediate dependency so this stays a fast, isolated unit test. (The
// type-only import above is erased at compile time, so it triggers none of
// this — only the runtime import below does.)
vi.mock("@rooted-ems/database/server", () => ({
  createServiceRoleClient: () => ({}),
}));
vi.mock("../mutations/leads", () => ({
  createLeadFromInquiry: vi.fn(),
}));

const { computeMerge } = await import("../lead-sync");

/**
 * computeMerge is the fix for the gap where a duplicate email on a second
 * sheet submission was silently discarded even when it carried a phone
 * number, a corrected grade, or other info the existing record lacked.
 * These tests pin the two rules that make the fix safe rather than reckless:
 *   1. A blank field always gets filled in — we never lose information.
 *   2. A field that already has a value is only overwritten when the new
 *      submission is genuinely newer than the last time the record changed
 *      — an older duplicate must never clobber a more current value.
 */

function existing(overrides: Partial<ExistingLead["fields"]> = {}, updatedAt = "2026-01-01T00:00:00Z"): ExistingLead {
  return {
    id: "lead-1",
    updated_at: updatedAt,
    notes: null,
    fields: {
      phone: null,
      first_name: "Ana",
      last_name: "Garcia",
      student_first_name: null,
      entry_grade: null,
      zip: null,
      preferred_language: "en",
      ...overrides,
    },
  };
}

function candidate(overrides: Partial<CandidateLead> = {}): CandidateLead {
  return {
    email: "ana@example.com",
    first_name: "Ana",
    last_name: "Garcia",
    source: "website",
    source_detail: "test",
    submitted_at: null,
    ...overrides,
  };
}

describe("computeMerge", () => {
  it("fills in a blank field regardless of submission recency", () => {
    const merge = computeMerge(existing({ phone: null }), candidate({ phone: "8035550100", submitted_at: null }));
    expect(merge).not.toBeNull();
    expect(merge!.patch.phone).toBe("8035550100");
  });

  it("does not touch a filled field when the duplicate is not demonstrably newer", () => {
    const merge = computeMerge(
      existing({ entry_grade: "6" }, "2026-06-01T00:00:00Z"),
      candidate({ entry_grade: "7", submitted_at: new Date("2026-01-01T00:00:00Z") }) // older than updated_at
    );
    // entry_grade must NOT change; if nothing else differs, merge is null
    expect(merge).toBeNull();
  });

  it("overwrites a filled field when the new submission is genuinely newer", () => {
    const merge = computeMerge(
      existing({ entry_grade: "6" }, "2026-01-01T00:00:00Z"),
      candidate({ entry_grade: "7", submitted_at: new Date("2026-06-01T00:00:00Z") })
    );
    expect(merge).not.toBeNull();
    expect(merge!.patch.entry_grade).toBe("7");
    expect(merge!.changed.join(" ")).toContain("entry_grade");
  });

  it("never overwrites with an unknown submission time even if the existing value differs", () => {
    const merge = computeMerge(
      existing({ entry_grade: "6" }, "2026-01-01T00:00:00Z"),
      candidate({ entry_grade: "7", submitted_at: null }) // no timestamp = can't prove it's newer
    );
    expect(merge).toBeNull();
  });

  it("appends new notes rather than overwriting or duplicating them", () => {
    const base = existing();
    base.notes = "Interested in the fall cohort.";
    const merge = computeMerge(base, candidate({ notes: "Also asked about transportation." }));
    expect(merge).not.toBeNull();
    expect(merge!.patch.notes).toBe("Interested in the fall cohort.\nAlso asked about transportation.");
  });

  it("does not re-append a note that is already present", () => {
    const base = existing();
    base.notes = "Asked about transportation.";
    const merge = computeMerge(base, candidate({ notes: "Asked about transportation." }));
    expect(merge).toBeNull();
  });

  it("returns null when the duplicate offers nothing new at all", () => {
    const merge = computeMerge(
      existing({ phone: "8035550100" }, "2026-06-01T00:00:00Z"),
      candidate({ phone: undefined, submitted_at: new Date("2026-01-01T00:00:00Z") })
    );
    expect(merge).toBeNull();
  });

  it("fills multiple blank fields from a single duplicate", () => {
    const merge = computeMerge(
      existing({ phone: null, zip: null }),
      candidate({ phone: "8035550100", zip: "29201" })
    );
    expect(merge).not.toBeNull();
    expect(merge!.patch.phone).toBe("8035550100");
    expect(merge!.patch.zip).toBe("29201");
  });
});
