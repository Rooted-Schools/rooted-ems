// No edge runtime: this segment's actions perform service-role writes.
export const dynamic = "force-dynamic";

import { requireStaffSession } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { FeedbackClient, type FeedbackItem, type FeedbackReply } from "./feedback-client";

export const metadata = {
  title: "Pilot feedback | Rooted EMS",
};

type PersonRef = { first_name: string | null; last_name: string | null } | null;

function personName(p: PersonRef): string {
  if (!p) return "Unknown";
  const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return name || "Unknown";
}

export default async function PilotFeedbackPage() {
  // Every feedback item is readable by every staff member — cross-campus
  // learning is the point — so a single service-role read here is simpler than
  // threading user-scoped clients, and matches how the writes are gated
  // (requireStaffSession in each action).
  await requireStaffSession();
  const supabase = createServiceRoleClient();

  const [{ data: rows }, { data: replyRows }] = await Promise.all([
    supabase
      .from("pilot_feedback")
      .select(
        `id, category, context, body, screenshot_path, status, created_at, resolved_at,
         author:author_id (first_name, last_name),
         resolver:resolved_by (first_name, last_name)`
      )
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("pilot_feedback_reply")
      .select(`id, feedback_id, body, created_at, author:author_id (first_name, last_name)`)
      .order("created_at", { ascending: true }),
  ]);

  const repliesByFeedback = new Map<string, FeedbackReply[]>();
  for (const r of replyRows ?? []) {
    const list = repliesByFeedback.get(r.feedback_id as string) ?? [];
    list.push({
      id: r.id as string,
      author_name: personName(r.author as unknown as PersonRef),
      body: r.body as string,
      created_at: r.created_at as string,
    });
    repliesByFeedback.set(r.feedback_id as string, list);
  }

  const items: FeedbackItem[] = [];
  for (const row of rows ?? []) {
    let screenshotUrl: string | null = null;
    if (row.screenshot_path) {
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(row.screenshot_path as string, 3600);
      screenshotUrl = data?.signedUrl ?? null;
    }
    items.push({
      id: row.id as string,
      category: row.category as string,
      context: (row.context as string | null) ?? null,
      body: row.body as string,
      status: (row.status as string) === "resolved" ? "resolved" : "open",
      created_at: row.created_at as string,
      resolved_at: (row.resolved_at as string | null) ?? null,
      author_name: personName(row.author as unknown as PersonRef),
      resolver_name: personName(row.resolver as unknown as PersonRef),
      screenshotUrl,
      replies: repliesByFeedback.get(row.id as string) ?? [],
    });
  }

  return <FeedbackClient items={items} />;
}
