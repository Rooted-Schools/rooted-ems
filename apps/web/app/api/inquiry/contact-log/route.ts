export const runtime = "edge";

import { NextResponse, type NextRequest } from "next/server";
import { addContactLog } from "@/lib/mutations";

export async function POST(request: NextRequest) {
  try {
    const { inquiryId, channel, notes, createdBy } = await request.json();

    if (!inquiryId || !channel || !createdBy) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const result = await addContactLog(inquiryId, channel, notes ?? null, createdBy);

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to log contact." },
      { status: 500 }
    );
  }
}
