import { createServiceRoleClient } from "@rooted-ems/database/server";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getLocaleCookie } from "@/lib/i18n/get-locale";
import { LotteryExplainerClient, type ExplainerCampus } from "./explainer-client";

export const metadata = {
  title: "How the Lottery Works — Rooted Schools",
};

// Reads the locale cookie, so this page renders per-request.
export const dynamic = "force-dynamic";

const DEFAULT_TIER_LABEL = "Sibling enrolled at campus";

/**
 * Defensively pull tier labels out of a rule set's priority_tiers JSONB.
 * Falls back to the single sibling-priority label when the array is
 * missing, empty, or malformed — mirrors the fallback used when resolving
 * tiers for an actual lottery run (see lib/mutations/lottery.ts).
 */
function extractTierLabels(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [DEFAULT_TIER_LABEL];
  const labels = raw
    .map((item) => {
      const label = (item as Record<string, unknown> | null)?.label;
      return typeof label === "string" && label.trim() ? label : null;
    })
    .filter((label): label is string => label !== null);
  return labels.length > 0 ? labels : [DEFAULT_TIER_LABEL];
}

export default async function HowTheLotteryWorksPage() {
  const initialLocale = await getLocaleCookie();

  // Service role: campus, lottery_rule_set, and enrollment_window rows are
  // RLS-visible to authenticated users only, and this page is public.
  // Read-only — no mutations happen here.
  const supabase = createServiceRoleClient();

  const { data: campusRows } = await supabase
    .from("campus")
    .select("id, name")
    .order("name");
  const campuses = (campusRows ?? []) as { id: string; name: string }[];

  const { data: windowRows } = await supabase
    .from("enrollment_window")
    .select("campus_id, close_date")
    .eq("status", "open");
  const closeDateByCampus = new Map<string, string>();
  for (const w of (windowRows ?? []) as { campus_id: string; close_date: string }[]) {
    // Multiple open windows per campus are possible; keep the earliest close.
    const existing = closeDateByCampus.get(w.campus_id);
    if (!existing || w.close_date < existing) {
      closeDateByCampus.set(w.campus_id, w.close_date);
    }
  }

  const explainerCampuses: ExplainerCampus[] = await Promise.all(
    campuses.map(async (campus) => {
      const { data: ruleSetRows } = await supabase
        .from("lottery_rule_set")
        .select("priority_tiers")
        .eq("campus_id", campus.id)
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1);
      const ruleSet = ruleSetRows?.[0] as { priority_tiers: unknown } | undefined;
      const tierLabels = extractTierLabels(ruleSet?.priority_tiers);

      return {
        id: campus.id,
        name: campus.name,
        tierLabels,
        closeDate: closeDateByCampus.get(campus.id) ?? null,
      };
    })
  );

  return (
    <LocaleProvider initialLocale={initialLocale}>
      <LotteryExplainerClient campuses={explainerCampuses} />
    </LocaleProvider>
  );
}
