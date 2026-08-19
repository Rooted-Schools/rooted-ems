// No edge runtime here. The submit action in this segment performs a
// service-role write, and this is the one staff surface where that write has
// never once succeeded in production.
export const dynamic = "force-dynamic";

import { requireStaffSession } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import { FeedbackClient, type FeedbackEntry } from "./feedback-client";

export const metadata = {
  title: "Pilot feedback | Rooted EMS",
};

export default async function PilotFeedbackPage() {
  // Staff-gated page: every entry is readable by every staff member
  // (cross-campus learning is the point), so a single service-role query
  // here is simpler than threading campus scoping through a user-scoped
  // client — the RLS note_staff policy would allow the latter too, since
  // these rows always carry a null campus_id.
  await requireStaffSession();

  const supabase = createServiceRoleClient();
  const { data: notes } = await supabase
    .from("note")
    .select(
      `
      id, content, created_at,
      author:created_by (first_name, last_name)
    `
    )
    .eq("entity_type", "pilot_feedback")
    .order("created_at", { ascending: false })
    .limit(200);

  const entries: FeedbackEntry[] = (notes ?? []).map((n) => {
    const author = n.author as unknown as
      | { first_name: string | null; last_name: string | null }
      | null;
    const authorName = author
      ? `${author.first_name ?? ""} ${author.last_name ?? ""}`.trim()
      : "";
    return {
      id: n.id as string,
      content: n.content as string,
      created_at: n.created_at as string,
      author_name: authorName || "Unknown",
    };
  });

  return <FeedbackClient entries={entries} />;
}
