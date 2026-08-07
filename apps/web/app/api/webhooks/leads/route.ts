import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { createLeadFromInquiry } from "@/lib/mutations";

/**
 * Ad lead ingestion webhook (LG-3).
 *
 * Meta Lead Ads and Google Lead Form ads deliver leads via webhook. Both
 * platforms (and the relays like Zapier/Make that schools commonly use)
 * can POST a normalized JSON body here; the lead lands in the pipeline with
 * source=ad and the full response engine fires — same as a website inquiry.
 *
 * Auth: a shared secret matched against LEAD_WEBHOOK_SECRET (fail-closed
 * without it), sent either as `Authorization: Bearer <secret>` (preferred —
 * a query param lands in access logs, proxy caches, and referrers) or as the
 * legacy `?token=` query param, still accepted so already-configured relays
 * keep working. Comparison is constant-time. Meta's subscription
 * verification handshake (GET with hub.challenge) is answered below.
 *
 * Campus resolution: the ad's hidden `campus` field carries a short_code
 * (CRN / RSC / RSV). Unknown/missing campus is rejected loudly rather than
 * dropped into the wrong pipeline.
 *
 * NOTE: Meta's native webhook posts only a leadgen_id; fetching the field
 * values needs a Graph API call with a page token. Point Meta at a relay
 * that does that fetch and forwards normalized JSON here, or extend this
 * route with the Graph fetch once a page token is provisioned.
 */

export const dynamic = "force-dynamic";

/**
 * Constant-time secret comparison. A plain `===` on a shared secret leaks its
 * length and its matching prefix through response timing, which is enough to
 * recover it one byte at a time. The length guard is separate because
 * timingSafeEqual throws on mismatched buffers.
 */
function secretMatches(candidate: string | null, secret: string): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Pull the shared secret from `Authorization: Bearer <secret>`, falling back
 * to the legacy `?token=` query param. Returns whether the request is
 * authorized and which transport it used, so the query-param path can be
 * flagged for migration.
 */
function readWebhookSecret(
  request: NextRequest,
  secret: string
): { authorized: boolean; viaQueryParam: boolean } {
  const header = request.headers.get("authorization");
  if (header) {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match && secretMatches(match[1], secret)) {
      return { authorized: true, viaQueryParam: false };
    }
  }

  const queryToken = request.nextUrl.searchParams.get("token");
  if (queryToken) {
    return { authorized: secretMatches(queryToken, secret), viaQueryParam: true };
  }

  return { authorized: false, viaQueryParam: false };
}

// Meta subscription verification (one-time, when you connect the webhook).
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const secret = process.env.LEAD_WEBHOOK_SECRET;
  if (secret && mode === "subscribe" && secretMatches(token, secret) && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

interface NormalizedLead {
  campus?: string;      // short_code
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  student_first_name?: string;
  entry_grade?: string;
  pathway_interest?: string;
  source_detail?: string;
}

export async function POST(request: NextRequest) {
  const secret = process.env.LEAD_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const auth = readWebhookSecret(request, secret);
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (auth.viaQueryParam) {
    console.warn(
      "[webhooks/leads] Deprecated: secret sent as the ?token= query param. Move the relay to an Authorization: Bearer header — query strings are logged by proxies and CDNs."
    );
  }

  let body: NormalizedLead;
  try {
    body = (await request.json()) as NormalizedLead;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  // Resolve campus from short_code.
  const shortCode = (body.campus ?? "").toUpperCase().trim();
  if (!shortCode) return NextResponse.json({ error: "Missing campus" }, { status: 400 });
  const supabase = createServiceRoleClient();
  const { data: campus } = await supabase
    .from("campus")
    .select("id")
    .eq("short_code", shortCode)
    .maybeSingle();
  if (!campus) return NextResponse.json({ error: `Unknown campus ${shortCode}` }, { status: 400 });

  // Names: prefer explicit first/last, else split full_name.
  let first = body.first_name?.trim();
  let last = body.last_name?.trim();
  if ((!first || !last) && body.full_name) {
    const parts = body.full_name.trim().split(/\s+/);
    first = first || parts[0];
    last = last || parts.slice(1).join(" ") || "(no last name)";
  }
  if (!first) first = (body.email ?? "").split("@")[0] || "Friend";
  if (!last) last = "(no last name)";

  const result = await createLeadFromInquiry({
    campus_id: campus.id as string,
    first_name: first.slice(0, 100),
    last_name: last.slice(0, 100),
    email: body.email?.trim().slice(0, 200) || undefined,
    phone: body.phone?.trim().slice(0, 30) || undefined,
    student_first_name: body.student_first_name?.slice(0, 100) || undefined,
    entry_grade: body.entry_grade?.slice(0, 10) || undefined,
    pathway_interest: body.pathway_interest?.slice(0, 50) || undefined,
    source: "ad",
    source_detail: body.source_detail?.slice(0, 60) || "Lead ad",
  });

  if (result.error) {
    // A validation error (e.g. no email/phone) shouldn't 500 — ack so the
    // platform doesn't retry forever, but report it.
    return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  }
  return NextResponse.json({ ok: true, id: result.data?.id });
}
