/**
 * lottery_policy is under concurrent construction on another branch and may
 * not exist yet in any given environment. getNetworkOverview must degrade
 * that one cell to an honest "Not available yet" — never a crashed page,
 * never a fabricated "none" — while every other column still computes.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { supabaseMock } from "./helpers/supabase-mock";

vi.mock("@rooted-ems/database/server", () => ({
  createServiceRoleClient: () => supabaseMock.serviceClient(),
}));

const { getNetworkOverview } = await import("@/lib/queries/network");

beforeEach(() => {
  supabaseMock.reset();
});

/** Queue the minimal empty-but-successful result set every sub-fetch needs. */
function queueBaseline() {
  supabaseMock.queueResult("campus", { data: [{ id: "campus-a", name: "Campus A" }], error: null });
  supabaseMock.queueResult("school_year", { data: null, error: null });
  supabaseMock.queueResult("lead", { data: [], error: null });
  supabaseMock.queueResult("lead_activity", { data: [], error: null });
  supabaseMock.queueResult("application", { data: [], error: null });
  supabaseMock.queueResult("enrollment_window", { data: [], error: null });
  supabaseMock.queueResult("capacity_plan", { data: [], error: null });
  supabaseMock.queueResult("event", { data: [], error: null });
  // getAutomationHealth() -> getCronHeartbeats() -> setting table.
  supabaseMock.queueResult("setting", { data: [], error: null });
}

describe("getNetworkOverview — lottery_policy degradation", () => {
  it('renders "Not available yet" when lottery_policy does not exist (42P01)', async () => {
    queueBaseline();
    supabaseMock.queueResult("lottery_policy", {
      data: null,
      error: { message: 'relation "public.lottery_policy" does not exist', code: "42P01" },
    });

    const overview = await getNetworkOverview();

    expect(overview.rows).toHaveLength(1);
    expect(overview.rows[0].policy_status.kind).toBe("unavailable");
    expect(overview.rows[0].policy_status.label).toBe("Not available yet");
    expect(overview.rows[0].policy_status.amber).toBe(false);
  });

  it('renders "Not available yet" on a PostgREST schema-cache miss too', async () => {
    queueBaseline();
    supabaseMock.queueResult("lottery_policy", {
      data: null,
      error: { message: "Could not find the table 'public.lottery_policy' in the schema cache", code: "PGRST205" },
    });

    const overview = await getNetworkOverview();

    expect(overview.rows[0].policy_status.kind).toBe("unavailable");
  });

  it('reports "none" (not "unavailable") when the table exists but has no rows for the campus', async () => {
    queueBaseline();
    supabaseMock.queueResult("lottery_policy", { data: [], error: null });

    const overview = await getNetworkOverview();

    expect(overview.rows[0].policy_status.kind).toBe("none");
    expect(overview.rows[0].policy_status.label).toBe("No policy on file");
  });

  it("prefers the adopted row over any draft/superseded rows for the same campus", async () => {
    queueBaseline();
    supabaseMock.queueResult("lottery_policy", {
      data: [
        { campus_id: "campus-a", version: 1, status: "superseded", adopted_date: "2023-01-25" },
        { campus_id: "campus-a", version: 2, status: "adopted", adopted_date: "2024-08-20" },
        { campus_id: "campus-a", version: 3, status: "draft", adopted_date: null },
      ],
      error: null,
    });

    const overview = await getNetworkOverview();

    expect(overview.rows[0].policy_status.kind).toBe("adopted");
    expect(overview.rows[0].policy_status.version).toBe("2");
    expect(overview.rows[0].policy_status.amber).toBe(false);
  });

  it("reports the highest-version draft when no row is adopted", async () => {
    queueBaseline();
    supabaseMock.queueResult("lottery_policy", {
      data: [
        { campus_id: "campus-a", version: 1, status: "draft", adopted_date: null },
        { campus_id: "campus-a", version: 2, status: "draft", adopted_date: null },
      ],
      error: null,
    });

    const overview = await getNetworkOverview();

    expect(overview.rows[0].policy_status.kind).toBe("draft");
    expect(overview.rows[0].policy_status.version).toBe("2");
  });

  it("never crashes the page when lottery_policy is missing — other columns still compute", async () => {
    queueBaseline();
    supabaseMock.queueResult("lottery_policy", {
      data: null,
      error: { message: "does not exist", code: "42P01" },
    });

    const overview = await getNetworkOverview();

    const row = overview.rows[0];
    expect(row.leads_total).toBe(0);
    expect(row.contacts_7d).toBe(0);
    expect(row.apps_total).toBe(0);
    expect(overview.automation.ok).toBe(true);
  });
});
