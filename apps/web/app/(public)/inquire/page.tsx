import { createServiceRoleClient } from "@rooted-ems/database/server";
import { InquiryForm } from "./inquiry-form";

export const metadata = {
  title: "Get More Info — Rooted Schools",
};

// Campus list changes rarely; revalidate hourly like the landing page.
export const revalidate = 3600;

export default async function InquirePage() {
  // Service role: campus rows are RLS-visible to authenticated users only,
  // and this page is public. Read-only, names and ids only.
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("campus")
    .select("id, name, city, state")
    .order("name");

  const campuses = (data ?? []).map((c: Record<string, string>) => ({
    id: c.id,
    name: c.name,
    location: [c.city, c.state].filter(Boolean).join(", "),
  }));

  return <InquiryForm campuses={campuses} />;
}
