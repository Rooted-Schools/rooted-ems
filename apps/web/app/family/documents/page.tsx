export const runtime = "edge";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import { getFamilyDocuments } from "@/lib/queries";
import { DocumentsClient } from "./documents-client";

export default async function FamilyDocumentsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const db = createServiceRoleClient();

  // Fetch documents and applications in parallel
  const [documents, { data: guardians }] = await Promise.all([
    getFamilyDocuments(user.id),
    db.from("guardian").select("id").eq("user_id", user.id),
  ]);

  // Get applications (non-draft) for the family
  const guardianIds = (guardians ?? []).map((g: Record<string, string>) => g.id);
  let applications: { id: string; student_name: string; student_id: string }[] = [];
  // The family's campus timezone. Formatting dates in a fixed zone (rather than
  // the browser's) is what keeps server and client renders identical, removing
  // the SSR/hydration mismatch on upload dates. A family with applications at
  // more than one campus resolves to the first campus that declares a zone.
  let campusTimeZone: string | null = null;

  if (guardianIds.length > 0) {
    const { data: apps } = await db
      .from("application")
      .select("id, student:student_id (id, first_name, last_name), campus:campus_id (timezone)")
      .in("guardian_id", guardianIds)
      .neq("status", "withdrawn");

    applications = (apps ?? []).map((a: Record<string, unknown>) => {
      const student = a.student as unknown as Record<string, string> | null;
      return {
        id: a.id as string,
        student_name: student ? `${student.first_name} ${student.last_name}` : "Unknown",
        student_id: student?.id ?? "",
      };
    });

    for (const a of apps ?? []) {
      const campus = (a as Record<string, unknown>).campus as Record<string, string> | null;
      if (campus?.timezone) {
        campusTimeZone = campus.timezone;
        break;
      }
    }
  }

  return (
    <DocumentsClient
      documents={documents}
      applications={applications}
      userId={user.id}
      timeZone={campusTimeZone}
    />
  );
}
