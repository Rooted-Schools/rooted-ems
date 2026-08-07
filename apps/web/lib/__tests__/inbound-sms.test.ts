/**
 * Unit tests for the inbound (two-way) SMS path.
 *
 * Three things are worth protecting here:
 *
 *   1. Signature verification. It is the only gate on the webhook, so both a
 *      known-good vector and every way of tampering with one are checked.
 *   2. STOP parsing. A missed opt-out is a TCPA problem, and a false positive
 *      silently stops texting a family who asked a question.
 *   3. Last-10-digit matching. A number Twilio sends as "+15555550100" must
 *      find a guardian stored as "(555) 555-0100", and must NOT find a
 *      different number that merely shares a suffix.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

// ─── Supabase mock ────────────────────────────────────────────────────────────
//
// Same contract as ./helpers/supabase-mock (FIFO result queue per table, every
// chain recorded), with the two filter methods this module needs that the
// shared helper does not carry: `ilike` and `update(...).in(...)`.

interface TableResult {
  data: unknown;
  error: ({ message: string; code?: string }) | null;
}

interface RecordedOp {
  table: string;
  op: "select" | "insert" | "update";
  payload?: unknown;
  filters: { method: string; args: unknown[] }[];
}

class InboundSupabaseMock {
  ops: RecordedOp[] = [];
  private queues = new Map<string, TableResult[]>();

  reset(): void {
    this.ops = [];
    this.queues.clear();
  }

  queueResult(table: string, ...results: TableResult[]): void {
    const q = this.queues.get(table) ?? [];
    q.push(...results);
    this.queues.set(table, q);
  }

  writes(table?: string): RecordedOp[] {
    return this.ops.filter((o) => o.op !== "select" && (table === undefined || o.table === table));
  }

  private nextResult(table: string): TableResult {
    const q = this.queues.get(table);
    return q && q.length > 0 ? (q.shift() as TableResult) : { data: null, error: null };
  }

  from(table: string) {
    const op: RecordedOp = { table, op: "select", filters: [] };
    let recorded = false;
    const record = () => {
      if (!recorded) {
        this.ops.push(op);
        recorded = true;
      }
    };
    const resolve = (): TableResult => {
      record();
      return this.nextResult(table);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    for (const m of ["insert", "update"] as const) {
      builder[m] = vi.fn((payload?: unknown) => {
        op.op = m;
        op.payload = payload;
        record();
        return builder;
      });
    }
    for (const m of ["select", "eq", "in", "ilike", "order", "limit"] as const) {
      builder[m] = vi.fn((...args: unknown[]) => {
        op.filters.push({ method: m, args });
        record();
        return builder;
      });
    }
    builder.single = vi.fn(async () => resolve());
    builder.maybeSingle = vi.fn(async () => resolve());
    builder.then = (
      onFulfilled?: (value: TableResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(resolve()).then(onFulfilled, onRejected);
    return builder;
  }

  serviceClient() {
    return { from: (table: string) => this.from(table) };
  }
}

// The holder is hoisted so the vi.mock factory below can close over it; the
// instance itself is assigned after the class declaration has evaluated. Only
// the closure's call-time read matters, so the ordering is safe.
const { holder, sendNotificationMock } = vi.hoisted(() => ({
  holder: { client: null as { serviceClient: () => unknown } | null },
  sendNotificationMock: vi.fn(),
}));

const supabaseMock = new InboundSupabaseMock();
holder.client = supabaseMock;

vi.mock("@rooted-ems/database/server", () => ({
  createServiceRoleClient: () => holder.client!.serviceClient(),
}));

vi.mock("@/lib/mutations/communications", () => ({
  sendNotification: sendNotificationMock,
}));

import { handleInboundSms, classifyInboundBody, phoneVariants } from "@/lib/inbound-sms";
import { verifyTwilioSignature, phoneDigits10 } from "@/lib/sms";

const MISSING_TABLE = { message: 'relation "public.inbound_sms" does not exist', code: "42P01" };

beforeEach(() => {
  supabaseMock.reset();
  sendNotificationMock.mockReset();
  sendNotificationMock.mockResolvedValue({ data: { sentCount: 1 }, error: null });
});

/** Queue the two lookups matchByPhone performs when the exact pass misses. */
function queuePhoneLookup(table: string, exact: unknown[], fuzzy: unknown[] | null): void {
  supabaseMock.queueResult(table, { data: exact, error: null });
  if (fuzzy !== null) supabaseMock.queueResult(table, { data: fuzzy, error: null });
}

// ─── Signature verification ───────────────────────────────────────────────────

describe("verifyTwilioSignature", () => {
  // Twilio's own documented worked example (Security → validating requests).
  const AUTH_TOKEN = "12345";
  const URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const PARAMS = {
    CallSid: "CA1234567890ABCDE",
    Caller: "+14158675309",
    Digits: "1234",
    From: "+14158675309",
    To: "+18005551212",
  };

  /** Independent re-implementation of the documented algorithm. */
  function sign(url: string, params: Record<string, string>, token: string): string {
    const payload = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], url);
    return crypto.createHmac("sha1", token).update(payload, "utf8").digest("base64");
  }

  it("accepts a correctly signed request", () => {
    expect(
      verifyTwilioSignature({
        url: URL,
        params: PARAMS,
        signature: sign(URL, PARAMS, AUTH_TOKEN),
        authToken: AUTH_TOKEN,
      })
    ).toBe(true);
  });

  // A frozen expected value, so a refactor of the production function that
  // quietly changes the payload construction (sort order, concatenation,
  // encoding, digest) fails here rather than in production.
  it("accepts the signature the documented algorithm produces for these inputs", () => {
    expect(
      verifyTwilioSignature({
        url: URL,
        params: PARAMS,
        signature: "RSOYDt4T1cUTdK1PDd93/VVr8B8=",
        authToken: AUTH_TOKEN,
      })
    ).toBe(true);
  });

  it("is order-independent — params are sorted before signing", () => {
    const reordered = {
      To: PARAMS.To,
      Digits: PARAMS.Digits,
      CallSid: PARAMS.CallSid,
      From: PARAMS.From,
      Caller: PARAMS.Caller,
    };
    expect(
      verifyTwilioSignature({
        url: URL,
        params: reordered,
        signature: sign(URL, PARAMS, AUTH_TOKEN),
        authToken: AUTH_TOKEN,
      })
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = sign(URL, PARAMS, AUTH_TOKEN);
    expect(
      verifyTwilioSignature({
        url: URL,
        params: { ...PARAMS, Digits: "9999" },
        signature,
        authToken: AUTH_TOKEN,
      })
    ).toBe(false);
  });

  it("rejects a signature computed for a different URL", () => {
    const signature = sign("https://evil.example.com/api/webhooks/twilio", PARAMS, AUTH_TOKEN);
    expect(verifyTwilioSignature({ url: URL, params: PARAMS, signature, authToken: AUTH_TOKEN })).toBe(
      false
    );
  });

  it("rejects a signature made with the wrong auth token", () => {
    expect(
      verifyTwilioSignature({
        url: URL,
        params: PARAMS,
        signature: sign(URL, PARAMS, "not-the-token"),
        authToken: AUTH_TOKEN,
      })
    ).toBe(false);
  });

  it("rejects empty, malformed, and wrong-length signatures without throwing", () => {
    for (const signature of ["", "not-base64!!", "short", sign(URL, PARAMS, AUTH_TOKEN) + "extra"]) {
      expect(verifyTwilioSignature({ url: URL, params: PARAMS, signature, authToken: AUTH_TOKEN })).toBe(
        false
      );
    }
  });

  it("rejects when no auth token is configured", () => {
    expect(
      verifyTwilioSignature({
        url: URL,
        params: PARAMS,
        signature: sign(URL, PARAMS, AUTH_TOKEN),
        authToken: "",
      })
    ).toBe(false);
  });
});

// ─── STOP / START parsing ─────────────────────────────────────────────────────

describe("classifyInboundBody", () => {
  it("recognizes opt-out keywords in any casing or padding", () => {
    for (const body of [
      "STOP",
      "stop",
      "  Stop  ",
      "\nSTOP\n",
      "UNSUBSCRIBE",
      "unsubscribe",
      "Cancel",
      "QUIT",
      "quit",
      "StopAll",
      "stop all",
      "END",
    ]) {
      expect(classifyInboundBody(body)).toBe("stop");
    }
  });

  it("recognizes opt-in keywords", () => {
    for (const body of ["START", "start", " Start ", "UNSTOP", "unstop", "YES", "yes"]) {
      expect(classifyInboundBody(body)).toBe("start");
    }
  });

  it("treats a keyword inside a sentence as an ordinary message", () => {
    for (const body of [
      "Stop by the open house tomorrow?",
      "Can we cancel our tour?",
      "yes please, what time is orientation",
      "I want to quit the waitlist",
      "STOPPING BY LATER",
    ]) {
      expect(classifyInboundBody(body)).toBe("message");
    }
  });

  it("treats an empty body as an ordinary message", () => {
    expect(classifyInboundBody("")).toBe("message");
    expect(classifyInboundBody("   ")).toBe("message");
  });
});

// ─── Phone matching ───────────────────────────────────────────────────────────

describe("phoneDigits10", () => {
  it("reduces every stored format to the same 10 digits", () => {
    for (const raw of [
      "+15555550100",
      "15555550100",
      "5555550100",
      "(555) 555-0100",
      "555-555-0100",
      "555.555.0100",
      "1 (555) 555-0100",
    ]) {
      expect(phoneDigits10(raw)).toBe("5555550100");
    }
  });

  it("returns null for anything that cannot be a 10-digit number", () => {
    expect(phoneDigits10("555-0100")).toBeNull();
    expect(phoneDigits10("")).toBeNull();
    expect(phoneDigits10(null)).toBeNull();
    expect(phoneDigits10(undefined)).toBeNull();
  });
});

describe("phoneVariants", () => {
  it("covers the formats families and staff actually type", () => {
    const variants = phoneVariants("5555550100");
    for (const expected of [
      "5555550100",
      "+15555550100",
      "(555) 555-0100",
      "555-555-0100",
      "555.555.0100",
    ]) {
      expect(variants).toContain(expected);
    }
  });
});

// ─── handleInboundSms ─────────────────────────────────────────────────────────

const FROM = "+15555550100";
const GUARDIAN = { id: "g-1", first_name: "Dana", last_name: "Reyes", phone: "(555) 555-0100" };
const LEAD = {
  id: "l-1",
  first_name: "Sam",
  last_name: "Okafor",
  phone: "555.555.0100",
  campus_id: "campus-1",
};

describe("handleInboundSms — matching", () => {
  it("matches a guardian whose phone is stored in a different format", async () => {
    supabaseMock.queueResult("inbound_sms", { data: null, error: null }); // dedupe: not seen
    queuePhoneLookup("guardian", [GUARDIAN], null);
    queuePhoneLookup("lead", [], []);
    supabaseMock.queueResult("application", {
      data: { id: "app-1", campus_id: "campus-1" },
      error: null,
    });
    supabaseMock.queueResult("inbound_sms", { data: null, error: null }); // insert ok
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });

    const outcome = await handleInboundSms({
      from: FROM,
      body: "What time does orientation start?",
      messageSid: "SM1",
    });

    expect(outcome).toMatchObject({ intent: "message", matched: "guardian", stored: true, notified: true });
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserIds: ["u-1"],
        campusId: "campus-1",
        channel: "in_app",
        subject: "Text reply from Dana Reyes",
        body: "What time does orientation start?",
        link: "/staff/applications/app-1",
      })
    );
  });

  it("falls back to a suffix scan and compares the true last 10 digits", async () => {
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    // Exact-format pass misses; the scan returns a decoy sharing the last four
    // digits plus the real match in an unanticipated format.
    queuePhoneLookup(
      "guardian",
      [],
      [
        { id: "g-decoy", first_name: "Wrong", last_name: "Person", phone: "555-999-0100" },
        { id: "g-1", first_name: "Dana", last_name: "Reyes", phone: "+1 555 555 0100" },
      ]
    );
    queuePhoneLookup("lead", [], []);
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });

    const outcome = await handleInboundSms({ from: FROM, body: "Hello", messageSid: "SM2" });

    expect(outcome.matched).toBe("guardian");
    const insert = supabaseMock.writes("inbound_sms")[0];
    expect(insert.payload).toMatchObject({ matched_guardian_id: "g-1" });
  });

  it("falls through to a lead when no guardian matches", async () => {
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    queuePhoneLookup("guardian", [], []);
    queuePhoneLookup("lead", [LEAD], null);
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-2" }], error: null });

    const outcome = await handleInboundSms({ from: FROM, body: "Is there a tour?", messageSid: "SM3" });

    expect(outcome.matched).toBe("lead");
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Text reply from Sam Okafor",
        link: "/staff/recruitment/l-1",
        campusId: "campus-1",
      })
    );
    // No application lookup is performed for a lead.
    expect(supabaseMock.ops.some((o) => o.table === "application")).toBe(false);
  });

  it("notifies nobody for an unrecognized number", async () => {
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    queuePhoneLookup("guardian", [], []);
    queuePhoneLookup("lead", [], []);
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });

    const outcome = await handleInboundSms({ from: FROM, body: "wrong number", messageSid: "SM4" });

    expect(outcome).toMatchObject({ matched: "none", notified: false });
    expect(sendNotificationMock).not.toHaveBeenCalled();
    // The message is still recorded, unattributed, rather than dropped.
    expect(supabaseMock.writes("inbound_sms")[0].payload).toMatchObject({
      matched_guardian_id: null,
      matched_lead_id: null,
      campus_id: null,
    });
  });

  it("truncates the notification body to 160 characters", async () => {
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    queuePhoneLookup("guardian", [GUARDIAN], null);
    queuePhoneLookup("lead", [], []);
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });

    await handleInboundSms({ from: FROM, body: "x".repeat(400), messageSid: "SM5" });

    const call = sendNotificationMock.mock.calls[0][0] as { body: string };
    expect(call.body).toHaveLength(160);
    // The full body is still what gets stored.
    expect((supabaseMock.writes("inbound_sms")[0].payload as { body: string }).body).toHaveLength(400);
  });

  it("ignores a From value that cannot be a phone number", async () => {
    const outcome = await handleInboundSms({ from: "unknown", body: "hi", messageSid: "SM6" });
    expect(outcome.intent).toBe("unusable");
    expect(supabaseMock.ops).toHaveLength(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});

describe("handleInboundSms — consent", () => {
  it("clears sms_consent on every matched guardian and lead on STOP", async () => {
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    queuePhoneLookup("guardian", [GUARDIAN, { ...GUARDIAN, id: "g-2" }], null);
    queuePhoneLookup("lead", [LEAD], null);
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("guardian", { data: null, error: null }); // consent update
    supabaseMock.queueResult("lead", { data: null, error: null }); // consent update
    supabaseMock.queueResult("lead_activity", { data: null, error: null });
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });

    const outcome = await handleInboundSms({ from: FROM, body: " StOp ", messageSid: "SM7" });

    expect(outcome.intent).toBe("stop");

    const guardianUpdate = supabaseMock.writes("guardian")[0];
    expect(guardianUpdate.payload).toEqual({ sms_consent: false });
    expect(guardianUpdate.filters).toContainEqual({ method: "in", args: ["id", ["g-1", "g-2"]] });

    const leadUpdate = supabaseMock.writes("lead")[0];
    expect(leadUpdate.payload).toEqual({ sms_consent: false });
    expect(leadUpdate.filters).toContainEqual({ method: "in", args: ["id", ["l-1"]] });

    // The opt-out lands on the lead timeline, not only in a boolean column.
    const activity = supabaseMock.writes("lead_activity")[0];
    expect(activity.payload).toEqual([
      expect.objectContaining({ lead_id: "l-1", activity_type: "sms" }),
    ]);

    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Text opt-out from Dana Reyes" })
    );
  });

  it("restores sms_consent on START", async () => {
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    queuePhoneLookup("guardian", [GUARDIAN], null);
    queuePhoneLookup("lead", [], []);
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("guardian", { data: null, error: null });
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });

    const outcome = await handleInboundSms({ from: FROM, body: "start", messageSid: "SM8" });

    expect(outcome.intent).toBe("start");
    expect(supabaseMock.writes("guardian")[0].payload).toEqual({ sms_consent: true });
  });

  it("does not touch consent for an ordinary message", async () => {
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    queuePhoneLookup("guardian", [GUARDIAN], null);
    queuePhoneLookup("lead", [], []);
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });

    await handleInboundSms({ from: FROM, body: "Please stop sending the wrong times", messageSid: "SM9" });

    expect(supabaseMock.writes("guardian")).toHaveLength(0);
    expect(supabaseMock.writes("lead")).toHaveLength(0);
  });
});

describe("handleInboundSms — resilience", () => {
  it("skips a MessageSid it has already recorded", async () => {
    supabaseMock.queueResult("inbound_sms", { data: { id: "existing" }, error: null });

    const outcome = await handleInboundSms({ from: FROM, body: "Hello again", messageSid: "SM10" });

    expect(outcome.duplicate).toBe(true);
    expect(supabaseMock.writes()).toHaveLength(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("still notifies staff with the message when the inbound_sms table is absent", async () => {
    supabaseMock.queueResult("inbound_sms", { data: null, error: MISSING_TABLE });
    queuePhoneLookup("guardian", [GUARDIAN], null);
    queuePhoneLookup("lead", [], []);
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });

    const outcome = await handleInboundSms({ from: FROM, body: "Are tours still open?", messageSid: "SM11" });

    expect(outcome).toMatchObject({ stored: false, notified: true, matched: "guardian" });
    // No insert is attempted once the relation is known to be missing.
    expect(supabaseMock.writes("inbound_sms")).toHaveLength(0);
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: "Are tours still open?" })
    );
  });

  it("does not notify when the campus has no staff assigned", async () => {
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    queuePhoneLookup("guardian", [GUARDIAN], null);
    queuePhoneLookup("lead", [], []);
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("inbound_sms", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [], error: null });

    const outcome = await handleInboundSms({ from: FROM, body: "Hi", messageSid: "SM12" });

    expect(outcome.notified).toBe(false);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("returns a safe outcome instead of throwing when the client blows up", async () => {
    const saved = holder.client;
    holder.client = {
      serviceClient: () => {
        throw new Error("connection refused");
      },
    };
    try {
      const outcome = await handleInboundSms({ from: FROM, body: "Hi", messageSid: "SM13" });
      expect(outcome).toMatchObject({ intent: "unusable", notified: false, stored: false });
    } finally {
      holder.client = saved;
    }
  });
});
