import { createServiceRoleClient } from "@rooted-ems/database/server";
import { headers } from "next/headers";
import crypto from "crypto";

/**
 * Per-IP rate limiting for public capture endpoints (LG-0.4).
 *
 * Dependency-free: hashed-IP rows in public_submission_log, counted over a
 * sliding window. IPs are HMAC-hashed (never stored raw) — enough to
 * throttle a flood, useless for tracking. Limits are deliberately generous:
 * the goal is stopping bots and copy-paste floods, never a family at a
 * library computer or a tabling event's shared wifi.
 *
 * Fails OPEN on infrastructure errors (a DB blip must not block a real
 * family's inquiry) but logs loudly, since this is an abuse control.
 */

const PRUNE_PROBABILITY = 0.05; // opportunistic cleanup of >24h rows

export interface RateLimitResult {
  allowed: boolean;
}

export async function checkRateLimit(
  endpoint: string,
  limit: number,
  windowMinutes: number
): Promise<RateLimitResult> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "unknown";
    const key = process.env.CRON_SECRET ?? "rooted-rl";
    const ipHash = crypto.createHmac("sha256", key).update(ip).digest("hex").slice(0, 32);

    const supabase = createServiceRoleClient();
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from("public_submission_log")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .eq("endpoint", endpoint)
      .gte("created_at", windowStart);

    if (error) {
      console.error("[checkRateLimit] count failed — failing open", error.message);
      return { allowed: true };
    }

    if ((count ?? 0) >= limit) {
      console.warn(`[checkRateLimit] throttled ${endpoint}`, { ipHash, count });
      return { allowed: false };
    }

    await supabase.from("public_submission_log").insert({ ip_hash: ipHash, endpoint });

    if (Math.random() < PRUNE_PROBABILITY) {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("public_submission_log").delete().lt("created_at", dayAgo);
    }

    return { allowed: true };
  } catch (err) {
    console.error("[checkRateLimit] unexpected — failing open", err);
    return { allowed: true };
  }
}
