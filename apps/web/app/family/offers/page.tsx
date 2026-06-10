export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getFamilyPendingOffers } from "@/lib/queries";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLocale } from "@/lib/i18n/get-locale";
import { tx } from "@/lib/i18n/translations";

export default async function FamilyOffersPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const locale = await getLocale();
  const t = (key: Parameters<typeof tx>[0]) => tx(key, locale);

  const offers = await getFamilyPendingOffers(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t("offers.heading")}</h1>
        <p className="text-sm text-stone mt-1">
          {t("offers.subtitle")}
        </p>
      </div>

      {offers.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <div className="text-3xl">📬</div>
            <p className="text-sm text-stone">
              {t("offers.noPending")}
            </p>
            <Link href="/family/dashboard">
              <Button variant="outline">{t("common.backToDashboard")}</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {offers.map((offer) => (
            <Card
              key={offer.id}
              className={offer.is_urgent ? "border-red-200 bg-red-50/30" : ""}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <p className="font-semibold text-ink">{offer.student_name}</p>
                    <p className="text-sm text-stone">
                      {offer.grade} · {offer.campus_name}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      {offer.is_urgent ? (
                        <Badge variant="destructive" className="text-xs">
                          {offer.days_remaining === 0
                            ? t("offers.expiresToday")
                            : offer.days_remaining === 1
                              ? t("offers.oneDayLeft")
                              : `${offer.days_remaining} ${t("offers.daysLeftSuffix")}`}
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">
                          {offer.days_remaining} {t("offers.daysToRespond")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Link href={`/family/offers/${offer.id}`} className="shrink-0">
                    <Button
                      className={
                        offer.is_urgent
                          ? "bg-red-600 hover:bg-red-700 text-white"
                          : "bg-rooted-green hover:bg-rooted-green/90 text-white"
                      }
                    >
                      {t("dashboard.respond")}
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
