"use server";

import { revalidatePath } from "next/cache";
import {
  createLotteryRun,
  runLotteryPreview,
  finalizeLotteryRun,
  archiveLotteryRun,
  sendOffersFromLottery,
  type CreateLotteryRunInput,
} from "@/lib/mutations";

// ─── Create Draft Lottery Run ─────────────────────────

export async function staffCreateLotteryRun(input: CreateLotteryRunInput) {
  const result = await createLotteryRun(input);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath("/staff/applications");
  }

  return result;
}

// ─── Run Preview ──────────────────────────────────────

export async function staffRunLotteryPreview(runId: string) {
  const result = await runLotteryPreview(runId);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
  }

  return result;
}

// ─── Finalize as Official ─────────────────────────────

export async function staffFinalizeLottery(runId: string, executedBy: string) {
  const result = await finalizeLotteryRun(runId, executedBy);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
  }

  return result;
}

// ─── Archive Lottery Run ──────────────────────────────

export async function staffArchiveLottery(runId: string) {
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
