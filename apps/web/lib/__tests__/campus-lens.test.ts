import { describe, it, expect, vi } from "vitest";
import type { AuthSession } from "@rooted-ems/types";

// campus-lens.ts reads the lens cookie via next/headers' cookies(), which
// only resolves inside a real Next.js request context. Stub it with an
// in-memory value the tests set directly — same "mock the platform
// boundary, test the pure logic" approach as lib/__tests__/campus-authz.test.ts.
let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "staff-campus-lens" && cookieValue !== undefined ? { value: cookieValue } : undefined,
  }),
}));

// get-session.ts wraps getSession() in React's cache() for RSC de-duping,
// which has no meaningful behavior outside an actual render — stub to
// identity, same as campus-authz.test.ts.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, cache: <T,>(fn: T) => fn };
});

vi.mock("@rooted-ems/database/server", () => ({
  createServerClient: async () => ({}),
}));

const { getCampusLens, getCampusLensId } = await import("@/lib/campus-lens");
const { resolveActiveCampus } = await import("@/lib/auth/get-session");

function session(campusRoles: Record<string, string[]>): AuthSession {
  return {
    user_id: "u1",
    email: "u1@example.com",
    phone: null,
    is_staff: true,
    campus_roles: campusRoles as AuthSession["campus_roles"],
  };
}

const RSV = { id: "campus-rsv", short_code: "RSV" };
const CRN = { id: "campus-crn", short_code: "CRN" };
const RSC = { id: "campus-rsc", short_code: "RSC" };
const UNKNOWN = { id: "campus-unknown", short_code: "ZZZ" };

describe("resolveActiveCampus — campus lens fallback", () => {
  it("single-campus staff always get their own campus, lens and explicit selection ignored", () => {
    const s = session({ [RSC.id]: ["system_admin"] });
    expect(resolveActiveCampus(s, undefined, CRN.id)).toBe(RSC.id);
    expect(resolveActiveCampus(s, CRN.id, CRN.id)).toBe(RSC.id);
  });

  it("an explicit ?campus= selection wins over the lens", () => {
    const s = session({ [RSV.id]: ["system_admin"], [CRN.id]: ["system_admin"] });
    expect(resolveActiveCampus(s, RSV.id, CRN.id)).toBe(RSV.id);
  });

  it("no explicit selection: the lens becomes the default", () => {
    const s = session({ [RSV.id]: ["system_admin"], [CRN.id]: ["system_admin"] });
    expect(resolveActiveCampus(s, undefined, CRN.id)).toBe(CRN.id);
  });

  it("a lens campus outside the caller's accessible list is ignored (never widens scope)", () => {
    const s = session({ [RSV.id]: ["system_admin"], [CRN.id]: ["system_admin"] });
    expect(resolveActiveCampus(s, undefined, RSC.id)).toBeUndefined();
  });

  it("org-wide staff (empty accessible list) accept the lens unchecked, same as an explicit selection", () => {
    const s = session({});
    expect(resolveActiveCampus(s, undefined, RSC.id)).toBe(RSC.id);
  });

  it("no selection and no lens: All campuses", () => {
    const s = session({ [RSV.id]: ["system_admin"], [CRN.id]: ["system_admin"] });
    expect(resolveActiveCampus(s, undefined, undefined)).toBeUndefined();
    expect(resolveActiveCampus(s, undefined, null)).toBeUndefined();
  });
});

describe("getCampusLensId", () => {
  it("single-campus staff: returns their one campus regardless of cookie", async () => {
    cookieValue = CRN.id;
    expect(await getCampusLensId([RSC.id])).toBe(RSC.id);
  });

  it("multi-campus: returns the raw cookie value unvalidated (resolveActiveCampus validates it)", async () => {
    cookieValue = CRN.id;
    expect(await getCampusLensId([RSV.id, CRN.id])).toBe(CRN.id);
  });

  it("no cookie set: null", async () => {
    cookieValue = undefined;
    expect(await getCampusLensId([RSV.id, CRN.id])).toBeNull();
  });
});

describe("getCampusLens", () => {
  it("single-campus staff: always resolves to their one campus's identity, cookie or not", async () => {
    cookieValue = undefined;
    const lens = await getCampusLens([RSC]);
    expect(lens?.campusId).toBe(RSC.id);
    expect(lens?.shortCode).toBe("RSC");
  });

  it("multi-campus, no cookie: null (All campuses)", async () => {
    cookieValue = undefined;
    expect(await getCampusLens([RSV, CRN, RSC])).toBeNull();
  });

  it("multi-campus, cookie matches an accessible campus: resolves that campus's identity", async () => {
    cookieValue = CRN.id;
    const lens = await getCampusLens([RSV, CRN, RSC]);
    expect(lens?.campusId).toBe(CRN.id);
    expect(lens?.shortCode).toBe("CRN");
    expect(lens?.identity.displayName).toBe("C.R. Neal Academy");
  });

  it("cookie points at a campus outside the accessible list: degrades to null, not a leak", async () => {
    cookieValue = "some-other-campus-id";
    expect(await getCampusLens([RSV, CRN])).toBeNull();
  });

  it("cookie matches an accessible campus with a short_code this module doesn't know: degrades to null", async () => {
    cookieValue = UNKNOWN.id;
    expect(await getCampusLens([RSV, UNKNOWN])).toBeNull();
  });
});
