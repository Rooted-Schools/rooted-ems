export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { updateInquiryStatus } from "@/lib/mutations";

export async function POST(request: NextRequest) {
  try {
    const { inquiryId, status } = await request.json();

    if (!inquiryId || !status) {
      return NextResponse.json(
        { error: "Missing inquiryId or status." },
        { status: 400 }
      );
    }

    const result = await updateInquiryStatus(inquiryId, status);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update inquiry status." },
      { status: 500 }
    );
  }
}
