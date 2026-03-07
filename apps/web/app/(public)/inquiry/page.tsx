import { InquiryForm } from "@/components/inquiry/inquiry-form";
import { createServiceClient } from "@rooted-ems/database/service";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export const metadata = {
  title: "Express Interest | rootedschools",
};

async function getPublicCampuses() {
  const supabase = createServiceClient();

  // Fetch campuses
  const { data: campusData, error: campusError } = await supabase
    .from("campus")
    .select("id, name, short_code")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (campusError) {
    console.error("[inquiry/getPublicCampuses]", campusError.message);
    return [];
  }

  // Fetch grade levels for current school year
  const { data: gradeData, error: gradeError } = await supabase
    .from("grade_level")
    .select("campus_id, grade, school_year:school_year_id(is_current)")
    .order("grade", { ascending: true });

  if (gradeError) {
    console.error("[inquiry/getGradeLevels]", gradeError.message);
  }

  // Build grade codes per campus (only current school year, deduplicated)
  const gradesByCampus: Record<string, Set<string>> = {};
  for (const row of gradeData ?? []) {
    const sy = row.school_year as unknown as { is_current: boolean } | null;
    if (!sy?.is_current) continue;
    const cid = row.campus_id as string;
    if (!gradesByCampus[cid]) gradesByCampus[cid] = new Set();
    gradesByCampus[cid].add(row.grade as string);
  }

  // Fallback grade ranges by short_code (in case no grade_level rows yet)
  const fallbackGrades: Record<string, string[]> = {
    RSV: ["9", "10", "11", "12"],
    CRN: ["6", "7", "8", "9", "10", "11", "12"],
    RSC: ["6", "7", "8", "9", "10", "11", "12"],
  };

  return (campusData ?? []).map((row) => {
    const id = row.id as string;
    const shortCode = row.short_code as string;
    const gradeSet = gradesByCampus[id];
    const gradeCodes = gradeSet ? Array.from(gradeSet) : (fallbackGrades[shortCode] ?? ["6", "7", "8", "9", "10", "11", "12"]);

    return {
      id,
      name: row.name as string,
      gradeCodes,
    };
  });
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
