import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { createServiceClient } from "@rooted-ems/database/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export const metadata = {
  title: "Express Interest | rootedschools",
};

async function getPublicCampuses() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("campus")
    .select("id, name, short_code")
    .order("name", { ascending: true });

  if (error) {
    console.error("[inquiry/getPublicCampuses]", error.message);
    return [];
  }

  // Map grade ranges per campus (based on known programs)
  const gradeMap: Record<string, string> = {
    RSV: "Grades 9-12",
    CRN: "Grades 6-12",
    RSC: "Grades 6-12",
  };

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    grades: gradeMap[(row.short_code as string) ?? ""] ?? "Grades 6-12",
  }));
}

export default async function InquiryPage() {
  const campuses = await getPublicCampuses();

  return (
    <div className="min-h-screen flex items-center justify-center bg-rooted-gray px-4 py-12">
      <div className="w-full max-w-lg">
        <InquiryForm campuses={campuses} />
      </div>
    </div>
  );
}
