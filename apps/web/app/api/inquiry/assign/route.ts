export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { assignInquiryStaff } from "@/lib/mutations";

export async function POST(request: NextRequest) {
  try {
    const { inquiryId, staffId } = await request.json();

    if (!inquiryId || !staffId) {
      return NextResponse.json(
        { error: "Missing inquiryId or staffId." },
        { status: 400 }
      );
    }

    const result = await assignInquiryStaff(inquiryId, staffId);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to assign staff." },
      { status: 500 }
    );
  }
}
