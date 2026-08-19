"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { FamilyOfferDetail } from "@/lib/queries";
import { familyAcceptOffer, familyDeclineOffer } from "../../applications/actions";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  DECLINE_REASONS,
  DECLINE_REASON_LABEL_KEY,
  type DeclineReason,
} from "@/lib/decline-reasons";
import { IconAlertTriangle, IconBan, IconCheckCircle, IconClock } from "@/components/ui/icons";

interface Props {
  offer: FamilyOfferDetail;
  guardianId: string;
}

// Format the deadline in the campus's fixed IANA timezone. Passing an explicit
// timeZone is what makes the server (UTC) and the browser (device zone) agree,
// which both shows the family the real 4:00 PM cutoff and removes the
// SSR/hydration mismatch on this highest-stakes screen. timeZoneName: "short"
// spells out the zone (for example "PST") so the time is unambiguous.
function formatExpiry(isoString: string, localeTag: string, timeZone: string | null): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  if (timeZone) {
    options.timeZone = timeZone;
    options.timeZoneName = "short";
  }
  return new Date(isoString).toLocaleDateString(localeTag, options);
}

export function OfferResponseClient({ offer, guardianId }: Props) {
  const { t, locale } = useLocale();
  const localeTag = locale === "es" ? "es-US" : "en-US";
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  // Playbook s15 refusal tracking. Both stay optional: a family declining a
  // seat is already having a hard moment, and gating that behind a required
  // survey would be both hostile and a good way to collect garbage answers.
  const [declineReason, setDeclineReason] = useState<DeclineReason | null>(null);
  const [declineNote, setDeclineNote] = useState("");

  // B9: the offer dead-end screens (declined / expired) told families to
  // "contact the school" with no way to do it. Give them a real path: the
  // campus email as a mailto (populated for every pilot campus, null-safe here)
  // and a link into the in-portal messages. Bilingual via translations.ts.
  const contactHelp = (
    <p className="text-sm text-stone-text max-w-xs mx-auto">
      {t("offers.needHelp")}{" "}
      {offer.campus_email ? (
        <>
          {t("offers.emailSchool")}{" "}
          <a href={`mailto:${offer.campus_email}`} className="text-rooted-green underline hover:no-underline">
            {offer.campus_email}
          </a>{" "}
          {t("offers.contactOr")}{" "}
          <Link href="/family/messages" className="text-rooted-green underline hover:no-underline">
            {t("offers.sendMessage")}
          </Link>
          .
        </>
      ) : (
        <>
          <Link href="/family/messages" className="text-rooted-green underline hover:no-underline">
            {t("offers.sendMessageCap")}
          </Link>
          .
        </>
      )}
    </p>
  );

  // ── Already-handled states ─────────────────────────────────────────────────

  if (offer.status === "accepted") {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <div className="flex justify-center text-rooted-green">
            <IconCheckCircle size={40} />
          </div>
          <h2 className="text-xl font-bold text-ink">{t("offers.offerAccepted")}</h2>
          <p className="text-sm text-stone-text max-w-xs mx-auto">
            {t("offers.alreadyAcceptedPre")} {offer.student_name} {t("common.at")}{" "}
            {offer.campus_name}. {t("offers.alreadyAcceptedPost")}
          </p>
          <Link href="/family/registration">
            <Button className="bg-rooted-green hover:bg-rooted-green/90 text-white">
              {t("offers.goToReg")}
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (offer.status === "declined") {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <div className="flex justify-center text-stone">
            <IconBan size={40} />
          </div>
          <h2 className="text-xl font-bold text-ink">{t("offers.offerDeclined")}</h2>
          <p className="text-sm text-stone-text max-w-xs mx-auto">
            {t("offers.declinedPre")} {offer.student_name}. {t("offers.declinedPost")}
          </p>
          {contactHelp}
          <Link href="/family/dashboard">
            <Button variant="outline">{t("common.backToDashboard")}</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (offer.status === "expired" || offer.is_expired) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <div className="flex justify-center text-stone">
            <IconClock size={40} />
          </div>
          <h2 className="text-xl font-bold text-ink">{t("offers.offerExpired")}</h2>
          <p className="text-sm text-stone-text max-w-xs mx-auto">
            {t("offers.expiredPre")} {offer.student_name} {t("offers.expiredPost")}
          </p>
          {contactHelp}
          <Link href="/family/dashboard">
            <Button variant="outline">{t("common.backToDashboard")}</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // ── Pending offer ──────────────────────────────────────────────────────────

  const handleAccept = () => {
    startTransition(async () => {
      const result = await familyAcceptOffer(offer.id, guardianId, offer.application_id);
      if (result.error) {
        toast({
          variant: "error",
          title: t("toast.errorTitle"),
          description: result.error,
          dismissLabel: t("common.dismiss"),
        });
        setShowAcceptDialog(false);
      } else {
        router.push("/family/registration");
      }
    });
  };

  const handleDecline = () => {
    startTransition(async () => {
      const result = await familyDeclineOffer(
        offer.id,
        offer.application_id,
        declineReason ?? undefined,
        declineNote.trim() || undefined
      );
      if (result.error) {
        toast({
          variant: "error",
          title: t("toast.errorTitle"),
          description: result.error,
          dismissLabel: t("common.dismiss"),
        });
        setShowDeclineDialog(false);
      } else {
        router.push("/family/dashboard");
      }
    });
  };

  return (
    <>
      {/* ── Congratulations header ── */}
      <div className="bg-rooted-green/10 border border-rooted-green/30 rounded-xl p-6 text-center space-y-2">
        <div className="flex justify-center text-rooted-green">
          <IconCheckCircle size={40} />
        </div>
        <h1 className="text-2xl font-bold text-ink">
          {t("offers.congratulations")}
        </h1>
        <p className="text-sm text-ink/70">
          {offer.student_name} {t("offers.offeredSeatAt")}{" "}
          <span className="font-semibold">{offer.campus_name}</span>.
        </p>
      </div>

      {/* ── Offer details card ── */}
      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-base font-semibold text-ink">{t("offers.offerDetails")}</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-stone-text text-xs uppercase tracking-wide mb-0.5">{t("offers.student")}</p>
              <p className="font-medium text-ink">{offer.student_name}</p>
            </div>
            <div>
              <p className="text-stone-text text-xs uppercase tracking-wide mb-0.5">{t("offers.grade")}</p>
              <p className="font-medium text-ink">{offer.grade}</p>
            </div>
            <div>
              <p className="text-stone-text text-xs uppercase tracking-wide mb-0.5">{t("offers.school")}</p>
              <p className="font-medium text-ink">{offer.campus_name}</p>
            </div>
            <div>
              <p className="text-stone-text text-xs uppercase tracking-wide mb-0.5">{t("offers.deadline")}</p>
              <div>
                {offer.is_urgent ? (
                  <Badge variant="destructive" className="text-xs whitespace-nowrap">
                    {offer.hours_remaining != null && offer.hours_remaining < 24
                      ? `${offer.hours_remaining}${t("offers.hoursLeftSuffix")}`
                      : offer.days_remaining === 1
                        ? t("offers.oneDayLeft")
                        : `${offer.days_remaining} ${t("offers.daysLeftSuffix")}`}
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-xs whitespace-nowrap">
                    {offer.days_remaining === 1
                      ? t("offers.oneDayLeft")
                      : `${offer.days_remaining} ${t("offers.daysLeftSuffix")}`}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-rooted-gray pt-3">
            <p className="text-xs text-stone-text">
              {t("offers.respondBy")}{" "}
              <span className={`font-semibold ${offer.is_urgent ? "text-red-600" : "text-ink"}`}>
                {formatExpiry(offer.expires_at, localeTag, offer.campus_timezone)}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Urgency banner ── */}
      {offer.is_urgent && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
          <IconAlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>
            {t("offers.urgentBanner")}
          </span>
        </div>
      )}

      {/* ── Action buttons ── */}
      <div className="grid grid-cols-1 gap-3">
        <Button
          size="lg"
          className="w-full bg-rooted-green hover:bg-rooted-green/90 text-white text-base h-14"
          onClick={() => setShowAcceptDialog(true)}
          disabled={isPending}
        >
          {t("offers.accept")}
        </Button>
        <div>
          <Button
            size="lg"
            variant="outline"
            className="w-full text-base h-12"
            onClick={() => setShowDeclineDialog(true)}
            disabled={isPending}
          >
            {t("offers.decline")}
          </Button>
          <p className="text-xs text-stone-500 mt-1">
            {t("offers.declineForfeit")}
          </p>
        </div>
      </div>

      {/* ── What happens next ── */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <p className="text-sm font-semibold text-ink">{t("offers.whatHappens")}</p>
          <div className="space-y-2 text-sm text-ink/70">
            <div className="flex items-start gap-2">
              <IconCheckCircle size={16} className="text-rooted-green mt-0.5 shrink-0" />
              <span>{t("offers.seatSecuredAt")} {offer.campus_name}.</span>
            </div>
            <div className="flex items-start gap-2">
              <IconCheckCircle size={16} className="text-rooted-green mt-0.5 shrink-0" />
              <span>{t("offers.portalNext")}</span>
            </div>
            <div className="flex items-start gap-2">
              <IconCheckCircle size={16} className="text-rooted-green mt-0.5 shrink-0" />
              <span>{t("offers.regFinalized")}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Accept confirmation dialog ── */}
      <Dialog open={showAcceptDialog} onOpenChange={setShowAcceptDialog}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("offers.acceptTitle")}</DialogTitle>
            <DialogDescription>
              {t("offers.acceptingFor")}{" "}
              <strong>{offer.student_name}</strong> {t("common.at")}{" "}
              <strong>{offer.campus_name}</strong> ({offer.grade}).{" "}
              {t("offers.directedToPacket")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAcceptDialog(false)}
              disabled={isPending}
            >
              {t("reg.dialog.cancel")}
            </Button>
            <Button
              className="bg-rooted-green hover:bg-rooted-green/90 text-white"
              onClick={handleAccept}
              disabled={isPending}
            >
              {isPending ? t("offers.accepting") : t("offers.yesAccept")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Decline confirmation dialog ── */}
      <Dialog open={showDeclineDialog} onOpenChange={setShowDeclineDialog}>
        <DialogContent closeLabel={t("common.close")}>
          <DialogHeader>
            <DialogTitle>{t("offers.declineTitle")}</DialogTitle>
            <DialogDescription>
              {t("offers.declineConfirmPre")}{" "}
              <strong>{offer.student_name}</strong> {t("common.at")}{" "}
              <strong>{offer.campus_name}</strong>? {t("offers.cannotUndo")}
            </DialogDescription>
          </DialogHeader>

          {/* Refusal tracking (playbook s15). Optional by design — the decline
              button below is never blocked on answering this. */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-ink">
              {t("offers.declineReasonPrompt")}{" "}
              <span className="font-normal text-stone">{t("common.optional")}</span>
            </legend>
            <div className="space-y-1.5">
              {DECLINE_REASONS.map((reason) => (
                <label
                  key={reason}
                  className="flex items-center gap-2.5 text-sm text-ink cursor-pointer"
                >
                  <input
                    type="radio"
                    name="decline-reason"
                    value={reason}
                    checked={declineReason === reason}
                    onChange={() => setDeclineReason(reason)}
                    disabled={isPending}
                    className="h-4 w-4 accent-rooted-green"
                  />
                  {t(DECLINE_REASON_LABEL_KEY[reason])}
                </label>
              ))}
            </div>
            <textarea
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
              disabled={isPending}
              rows={2}
              maxLength={500}
              placeholder={t("offers.declineNotePlaceholder")}
              aria-label={t("offers.declineNotePlaceholder")}
              className="w-full rounded-md border border-line p-2 text-sm text-ink placeholder:text-stone focus:border-rooted-green focus:outline-none"
            />
          </fieldset>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeclineDialog(false)}
              disabled={isPending}
            >
              {t("offers.keepOffer")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDecline}
              disabled={isPending}
            >
              {isPending ? t("offers.declining") : t("offers.yesDecline")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
