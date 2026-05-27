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
import type { FamilyOfferDetail } from "@/lib/queries";
import { familyAcceptOffer, familyDeclineOffer } from "../../applications/actions";
import { useLocale } from "@/lib/i18n/locale-context";

interface Props {
  offer: FamilyOfferDetail;
  guardianId: string;
}

function formatExpiry(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OfferResponseClient({ offer, guardianId }: Props) {
  const { t } = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Already-handled states ─────────────────────────────────────────────────

  if (offer.status === "accepted") {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-4">
          <div className="text-4xl">✅</div>
          <h2 className="text-xl font-bold text-ink">{t("offers.offerAccepted")}</h2>
          <p className="text-sm text-stone max-w-xs mx-auto">
            You have already accepted the offer for {offer.student_name} at{" "}
            {offer.campus_name}. Complete registration to finalize enrollment.
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
          <div className="text-4xl">🚫</div>
          <h2 className="text-xl font-bold text-ink">{t("offers.offerDeclined")}</h2>
          <p className="text-sm text-stone max-w-xs mx-auto">
            You previously declined this offer for {offer.student_name}. If
            this was a mistake, please contact the school directly.
          </p>
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
          <div className="text-4xl">⏰</div>
          <h2 className="text-xl font-bold text-ink">{t("offers.offerExpired")}</h2>
          <p className="text-sm text-stone max-w-xs mx-auto">
            The offer deadline for {offer.student_name} has passed. Please
            contact the school to ask about your options.
          </p>
          <Link href="/family/dashboard">
            <Button variant="outline">{t("common.backToDashboard")}</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // ── Pending offer ──────────────────────────────────────────────────────────

  const handleAccept = () => {
    setError(null);
    startTransition(async () => {
      const result = await familyAcceptOffer(offer.id, guardianId, offer.application_id);
      if (result.error) {
        setError(result.error);
        setShowAcceptDialog(false);
      } else {
        router.push("/family/registration");
      }
    });
  };

  const handleDecline = () => {
    setError(null);
    startTransition(async () => {
      const result = await familyDeclineOffer(offer.id, offer.application_id);
      if (result.error) {
        setError(result.error);
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
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-bold text-ink">
          {t("offers.congratulations")}
        </h1>
        <p className="text-sm text-ink/70">
          {offer.student_name} has been offered a seat at{" "}
          <span className="font-semibold">{offer.campus_name}</span>.
        </p>
      </div>

      {/* ── Offer details card ── */}
      <Card>
        <CardHeader className="pb-2">
          <h2 className="text-base font-semibold text-ink">{t("offers.offerDetails")}</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-stone text-xs uppercase tracking-wide mb-0.5">{t("offers.student")}</p>
              <p className="font-medium text-ink">{offer.student_name}</p>
            </div>
            <div>
              <p className="text-stone text-xs uppercase tracking-wide mb-0.5">{t("offers.grade")}</p>
              <p className="font-medium text-ink">{offer.grade}</p>
            </div>
            <div>
              <p className="text-stone text-xs uppercase tracking-wide mb-0.5">{t("offers.school")}</p>
              <p className="font-medium text-ink">{offer.campus_name}</p>
            </div>
            <div>
              <p className="text-stone text-xs uppercase tracking-wide mb-0.5">{t("offers.deadline")}</p>
              <div>
                {offer.is_urgent ? (
                  <Badge variant="destructive" className="text-xs">
                    {offer.hours_remaining != null && offer.hours_remaining < 24
                      ? `${offer.hours_remaining}h left`
                      : `${offer.days_remaining} days left`}
                  </Badge>
                ) : (
                  <Badge variant="warning" className="text-xs">
                    {offer.days_remaining} days left
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-rooted-gray pt-3">
            <p className="text-xs text-stone">
              Respond by{" "}
              <span className={`font-semibold ${offer.is_urgent ? "text-red-600" : "text-ink"}`}>
                {formatExpiry(offer.expires_at)}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Urgency banner ── */}
      {offer.is_urgent && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <span>
            Your spot is waiting — accept your offer today to lock it in.
          </span>
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
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
        <Button
          size="lg"
          variant="outline"
          className="w-full text-base h-12"
          onClick={() => setShowDeclineDialog(true)}
          disabled={isPending}
        >
          {t("offers.decline")}
        </Button>
      </div>

      {/* ── What happens next ── */}
      <Card>
        <CardContent className="py-4 space-y-3">
          <p className="text-sm font-semibold text-ink">What happens when you accept?</p>
          <div className="space-y-2 text-sm text-ink/70">
            <div className="flex items-start gap-2">
              <span className="text-rooted-green mt-0.5 shrink-0">✓</span>
              <span>Your student's seat is secured at {offer.campus_name}.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rooted-green mt-0.5 shrink-0">✓</span>
              <span>You will be taken to the registration portal to complete enrollment paperwork.</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-rooted-green mt-0.5 shrink-0">✓</span>
              <span>Once registration is complete, enrollment is finalized.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Accept confirmation dialog ── */}
      <Dialog open={showAcceptDialog} onOpenChange={setShowAcceptDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("offers.acceptTitle")}</DialogTitle>
            <DialogDescription>
              You are accepting the enrollment offer for{" "}
              <strong>{offer.student_name}</strong> at{" "}
              <strong>{offer.campus_name}</strong> ({offer.grade}).
              You will be directed to complete the registration packet.
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("offers.declineTitle")}</DialogTitle>
            <DialogDescription>
              Are you sure you want to decline the offer for{" "}
              <strong>{offer.student_name}</strong> at{" "}
              <strong>{offer.campus_name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
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
