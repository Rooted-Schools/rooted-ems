import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import type { NextRequest } from "next/server";

/**
 * Coverage for the 00045 open/click pipeline in the Resend webhook
 * (app/api/webhooks/resend/route.ts): delivered/opened/clicked events are
 * matched to an `email_event` row by Resend's message id, stamped
 * first-occurrence-only, counted every time, and mirrored to `lead_activity`
 * on the FIRST open/click for a send with a lead_id. Also asserts the
 * pre-existing bounce-suppression path is untouched, and that the whole
 * pipeline degrades to a plain 200 (never a 500) when `email_event` doesn't
 * exist yet — the expected state until migration 00045 is applied.
 */

type Row = Record<string, unknown>;

let emailEventRow: Row | null = null;
let emailEventError: { message: string; code?: string } | null = null;
const updateCalls: Array<{ table: string; values: Row }> = [];
const insertCalls: Array<{ table: string; values: Row }> = [];
const suppressEmailMock = vi.fn(async () => {});

vi.mock("@rooted-ems/database/server", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      let mode: "select" | "update" | "insert" = "select";
      let pendingValues: Row = {};

      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.ilike = chain;
      builder.update = (values: Row) => {
        mode = "update";
        pendingValues = values;
        return builder;
      };
      builder.insert = (values: Row) => {
        mode = "insert";
        pendingValues = values;
        return builder;
      };
      builder.maybeSingle = async () => {
        if (table === "email_event") return { data: emailEventRow, error: emailEventError };
        return { data: null, error: null };
      };
      builder.then = (resolve: (v: unknown) => unknown) => {
        if (mode === "update") {
          updateCalls.push({ table, values: pendingValues });
          return resolve({ data: null, error: null });
        }
        if (mode === "insert") {
          insertCalls.push({ table, values: pendingValues });
          return resolve({ data: null, error: null });
        }
        return resolve({ data: null, error: null });
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/email-compliance", () => ({
  suppressEmail: suppressEmailMock,
}));

const { POST } = await import("../../app/api/webhooks/resend/route");

const SECRET_RAW = crypto.randomBytes(32);
const WEBHOOK_SECRET = `whsec_${SECRET_RAW.toString("base64")}`;

function signedRequest(body: Record<string, unknown>): NextRequest {
  const payload = JSON.stringify(body);
  const id = "msg_test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signedContent = `${id}.${timestamp}.${payload}`;
  const sig = crypto.createHmac("sha256", SECRET_RAW).update(signedContent).digest("base64");

  const headers = new Map<string, string>([
    ["svix-id", id],
    ["svix-timestamp", timestamp],
    ["svix-signature", `v1,${sig}`],
  ]);

  return {
    headers: { get: (name: string) => headers.get(name) ?? null },
    text: async () => payload,
  } as unknown as NextRequest;
}

beforeEach(() => {
  emailEventRow = null;
  emailEventError = null;
  updateCalls.length = 0;
  insertCalls.length = 0;
  suppressEmailMock.mockClear();
  process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
});

describe("resend webhook — 00045 engagement tracking", () => {
  it("stamps opened_at, increments open_count, and logs the first open to lead_activity", async () => {
    emailEventRow = {
      id: "evt-1",
      lead_id: "lead-1",
      subject: "Come see the campus",
      delivered_at: null,
      opened_at: null,
      clicked_at: null,
      open_count: 0,
      click_count: 0,
    };

    const res = await POST(
      signedRequest({ type: "email.opened", data: { to: ["family@example.com"], email_id: "resend-1" } })
    );
    expect(res.status).toBe(200);

    const eventUpdate = updateCalls.find((c) => c.table === "email_event");
    expect(eventUpdate?.values).toMatchObject({ opened_at: expect.any(String), open_count: 1 });

    const activityInsert = insertCalls.find((c) => c.table === "lead_activity");
    expect(activityInsert?.values).toMatchObject({ lead_id: "lead-1", body: "Opened: Come see the campus" });
  });

  it("does not re-log lead_activity on a second open of the same send (still counts it)", async () => {
    emailEventRow = {
      id: "evt-1",
      lead_id: "lead-1",
      subject: "Come see the campus",
      delivered_at: null,
      opened_at: "2026-08-01T00:00:00.000Z",
      clicked_at: null,
      open_count: 1,
      click_count: 0,
    };

    const res = await POST(
      signedRequest({ type: "email.opened", data: { to: ["family@example.com"], email_id: "resend-1" } })
    );
    expect(res.status).toBe(200);

    const eventUpdate = updateCalls.find((c) => c.table === "email_event");
    expect(eventUpdate?.values).toMatchObject({ open_count: 2 });
    expect(eventUpdate?.values).not.toHaveProperty("opened_at");

    expect(insertCalls.filter((c) => c.table === "lead_activity")).toHaveLength(0);
  });

  it("stamps clicked_at and logs 'Clicked' on the first click", async () => {
    emailEventRow = {
      id: "evt-2",
      lead_id: "lead-2",
      subject: "Apply now",
      delivered_at: null,
      opened_at: "2026-08-01T00:00:00.000Z",
      clicked_at: null,
      open_count: 1,
      click_count: 0,
    };

    const res = await POST(
      signedRequest({ type: "email.clicked", data: { to: ["family@example.com"], email_id: "resend-2" } })
    );
    expect(res.status).toBe(200);

    const activityInsert = insertCalls.find((c) => c.table === "lead_activity");
    expect(activityInsert?.values).toMatchObject({ lead_id: "lead-2", body: "Clicked: Apply now" });
  });

  it("ignores an unknown resend id with a plain 200 — never a 500", async () => {
    emailEventRow = null;
    emailEventError = null;

    const res = await POST(
      signedRequest({ type: "email.opened", data: { to: ["family@example.com"], email_id: "unknown-id" } })
    );
    expect(res.status).toBe(200);
    expect(updateCalls.filter((c) => c.table === "email_event")).toHaveLength(0);
    expect(insertCalls.filter((c) => c.table === "lead_activity")).toHaveLength(0);
  });

  it("degrades to a plain 200 when email_event doesn't exist yet (migration 00045 not applied)", async () => {
    emailEventRow = null;
    emailEventError = { message: 'relation "public.email_event" does not exist', code: "42P01" };

    const res = await POST(
      signedRequest({ type: "email.clicked", data: { to: ["family@example.com"], email_id: "resend-3" } })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(updateCalls.filter((c) => c.table === "email_event")).toHaveLength(0);
  });

  it("leaves bounce suppression untouched", async () => {
    const res = await POST(
      signedRequest({
        type: "email.bounced",
        data: { to: ["dead@example.com"], bounce: { subType: "General" } },
      })
    );
    expect(res.status).toBe(200);
    expect(suppressEmailMock).toHaveBeenCalledWith("dead@example.com", "bounce", "General");
  });
});
