import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  isTerminalStatus,
  getAllowedTransitions,
  type ApplicationStatusValue,
} from "../state-machine";

// ─── isValidTransition ────────────────────────────────────────────────────────

describe("isValidTransition — valid paths", () => {
  const validCases: [ApplicationStatusValue, ApplicationStatusValue][] = [
    ["draft", "submitted"],
    ["draft", "withdrawn"],
    ["submitted", "needs_info"],
    ["submitted", "verified"],
    ["submitted", "withdrawn"],
    ["needs_info", "submitted"],
    ["needs_info", "withdrawn"],
    ["verified", "lottery_assigned"],
    ["verified", "offered"],
    ["verified", "withdrawn"],
    ["lottery_assigned", "offered"],
    ["lottery_assigned", "waitlisted"],
    ["lottery_assigned", "withdrawn"],
    ["offered", "accepted"],
    ["offered", "declined"],
    ["offered", "expired"],
    ["offered", "withdrawn"],
    ["accepted", "registered"],
    ["accepted", "withdrawn"],
    ["waitlisted", "offered"],
    ["waitlisted", "withdrawn"],
    ["registered", "withdrawn"],
  ];

  for (const [from, to] of validCases) {
    it(`allows ${from} → ${to}`, () => {
      const result = isValidTransition(from, to);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });
  }
});

describe("isValidTransition — invalid paths", () => {
  it("rejects transitioning to the current status (no-op)", () => {
    const result = isValidTransition("submitted", "submitted");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/already in status/i);
  });

  it("rejects skipping states (draft → registered)", () => {
    const result = isValidTransition("draft", "registered");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("rejects backward transitions (registered → draft)", () => {
    const result = isValidTransition("registered", "draft");
    expect(result.allowed).toBe(false);
  });

  it("rejects going from verified directly to accepted (must go through offered)", () => {
    const result = isValidTransition("verified", "accepted");
    expect(result.allowed).toBe(false);
  });

  it("rejects draft → verified (must go through submitted first)", () => {
    const result = isValidTransition("draft", "verified");
    expect(result.allowed).toBe(false);
  });
});

// ─── Terminal State Enforcement ───────────────────────────────────────────────

describe("isValidTransition — terminal state enforcement", () => {
  const terminalStatuses: ApplicationStatusValue[] = ["declined", "expired", "withdrawn"];
  const someTarget: ApplicationStatusValue = "submitted";

  for (const terminal of terminalStatuses) {
    it(`blocks any transition out of terminal state "${terminal}"`, () => {
      const result = isValidTransition(terminal, someTarget);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/terminal/i);
    });
  }

  it("terminal states cannot transition to each other", () => {
    expect(isValidTransition("declined", "withdrawn").allowed).toBe(false);
    expect(isValidTransition("withdrawn", "expired").allowed).toBe(false);
    expect(isValidTransition("expired", "declined").allowed).toBe(false);
  });
});

// ─── isTerminalStatus ─────────────────────────────────────────────────────────

describe("isTerminalStatus", () => {
  it("returns true for all terminal statuses", () => {
    expect(isTerminalStatus("declined")).toBe(true);
    expect(isTerminalStatus("expired")).toBe(true);
    expect(isTerminalStatus("withdrawn")).toBe(true);
  });

  it("returns false for all non-terminal statuses", () => {
    const nonTerminal: ApplicationStatusValue[] = [
      "draft",
      "submitted",
      "needs_info",
      "verified",
      "lottery_assigned",
      "offered",
      "accepted",
      "waitlisted",
      "registered",
    ];

    for (const status of nonTerminal) {
      expect(isTerminalStatus(status)).toBe(false);
    }
  });
});

// ─── getAllowedTransitions ─────────────────────────────────────────────────────

describe("getAllowedTransitions", () => {
  it("returns empty array for terminal states", () => {
    expect(getAllowedTransitions("declined")).toHaveLength(0);
    expect(getAllowedTransitions("expired")).toHaveLength(0);
    expect(getAllowedTransitions("withdrawn")).toHaveLength(0);
  });

  it("returns correct targets for draft", () => {
    const targets = getAllowedTransitions("draft");
    expect(targets).toContain("submitted");
    expect(targets).toContain("withdrawn");
    expect(targets).not.toContain("registered");
  });

  it("returns correct targets for offered", () => {
    const targets = getAllowedTransitions("offered");
    expect(targets).toContain("accepted");
    expect(targets).toContain("declined");
    expect(targets).toContain("expired");
    expect(targets).toContain("withdrawn");
  });

  it("is consistent with isValidTransition", () => {
    // For each status, every allowed transition from getAllowedTransitions
    // must also be allowed by isValidTransition
    const allStatuses: ApplicationStatusValue[] = [
      "draft", "submitted", "needs_info", "verified", "lottery_assigned",
      "offered", "accepted", "waitlisted", "registered",
      "declined", "expired", "withdrawn",
    ];

    for (const from of allStatuses) {
      const allowed = getAllowedTransitions(from);
      for (const to of allowed) {
        expect(isValidTransition(from, to).allowed).toBe(true);
      }
    }
  });
});
