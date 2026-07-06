"use server";

import { revalidatePath } from "next/cache";
import { requireStaffSession } from "@/lib/auth/get-session";
import {
  createLotteryRun,
  runLotteryPreview,
  finalizeLotteryRun,
  archiveLotteryRun,
  sendOffersFromLottery,
  simulateLotteryRun,
  type CreateLotteryRunInput,
} from "@/lib/mutations";

// ─── Create Draft Lottery Run ─────────────────────────

export async function staffCreateLotteryRun(input: CreateLotteryRunInput) {
  await requireStaffSession();
  const result = await createLotteryRun(input);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath("/staff/applications");
  }

  return result;
}

// ─── Simulate (read-only what-if) ─────────────────────

export async function staffSimulateLottery(runId: string, seatsOverride?: number) {
  await requireStaffSession();
  // Read-only — no revalidation needed, nothing changes.
  return simulateLotteryRun(runId, seatsOverride);
}

// ─── Run Preview ──────────────────────────────────────

export async function staffRunLotteryPreview(runId: string) {
  await requireStaffSession();
  const result = await runLotteryPreview(runId);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
  }

  return result;
}

// ─── Finalize as Official ─────────────────────────────

export async function staffFinalizeLottery(runId: string, executedBy: string) {
  await requireStaffSession();
  const result = await finalizeLotteryRun(runId, executedBy);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
    revalidatePath("/staff/dashboard");
  }

  return result;
}

// ─── Archive Lottery Run ──────────────────────────────

export async function staffArchiveLottery(runId: string) {
  await requireStaffSession();
  const result = await archiveLotteryRun(runId);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
  }

  return result;
}

// ─── Send Offers From Lottery ─────────────────────────

export async function staffSendLotteryOffers(
  runId: string,
  expiresAt: string,
  offeredBy: string
) {
  await requireStaffSession();
  const result = await sendOffersFromLottery(runId, expiresAt, offeredBy);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
    revalidatePath("/staff/offers");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
  }

  return result;
}
