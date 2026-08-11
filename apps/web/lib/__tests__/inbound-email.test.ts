/**
 * Unit tests for the inbound (two-way) email path (migration 00046).
 *
 * Mirrors apps/web/lib/__tests__/inbound-sms.test.ts — same mock shape, same
 * philosophy — adapted for email's differences from SMS:
 *
 *   1. Matching is by email address (case-insensitive, `ilike`), not phone.
 *   2. There's no STOP/START consent parsing — email has no carrier-level
 *      opt-out equivalent for this feature.
 *   3. Two new things SMS doesn't have: a loop guard (never process a
 *      "reply" that appears to come from our own sending address) and a
 *      forward step (a full copy goes to the campus's real inbox with the
 *      parent's address as the forward's Reply-To).
 *   4. Unmatched senders route to system_admins here (not silence, as with
 *      inbound-sms) — an email with nobody to notify would otherwise vanish
 *      with no human ever seeing it, since email (unlike SMS) has no
 *      "reply from a wrong number" norm.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Supabase mock ────────────────────────────────────────────────────────────
//
// Identical contract to inbound-sms.test.ts's InboundSupabaseMock: a FIFO
// result queue per table, every chain recorded, `.then` resolves a chain
// that never calls .single()/.maybeSingle() (matching how the real
// postgrest-js client resolves a plain `await supabase.from(...).select(...)`).

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

const { holder, sendNotificationMock, sendEmailMock, isOwnSendingAddressMock } = vi.hoisted(() => ({
  holder: { client: null as { serviceClient: () => unknown } | null },
  sendNotificationMock: vi.fn(),
  sendEmailMock: vi.fn(),
  isOwnSendingAddressMock: vi.fn(),
}));

const supabaseMock = new InboundSupabaseMock();
holder.client = supabaseMock;

vi.mock("@rooted-ems/database/server", () => ({
  createServiceRoleClient: () => holder.client!.serviceClient(),
}));

vi.mock("@/lib/mutations/communications", () => ({
  sendNotification: sendNotificationMock,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: sendEmailMock,
  isOwnSendingAddress: isOwnSendingAddressMock,
}));

import { handleInboundEmail } from "@/lib/inbound-email";

const MISSING_TABLE = { message: 'relation "public.inbound_email" does not exist', code: "42P01" };

beforeEach(() => {
  supabaseMock.reset();
  sendNotificationMock.mockReset();
  sendNotificationMock.mockResolvedValue({ data: { sentCount: 1 }, error: null });
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true, id: "resend-fwd-1" });
  isOwnSendingAddressMock.mockReset();
  isOwnSendingAddressMock.mockReturnValue(false);
  // Default the suite to choke-point mode (Reply-To routed through the
  // receiving address), where the campus-inbox forward is expected. The
  // campus-native test below unsets this to assert the forward is skipped.
  process.env.INBOUND_REPLY_ADDRESS = "replies@test.resend.app";
});

afterEach(() => {
  delete process.env.INBOUND_REPLY_ADDRESS;
});

const FROM = "dana@example.com";
const GUARDIAN = { id: "g-1", first_name: "Dana", last_name: "Reyes", email: "dana@example.com" };
const LEAD = { id: "l-1", first_name: "Sam", last_name: "Okafor", campus_id: "campus-1" };
const CAMPUS_EMAIL = { data: { email: "vancouver@rootedschool.org" }, error: null };

describe("handleInboundEmail — loop guard", () => {
  it("ignores a sender matching one of our own sending addresses", async () => {
    isOwnSendingAddressMock.mockReturnValue(true);

    const outcome = await handleInboundEmail({
      fromEmail: "inbound@rootedschool.org",
      subject: "Re: Application received",
      text: "hi",
      providerId: "p-loop",
    });

    expect(outcome).toMatchObject({ skipped: "own_address", matched: "none" });
    expect(supabaseMock.ops).toHaveLength(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("treats an address with no '@' as unusable and does nothing", async () => {
    const outcome = await handleInboundEmail({ fromEmail: "not-an-address", text: "hi" });
    expect(outcome.skipped).toBe("unusable_address");
    expect(supabaseMock.ops).toHaveLength(0);
  });

  it("campus-native mode (INBOUND_REPLY_ADDRESS unset): stores and notifies but never forwards", async () => {
    delete process.env.INBOUND_REPLY_ADDRESS;
    supabaseMock.queueResult("inbound_email", { data: null, error: null }); // dedupe: not seen
    supabaseMock.queueResult("guardian", { data: [GUARDIAN], error: null });
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("inbound_email", { data: null, error: null }); // insert ok
    supabaseMock.queueResult("note", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });

    const outcome = await handleInboundEmail({
      fromEmail: FROM,
      toEmail: "info@rootedschoolcle.org",
      subject: "Re: welcome",
      text: "Thanks, quick question",
      providerId: "p-native-1",
    });

    // The original already sits in the campus inbox (it forwarded the copy
    // to us) — forwarding back would duplicate every reply.
    expect(outcome).toMatchObject({ matched: "guardian", stored: true, notified: true, forwarded: false });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("handleInboundEmail — matching", () => {
  it("matches a guardian by email, notifies campus staff, and forwards to the campus inbox", async () => {
    supabaseMock.queueResult("inbound_email", { data: null, error: null }); // dedupe: not seen
    supabaseMock.queueResult("guardian", { data: [GUARDIAN], error: null });
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("inbound_email", { data: null, error: null }); // insert ok
    supabaseMock.queueResult("note", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });
    supabaseMock.queueResult("campus", CAMPUS_EMAIL);
    supabaseMock.queueResult("inbound_email", { data: null, error: null }); // forwarded_at stamp

    const outcome = await handleInboundEmail({
      fromEmail: FROM,
      toEmail: "enroll@rootedschool.org",
      subject: "Question about orientation",
      text: "What time does orientation start?",
      providerId: "p-1",
    });

    expect(outcome).toMatchObject({
      skipped: null,
      matched: "guardian",
      stored: true,
      notified: true,
      forwarded: true,
    });

    // No lead lookup once a guardian is found.
    expect(supabaseMock.ops.some((o) => o.table === "lead")).toBe(false);

    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserIds: ["u-1"],
        campusId: "campus-1",
        channel: "in_app",
        subject: "Email reply from Dana Reyes",
        link: "/staff/applications/app-1",
      })
    );

    const note = supabaseMock.writes("note")[0];
    expect(note.payload).toMatchObject({
      entity_type: "application",
      entity_id: "app-1",
      content: expect.stringContaining("Email reply: Question about orientation"),
      is_internal: true,
      created_by: null,
    });

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "vancouver@rootedschool.org",
        subject: "Fwd (family reply): Question about orientation",
        replyTo: FROM,
        preserveReplyTo: true,
      })
    );
    // The forward never carries engagement meta — it's not a tracked send.
    expect(sendEmailMock.mock.calls[0][0]).not.toHaveProperty("meta");

    const stamp = supabaseMock.writes("inbound_email").find(
      (w) => w.op === "update" && (w.payload as Record<string, unknown>).forwarded_at
    );
    expect(stamp).toBeDefined();
  });

  it("falls through to a lead when no guardian matches, and does not touch last_contact_at", async () => {
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("guardian", { data: [], error: null });
    supabaseMock.queueResult("lead", { data: [LEAD], error: null });
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-2" }], error: null });
    supabaseMock.queueResult("campus", { data: null, error: null }); // no campus inbox on file

    const outcome = await handleInboundEmail({
      fromEmail: "sam@example.com",
      subject: "Is there a tour?",
      text: "Is there a tour this week?",
      providerId: "p-2",
    });

    expect(outcome).toMatchObject({ matched: "lead", forwarded: false });
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Email reply from Sam Okafor", link: "/staff/recruitment/l-1" })
    );

    const activity = supabaseMock.writes("lead_activity")[0];
    expect(activity.payload).toMatchObject({
      lead_id: "l-1",
      activity_type: "email",
      body: expect.stringContaining("Replied by email: Is there a tour?"),
    });

    // Never touches lead.last_contact_at — a reply is the family's outreach,
    // not staff's, and must not be recorded as if staff had just contacted
    // them.
    expect(supabaseMock.writes("lead")).toHaveLength(0);
    // No forward attempted — no campus inbox on file.
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("routes an unrecognized sender to system_admins instead of dropping it silently", async () => {
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("guardian", { data: [], error: null });
    supabaseMock.queueResult("lead", { data: [], error: null });
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "admin-1" }], error: null });

    const outcome = await handleInboundEmail({
      fromEmail: "stranger@example.com",
      subject: "Hello",
      text: "wrong address maybe",
      providerId: "p-3",
    });

    expect(outcome).toMatchObject({ matched: "none", notified: true, forwarded: false });
    expect(sendNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({ link: "/staff/communications/inbound" })
    );
    // Still recorded, unattributed, rather than dropped.
    expect(supabaseMock.writes("inbound_email")[0].payload).toMatchObject({
      matched_guardian_id: null,
      matched_lead_id: null,
      campus_id: null,
    });
  });

  it("truncates body_text to 5000 chars but keeps the notification preview to 160", async () => {
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("guardian", { data: [GUARDIAN], error: null });
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("note", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });
    supabaseMock.queueResult("campus", { data: null, error: null });

    await handleInboundEmail({
      fromEmail: FROM,
      subject: "Long one",
      text: "x".repeat(9000),
      providerId: "p-4",
    });

    const insert = supabaseMock.writes("inbound_email")[0];
    expect((insert.payload as { body_text: string }).body_text).toHaveLength(5000);

    const call = sendNotificationMock.mock.calls[0][0] as { body: string };
    expect(call.body).toHaveLength(200);
  });
});

describe("handleInboundEmail — forward safety", () => {
  it("skips the forward when the campus inbox equals the parent's own address", async () => {
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("guardian", { data: [GUARDIAN], error: null });
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("note", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });
    // Weird self-send: campus inbox happens to equal the sender.
    supabaseMock.queueResult("campus", { data: { email: FROM }, error: null });

    const outcome = await handleInboundEmail({
      fromEmail: FROM,
      subject: "Odd",
      text: "hi",
      providerId: "p-5",
    });

    expect(outcome.forwarded).toBe(false);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("does not stamp forwarded_at when the forward send fails", async () => {
    sendEmailMock.mockResolvedValue({ ok: false, error: "Resend API error 500" });
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("guardian", { data: [GUARDIAN], error: null });
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("note", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });
    supabaseMock.queueResult("campus", CAMPUS_EMAIL);

    const outcome = await handleInboundEmail({ fromEmail: FROM, subject: "x", text: "hi", providerId: "p-6" });

    expect(outcome.forwarded).toBe(false);
    expect(supabaseMock.writes("inbound_email").some((w) => w.op === "update")).toBe(false);
  });
});

describe("handleInboundEmail — resilience", () => {
  it("skips a providerId it has already recorded", async () => {
    supabaseMock.queueResult("inbound_email", { data: { id: "existing" }, error: null });

    const outcome = await handleInboundEmail({ fromEmail: FROM, text: "again", providerId: "p-dupe" });

    expect(outcome.skipped).toBe("duplicate");
    expect(supabaseMock.writes()).toHaveLength(0);
    expect(sendNotificationMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("still notifies staff when the inbound_email table is absent", async () => {
    supabaseMock.queueResult("inbound_email", { data: null, error: MISSING_TABLE });
    supabaseMock.queueResult("guardian", { data: [GUARDIAN], error: null });
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("note", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [{ user_id: "u-1" }], error: null });
    supabaseMock.queueResult("campus", { data: null, error: null });

    const outcome = await handleInboundEmail({
      fromEmail: FROM,
      subject: "Are tours still open?",
      text: "Are tours still open?",
      providerId: "p-7",
    });

    expect(outcome).toMatchObject({ stored: false, notified: true, matched: "guardian" });
    // No insert is attempted once the relation is known to be missing.
    expect(supabaseMock.writes("inbound_email")).toHaveLength(0);
  });

  it("does not notify when the campus has no staff assigned", async () => {
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("guardian", { data: [GUARDIAN], error: null });
    supabaseMock.queueResult("application", { data: { id: "app-1", campus_id: "campus-1" }, error: null });
    supabaseMock.queueResult("inbound_email", { data: null, error: null });
    supabaseMock.queueResult("note", { data: null, error: null });
    supabaseMock.queueResult("user_campus_role", { data: [], error: null });
    supabaseMock.queueResult("campus", { data: null, error: null });

    const outcome = await handleInboundEmail({ fromEmail: FROM, subject: "Hi", text: "Hi", providerId: "p-8" });

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
      const outcome = await handleInboundEmail({ fromEmail: FROM, text: "Hi", providerId: "p-9" });
      expect(outcome).toMatchObject({ matched: "none", notified: false, stored: false, forwarded: false });
    } finally {
      holder.client = saved;
    }
  });
});
