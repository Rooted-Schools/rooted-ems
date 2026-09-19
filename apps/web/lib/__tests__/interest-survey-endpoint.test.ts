import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { supabaseMock } from "./helpers/supabase-mock";

/**
 * Hardening for the public, unauthenticated interest-survey endpoint
 * (app/(public)/interest). Three properties matter here, and each has its
 * own describe block below:
 *
 *  1. The GET page (page.tsx) never writes to the database — an email
 *     security gateway (Microsoft Safe Links, Proofpoint, Barracuda, etc.)
 *     prefetches every link in an inbound email, and a write-on-GET would
 *     let that prefetch fabricate a survey answer for a family that never
 *     clicked anything.
 *  2. The only write path (confirmInterestChoice, a real POST) never
 *     reveals whether a token maps to a real lead: same redirect either
 *     way, and page.tsx renders the same confirmation UI regardless.
 *  3. Both write paths are rate-limited (LG-0.4 style) and log a failed
 *     update on a KNOWN, valid lead — while staying silent on an unknown
 *     token, which is the anti-enumeration design, not a bug.
 */

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    // next/navigation's real redirect() aborts rendering by throwing; tests
    // catch this to inspect where the action tried to send the browser.
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const { checkRateLimitMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(async () => ({ allowed: true })),
}));

vi.mock("@rooted-ems/database/server", async () => {
  const { supabaseMock } = await import("./helpers/supabase-mock");
  return {
    createServerClient: async () => supabaseMock.authClient(),
    createServiceRoleClient: () => supabaseMock.serviceClient(),
  };
});

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: checkRateLimitMock }));

// page.tsx reads `headers()` directly, and lib/i18n/get-locale.ts (imported
// by page.tsx) reads `cookies()` — both live in "next/headers". No cookie,
// English Accept-Language: locale resolves deterministically to "en" so
// tests don't have to deal with the both-languages fallback render.
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map([["accept-language", "en-US,en;q=0.9"]])),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

beforeEach(() => {
  supabaseMock.reset();
  redirectMock.mockClear();
  checkRateLimitMock.mockClear();
  checkRateLimitMock.mockResolvedValue({ allowed: true });
});

const VALID_TOKEN = "11111111-1111-1111-1111-111111111111";
const CHOICE = "career_connected";

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function callAndCaptureRedirect(fn: () => Promise<void>): Promise<string> {
  await expect(fn()).rejects.toThrow(/^REDIRECT:/);
  const call = redirectMock.mock.calls.at(-1);
  if (!call) throw new Error("redirect() was never called");
  return call[0] as string;
}

// ─── Structural helpers for inspecting the RSC's returned element tree ─────
// InterestPage is an async Server Component: calling it directly returns a
// plain React element tree (nested `{ type, props }` objects) without
// rendering to a DOM or invoking any Next.js runtime (next/link, etc. are
// never actually called — only referenced). Walking that tree lets us
// assert on visible text and on which server action a <form> posts to,
// without needing a browser or Next's App Router context.

function isReactElement(node: unknown): node is ReactElement {
  return !!node && typeof node === "object" && "props" in (node as Record<string, unknown>);
}

function collectText(node: ReactNode, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  if (isReactElement(node)) {
    collectText((node.props as { children?: ReactNode }).children, out);
  }
  return out;
}

function findElements(
  node: ReactNode,
  predicate: (el: ReactElement) => boolean,
  out: ReactElement[] = []
): ReactElement[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, predicate, out);
    return out;
  }
  if (isReactElement(node)) {
    if (predicate(node)) out.push(node);
    findElements((node.props as { children?: ReactNode }).children, predicate, out);
  }
  return out;
}

async function renderInterestPage(searchParams: {
  t?: string;
  c?: string;
  confirmed?: string;
  saved?: string;
}) {
  const { default: InterestPage } = await import("../../app/(public)/interest/page");
  return InterestPage({ searchParams });
}

describe("GET /interest — no write on a bare page load (Defect 1)", () => {
  it("performs zero database operations when landing with a valid-looking token + choice", async () => {
    await renderInterestPage({ t: VALID_TOKEN, c: CHOICE });
    expect(supabaseMock.ops).toHaveLength(0);
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("performs zero database operations for an unknown/malformed token too", async () => {
    await renderInterestPage({ t: "not-a-real-token-at-all", c: CHOICE });
    expect(supabaseMock.ops).toHaveLength(0);
    expect(supabaseMock.writes()).toHaveLength(0);
  });

  it("shows the one-click confirm screen, not the thanks screen, before any POST", async () => {
    const el = await renderInterestPage({ t: VALID_TOKEN, c: CHOICE });
    const text = collectText(el).join(" ");
    expect(text).toContain("One more click to confirm");
    expect(text).toContain("Career-connected learning woven throughout their education");
    expect(text).toContain("Yes, that's my answer");
    expect(text).not.toContain("Thanks for sharing!");
  });

  it("posts the confirm form to confirmInterestChoice via a plain <form>, no onClick handler", async () => {
    const { confirmInterestChoice } = await import("../../app/(public)/interest/actions");
    const el = await renderInterestPage({ t: VALID_TOKEN, c: CHOICE });
    const forms = findElements(el, (n) => n.type === "form");
    expect(forms).toHaveLength(1);
    expect(forms[0]!.props.action).toBe(confirmInterestChoice);
    // No client-side click handler anywhere in the tree — must work with JS off.
    const clickable = findElements(el, (n) => Boolean((n.props as Record<string, unknown>).onClick));
    expect(clickable).toHaveLength(0);
  });
});

describe("GET /interest — no existence oracle", () => {
  it("renders identical visible text for a valid-looking token and a bogus one (same choice)", async () => {
    const known = await renderInterestPage({ t: VALID_TOKEN, c: CHOICE });
    const unknown = await renderInterestPage({ t: "zzzzzzzz-not-a-uuid", c: CHOICE });
    expect(collectText(known).join("|")).toEqual(collectText(unknown).join("|"));
  });

  it("renders identical visible text with no token at all vs. a well-formed one", async () => {
    const noToken = await renderInterestPage({ c: CHOICE });
    const withToken = await renderInterestPage({ t: VALID_TOKEN, c: CHOICE });
    expect(collectText(noToken).join("|")).toEqual(collectText(withToken).join("|"));
  });

  it("shows the picker (not confirm/thanks) when the choice is missing or unrecognized, regardless of token", async () => {
    const el = await renderInterestPage({ t: VALID_TOKEN, c: "not_a_real_choice" });
    const text = collectText(el).join(" ");
    expect(text).toContain("What matters most to your family?");
    expect(text).not.toContain("One more click to confirm");
  });
});

describe("POST confirmInterestChoice — the only write path (Defect 1 fix)", () => {
  it("writes interest_focus for a known token + valid choice, then redirects to the confirmed thanks screen", async () => {
    const { confirmInterestChoice } = await import("../../app/(public)/interest/actions");
    supabaseMock.queueResult("lead", { data: { id: "lead-1" }, error: null });

    const location = await callAndCaptureRedirect(() =>
      confirmInterestChoice(makeFormData({ t: VALID_TOKEN, c: CHOICE }))
    );

    const writes = supabaseMock.writes("lead");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.op).toBe("update");
    expect(writes[0]!.payload).toMatchObject({ interest_focus: CHOICE });
    expect(location).toBe(`/interest?t=${VALID_TOKEN}&c=${CHOICE}&confirmed=1`);
  });

  it("clears a stale 'other' note when the family switches away from 'other'", async () => {
    const { confirmInterestChoice } = await import("../../app/(public)/interest/actions");
    supabaseMock.queueResult("lead", { data: { id: "lead-1" }, error: null });

    await callAndCaptureRedirect(() =>
      confirmInterestChoice(makeFormData({ t: VALID_TOKEN, c: "financial_literacy" }))
    );

    const writes = supabaseMock.writes("lead");
    expect(writes[0]!.payload).toMatchObject({ interest_focus_other: null });
  });

  it("does NOT clear the note when re-confirming 'other' itself", async () => {
    const { confirmInterestChoice } = await import("../../app/(public)/interest/actions");
    supabaseMock.queueResult("lead", { data: { id: "lead-1" }, error: null });

    await callAndCaptureRedirect(() => confirmInterestChoice(makeFormData({ t: VALID_TOKEN, c: "other" })));

    const writes = supabaseMock.writes("lead");
    expect(writes[0]!.payload).not.toHaveProperty("interest_focus_other");
  });

  it("silently no-ops for an unknown token but redirects exactly like a known one (anti-enumeration)", async () => {
    const { confirmInterestChoice } = await import("../../app/(public)/interest/actions");
    // No queued result -> the mock's select resolves { data: null }, i.e. "no lead found".

    const location = await callAndCaptureRedirect(() =>
      confirmInterestChoice(makeFormData({ t: VALID_TOKEN, c: CHOICE }))
    );

    expect(supabaseMock.writes("lead")).toHaveLength(0);
    expect(location).toBe(`/interest?t=${VALID_TOKEN}&c=${CHOICE}&confirmed=1`);
  });

  it("silently no-ops and skips the DB entirely for a malformed token, same redirect shape", async () => {
    const { confirmInterestChoice } = await import("../../app/(public)/interest/actions");

    const location = await callAndCaptureRedirect(() =>
      confirmInterestChoice(makeFormData({ t: "not-a-uuid", c: CHOICE }))
    );

    expect(supabaseMock.ops).toHaveLength(0);
    expect(location).toBe(`/interest?t=not-a-uuid&c=${CHOICE}&confirmed=1`);
  });

  it("ignores an unrecognized choice value (never writes it)", async () => {
    const { confirmInterestChoice } = await import("../../app/(public)/interest/actions");
    supabaseMock.queueResult("lead", { data: { id: "lead-1" }, error: null });

    await callAndCaptureRedirect(() =>
      confirmInterestChoice(makeFormData({ t: VALID_TOKEN, c: "not_a_real_choice" }))
    );

    expect(supabaseMock.writes("lead")).toHaveLength(0);
  });
});

describe("Rate limiting (Defect 2)", () => {
  it("confirmInterestChoice calls checkRateLimit with a dedicated endpoint key and a generous limit", async () => {
    const { confirmInterestChoice } = await import("../../app/(public)/interest/actions");
    supabaseMock.queueResult("lead", { data: { id: "lead-1" }, error: null });

    await callAndCaptureRedirect(() => confirmInterestChoice(makeFormData({ t: VALID_TOKEN, c: CHOICE })));

    expect(checkRateLimitMock).toHaveBeenCalledWith("interest-survey-confirm", 10, 60);
  });

  it("submitInterestDetails calls checkRateLimit with its own endpoint key", async () => {
    const { submitInterestDetails } = await import("../../app/(public)/interest/actions");
    supabaseMock.queueResult("lead", { data: { id: "lead-1" }, error: null });

    await callAndCaptureRedirect(() =>
      submitInterestDetails(makeFormData({ t: VALID_TOKEN, c: CHOICE, studentFirstName: "Maya" }))
    );

    expect(checkRateLimitMock).toHaveBeenCalledWith("interest-survey-details", 10, 60);
  });

  it("skips the write when throttled, but still redirects identically (never reveals the throttle)", async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false });
    const { confirmInterestChoice } = await import("../../app/(public)/interest/actions");
    supabaseMock.queueResult("lead", { data: { id: "lead-1" }, error: null });

    const location = await callAndCaptureRedirect(() =>
      confirmInterestChoice(makeFormData({ t: VALID_TOKEN, c: CHOICE }))
    );

    expect(supabaseMock.writes("lead")).toHaveLength(0);
    expect(location).toBe(`/interest?t=${VALID_TOKEN}&c=${CHOICE}&confirmed=1`);
  });
});

describe("Silent write failures are logged, not swallowed (Defect 3)", () => {
  it("logs when the update fails for a KNOWN, valid lead", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { confirmInterestChoice } = await import("../../app/(public)/interest/actions");
    supabaseMock.queueResult(
      "lead",
      { data: { id: "lead-1" }, error: null }, // select finds the lead
      { data: null, error: { message: "constraint violation" } } // update fails
    );

    await callAndCaptureRedirect(() => confirmInterestChoice(makeFormData({ t: VALID_TOKEN, c: CHOICE })));

    expect(errorSpy).toHaveBeenCalled();
    const loggedMessages = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(loggedMessages).toContain("lead-1");
    errorSpy.mockRestore();
  });

  it("stays silent (no console.error) for the anti-enumeration unknown-token path", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { confirmInterestChoice } = await import("../../app/(public)/interest/actions");
    // No queued result -> "no lead found" for this token.

    await callAndCaptureRedirect(() => confirmInterestChoice(makeFormData({ t: VALID_TOKEN, c: CHOICE })));

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("logs when submitInterestDetails' update fails for a KNOWN, valid lead", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { submitInterestDetails } = await import("../../app/(public)/interest/actions");
    supabaseMock.queueResult(
      "lead",
      { data: { id: "lead-2" }, error: null },
      { data: null, error: { message: "connection reset" } }
    );

    await callAndCaptureRedirect(() =>
      submitInterestDetails(makeFormData({ t: VALID_TOKEN, c: CHOICE, studentFirstName: "Jordan" }))
    );

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
