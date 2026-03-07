"use server";

import { revalidatePath } from "next/cache";
import {
  updateInquiryStatus,
  assignInquiryStaff,
  addContactLog,
  convertInquiryToApplication,
} from "@/lib/mutations";

export async function updateInquiryStatusAction(inquiryId: string, status: string) {
  const result = await updateInquiryStatus(inquiryId, status);
  if (!result.error) revalidatePath("/staff/inquiries");
  return result;
}

export async function assignInquiryStaffAction(inquiryId: string, staffId: string) {
  const result = await assignInquiryStaff(inquiryId, staffId);
  if (!result.error) revalidatePath("/staff/inquiries");
  return result;
}

export async function addContactLogAction(
  inquiryId: string,
  channel: string,
  notes: string | null,
  staffId: string
) {
  const result = await addContactLog(inquiryId, channel, notes, staffId);
  if (!result.error) revalidatePath("/staff/inquiries");
  return result;
}

export async function convertInquiryAction(
  inquiryId: string,
  enrollmentWindowId: string,
  gradeLevelId: string,
  staffUserId: string
) {
  const result = await convertInquiryToApplication(
    inquiryId,
    enrollmentWindowId,
    gradeLevelId,
    staffUserId
  );
  if (!result.error) {
    revalidatePath("/staff/inquiries");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
  }
  return result;
}
