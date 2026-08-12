"use server";

import { revalidatePath } from "next/cache";
import { requireRoleOnCampus } from "@/lib/auth/get-session";
import { createServiceRoleClient } from "@rooted-ems/database/server";
import {
  createLotteryRun,
  runLotteryPreview,
  finalizeLotteryRun,
  archiveLotteryRun,
  sendOffersFromLottery,
  simulateLotteryRun,
  completeLotteryResults,
  resumeLotteryNotifications,
  type CreateLotteryRunInput,
} from "@/lib/mutations";
import { getPreflightReport } from "@/lib/lottery-preflight";

/**
 * Lottery actions decide who gets a seat, so they carry the same gate as the
 * lottery pages: enrollment_manager. The "who ran this" ids used to arrive as
 * arguments — a client could sign someone else's name to a finalized lottery.
 * They come from the session now; the parameters stay in the signatures for
 * the existing callers and are ignored.
 *
 * They also previously trusted requireMinRole("enrollment_manager") alone,
 * which only checks the caller's best role on ANY campus. An enrollment
 * manager at Campus A could finalize, send offers from, or waitlist the
 * losers of a lottery run at Campus B just by supplying that run's id. Every
 * action below resolves the run's (or the input's) real campus_id and gates
 * on requireRoleOnCampus for that specific campus.
 */

async function resolveLotteryRunCampus(runId: string): Promise<string | undefined> {
  const supabase = createServiceRoleClient();
  const { data: run } = await supabase
    .from("lottery_run")
    .select("campus_id")
    .eq("id", runId)
    .single();
  return run?.campus_id as string | undefined;
}

// ─── Create Draft Lottery Run ─────────────────────────

export async function staffCreateLotteryRun(input: CreateLotteryRunInput) {
  await requireRoleOnCampus(input.campus_id, "enrollment_manager");
  const result = await createLotteryRun(input);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath("/staff/applications");
  }

  return result;
}

// ─── Simulate (read-only what-if) ─────────────────────

export async function staffSimulateLottery(runId: string, seatsOverride?: number) {
  await requireRoleOnCampus(await resolveLotteryRunCampus(runId), "enrollment_manager");
  // Read-only — no revalidation needed, nothing changes.
  return simulateLotteryRun(runId, seatsOverride);
}

// ─── Run Preview ──────────────────────────────────────

export async function staffRunLotteryPreview(runId: string) {
  await requireRoleOnCampus(await resolveLotteryRunCampus(runId), "enrollment_manager");
  const result = await runLotteryPreview(runId);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
  }

  return result;
}

// ─── Finalize as Official ─────────────────────────────

export async function staffFinalizeLottery(runId: string, _executedBy?: string) {
  const session = await requireRoleOnCampus(await resolveLotteryRunCampus(runId), "enrollment_manager");

  // Preflight is re-evaluated server side, not trusted from the panel the
  // staff member was looking at. The page may have been open for an hour, and
  // "the button was enabled when I clicked it" is not a defense for an
  // official lottery run on stale conditions.
  const preflight = await getPreflightReport(runId);
  if (preflight?.blocked) {
    return {
      data: null,
      error: `This lottery is not ready to be made official. ${preflight.reasons.join(" ")}`,
    };
  }

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
  await requireRoleOnCampus(await resolveLotteryRunCampus(runId), "enrollment_manager");
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
  /** Null means "use the governing policy's acceptance window." */
  expiresAt: string | null,
  _offeredBy?: string
) {
  const session = await requireRoleOnCampus(await resolveLotteryRunCampus(runId), "enrollment_manager");
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

// ─── Resume an interrupted notification fan-out ───────

export async function staffResumeLotteryNotifications(runId: string) {
  const session = await requireRoleOnCampus(
    await resolveLotteryRunCampus(runId),
    "enrollment_manager"
  );
  const result = await resumeLotteryNotifications(runId, session.user_id);

  if (!result.error) {
    revalidatePath(`/staff/lottery/${runId}`);
    revalidatePath("/staff/lottery");
  }

  return result;
}

// ─── Complete Lottery Results (Waitlist Non-Selected) ─

export async function staffCompleteLotteryResults(runId: string, _actorId?: string) {
  const session = await requireRoleOnCampus(await resolveLotteryRunCampus(runId), "enrollment_manager");
  const result = await completeLotteryResults(runId, session.user_id);

  if (!result.error) {
    revalidatePath("/staff/lottery");
    revalidatePath(`/staff/lottery/${runId}`);
    revalidatePath("/staff/waitlist");
  }

  return result;
}
