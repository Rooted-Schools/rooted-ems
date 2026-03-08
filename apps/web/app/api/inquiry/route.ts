export const runtime = "edge";

import { createServiceClient } from "@rooted-ems/database/service";
import { NextResponse, type NextRequest } from "next/server";

const VALID_GRADES = ["6", "7", "8", "9", "10", "11", "12"];
const VALID_SOURCES = [
  "word_of_mouth",
  "social_media",
  "community_event",
  "partner_referral",
  "website",
  "other",
];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      campus_id,
      student_first_name,
      student_last_name,
      grade_applying,
      target_start_year,
      guardian_name,
      guardian_email,
      guardian_phone,
      source,
      notes,
    } = body;

    // Validate required fields
    if (!student_first_name?.trim() || !student_last_name?.trim()) {
      return NextResponse.json(
        { error: "Student first and last name are required." },
        { status: 400 }
      );
    }

    if (!grade_applying || !VALID_GRADES.includes(grade_applying)) {
      return NextResponse.json(
        { error: "Please select a valid grade level." },
        { status: 400 }
      );
    }

    if (!guardian_name?.trim()) {
      return NextResponse.json(
        { error: "Parent/guardian name is required." },
        { status: 400 }
      );
    }

    if (!guardian_email?.trim() && !guardian_phone?.trim()) {
      return NextResponse.json(
        { error: "Please provide an email address or phone number." },
        { status: 400 }
      );
    }

    // Basic email format check
    if (guardian_email?.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(guardian_email.trim())) {
        return NextResponse.json(
          { error: "Please enter a valid email address." },
          { status: 400 }
        );
      }
    }

    const supabase = createServiceClient();

    // If campus_id provided, verify it exists
    if (campus_id) {
      const { data: campus } = await supabase
        .from("campus")
        .select("id")
        .eq("id", campus_id)
        .single();

      if (!campus) {
        return NextResponse.json(
          { error: "Selected campus not found." },
          { status: 400 }
        );
      }
    }

    const { error: insertError } = await supabase.from("inquiry").insert({
      campus_id: campus_id || null,
      student_first_name: student_first_name.trim(),
      student_last_name: student_last_name.trim(),
      grade_applying,
      target_start_year: target_start_year?.trim() || null,
      guardian_name: guardian_name.trim(),
      guardian_email: guardian_email?.trim() || null,
      guardian_phone: guardian_phone?.trim() || null,
      source: VALID_SOURCES.includes(source) ? source : "website",
      notes: notes?.trim() || null,
      status: "new",
    });

    if (insertError) {
      console.error("[inquiry/route]", insertError.message);
      return NextResponse.json(
        { error: "Unable to submit your inquiry. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
