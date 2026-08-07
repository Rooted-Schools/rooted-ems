"use server";

import { revalidatePath } from "next/cache";
import { requireMinRole } from "@/lib/auth/get-session";
import {
  createLotteryRun,
  runLotteryPreview,
  finalizeLotteryRun,
  archiveLotteryRun,
  sendOffersFromLottery,
  simulateLotteryRun,
  completeLotteryResults,
  type CreateLotteryRunInput,
} from "@/lib/mutations";

/**
 * Lottery actions decide who gets a seat, so they carry the same gate as the
 * lottery pages: enrollment_manager. The "who ran this" ids used to arrive as
 * arguments — a client could sign someone else's name to a finalized lottery.
 * They come from the session now; the parameters stay in the signatures for
 * the existing callers and are ignored.
 */

// ─── Create Draft Lottery Run ─────────────────────────

export async function staffCreateLotteryRun(input: CreateLotteryRunInput) {
  await requireMinRole("enrollment_manager");
  const result = await createLotteryRun(input);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath("/staff/applications");
  }

  return result;
}

// ─── Simulate (read-only what-if) ─────────────────────

export async function staffSimulateLottery(runId: string, seatsOverride?: number) {
  await requireMinRole("enrollment_manager");
  // Read-only — no revalidation needed, nothing changes.
  return simulateLotteryRun(runId, seatsOverride);
}

// ─── Run Preview ──────────────────────────────────────

export async function staffRunLotteryPreview(runId: string) {
  await requireMinRole("enrollment_manager");
  const result = await runLotteryPreview(runId);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
  }

  return result;
}

// ─── Finalize as Official ─────────────────────────────

export async function staffFinalizeLottery(runId: string, _executedBy?: string) {
  const session = await requireMinRole("enrollment_manager");
  const result = await finalizeLotteryRun(runId, session.user_id);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}

// ─── Archive Lottery Run ──────────────────────────────

export async function staffArchiveLottery(runId: string) {
  await requireMinRole("enrollment_manager");
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
  _offeredBy?: string
) {
  const session = await requireMinRole("enrollment_manager");
  const result = await sendOffersFromLottery(runId, expiresAt, session.user_id);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
    revalidatePath("/staff/offers");
    revalidatePath("/staff/applications");
    revalidatePath("/staff/dashboard");
    revalidatePath("/staff/today");
  }

  return result;
}

// ─── Complete Lottery Results (Waitlist Non-Selected) ─

export async function staffCompleteLotteryResults(runId: string, _actorId?: string) {
  const session = await requireMinRole("enrollment_manager");
  const result = await completeLotteryResults(runId, session.user_id);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
    revalidatePath("/staff/waitlist");
  }

  return result;
}
