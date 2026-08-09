import { describe, it, expect } from "vitest";
import {
  derivePlaybookStatus,
  supportedStatusCodes,
  unsupportedStatusCodes,
  PLAYBOOK_STATUS_META,
} from "../playbook-status";

describe("derivePlaybookStatus — precedence", () => {
  it("a declined family is DECLINED, not a melt risk", () => {
    // Precedence bug this guards: a family who said no would otherwise appear
    // on the melt-risk call list, and staff would phone people who already left.
    expect(
      derivePlaybookStatus({
        offerStatus: "declined",
        packetStatus: "complete",
        inMeltWindow: true,
        daysSinceContact: null,
      })
    ).toBe("DECLINED");
  });

  it("a waitlisted family is WAITLIST even with an application status set", () => {
    expect(derivePlaybookStatus({ onWaitlist: true, applicationStatus: "submitted" })).toBe(
      "WAITLIST"
    );
  });

  it("a quiet enrolled family is MELT_RISK, not plain ENROLLED", () => {
    // The whole point of the code. Reporting them as ENROLLED is how they melt.
    expect(
      derivePlaybookStatus({
        packetStatus: "complete",
        inMeltWindow: true,
        daysSinceContact: 20,
      })
    ).toBe("MELT_RISK");
  });

  it("treats never-contacted as melt risk, not as recently contacted", () => {
    expect(
      derivePlaybookStatus({
        packetStatus: "complete",
        inMeltWindow: true,
        daysSinceContact: null,
      })
    ).toBe("MELT_RISK");
  });

  it("a recently contacted enrolled family is ENROLLED", () => {
    expect(
      derivePlaybookStatus({
        packetStatus: "complete",
        inMeltWindow: true,
        daysSinceContact: 3,
      })
    ).toBe("ENROLLED");
  });

  it("does not flag melt risk outside the melt window", () => {
    // After the first day of school, silence is a retention question.
    expect(
      derivePlaybookStatus({
        packetStatus: "complete",
        inMeltWindow: false,
        daysSinceContact: 90,
      })
    ).toBe("ENROLLED");
  });

  it("fires exactly at the 14-day threshold", () => {
    const at13 = derivePlaybookStatus({
      packetStatus: "complete",
      inMeltWindow: true,
      daysSinceContact: 13,
    });
    const at14 = derivePlaybookStatus({
      packetStatus: "complete",
      inMeltWindow: true,
      daysSinceContact: 14,
    });
    expect(at13).toBe("ENROLLED");
    expect(at14).toBe("MELT_RISK");
  });

  it("returns null for a family mid-application rather than inventing a code", () => {
    expect(derivePlaybookStatus({ applicationStatus: "submitted" })).toBeNull();
    expect(derivePlaybookStatus({})).toBeNull();
  });

  it("treats a withdrawn application as DECLINED per the playbook trigger", () => {
    expect(derivePlaybookStatus({ applicationStatus: "withdrawn" })).toBe("DECLINED");
  });
});

describe("code support is stated honestly", () => {
  it("reports the four computable codes as supported", () => {
    expect(supportedStatusCodes().map((m) => m.code).sort()).toEqual([
      "DECLINED",
      "ENROLLED",
      "MELT_RISK",
      "WAITLIST",
    ]);
  });

  it("reports the two blocked codes with a reason rather than hiding them", () => {
    const unsupported = unsupportedStatusCodes();
    expect(unsupported.map((m) => m.code).sort()).toEqual(["ACTIVE", "ORI_CONFIRMED"]);
    for (const meta of unsupported) {
      expect(meta.unsupportedReason).toBeTruthy();
    }
  });

  it("never derives a code the app claims not to support", () => {
    const supported = new Set(supportedStatusCodes().map((m) => m.code));
    const cases = [
      { packetStatus: "complete", inMeltWindow: true, daysSinceContact: null },
      { offerStatus: "declined" },
      { onWaitlist: true },
      { packetStatus: "complete", inMeltWindow: false },
    ];
    for (const c of cases) {
      const code = derivePlaybookStatus(c);
      if (code) expect(supported.has(code)).toBe(true);
    }
  });

  it("carries the playbook's trigger and action text for every code", () => {
    for (const meta of Object.values(PLAYBOOK_STATUS_META)) {
      expect(meta.trigger.length).toBeGreaterThan(0);
      expect(meta.action.length).toBeGreaterThan(0);
    }
  });
});
