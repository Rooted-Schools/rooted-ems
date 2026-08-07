"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useLocale } from "@/lib/i18n/locale-context";
import type { TranslationKey } from "@/lib/i18n/translations";

export interface ExplainerCampus {
  id: string;
  name: string;
  tierLabels: string[];
  closeDate: string | null;
}

interface LotteryExplainerClientProps {
  campuses: ExplainerCampus[];
}

export function LotteryExplainerClient({ campuses }: LotteryExplainerClientProps) {
  const { t, locale } = useLocale();

  const steps: { title: TranslationKey; desc: TranslationKey }[] = [
    { title: "lottery.step1Title", desc: "lottery.step1Desc" },
    { title: "lottery.step2Title", desc: "lottery.step2Desc" },
    { title: "lottery.step3Title", desc: "lottery.step3Desc" },
    { title: "lottery.step4Title", desc: "lottery.step4Desc" },
  ];

  const faqs: { q: TranslationKey; a: TranslationKey }[] = [
    { q: "lottery.faq1q", a: "lottery.faq1a" },
    { q: "lottery.faq2q", a: "lottery.faq2a" },
    { q: "lottery.faq3q", a: "lottery.faq3a" },
    { q: "lottery.faq4q", a: "lottery.faq4a" },
    { q: "lottery.faq5q", a: "lottery.faq5a" },
    { q: "lottery.faq6q", a: "lottery.faq6a" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-rooted-green/5 to-warm-white py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-rooted-green hover:underline">
            &larr; {t("inquiry.backHome")}
          </Link>
          <LanguageToggle />
        </div>

        {/* Title + subtitle */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("lottery.title")}</CardTitle>
            <CardDescription>{t("lottery.subtitle")}</CardDescription>
          </CardHeader>
        </Card>

        {/* Why a lottery */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("lottery.whyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-ink/70">{t("lottery.whyBody")}</p>
          </CardContent>
        </Card>

        {/* Four-step timeline */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {steps.map((s, i) => (
                <div key={s.title} className="flex gap-3">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold shrink-0 mt-0.5 bg-rooted-green text-white">
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">{t(s.title)}</p>
                    <p className="text-xs text-stone-text mt-0.5">{t(s.desc)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Per-campus priority groups */}
        {campuses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("lottery.priorityGroupsTitle")}</CardTitle>
              <CardDescription>{t("lottery.tiersNote")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {campuses.map((campus) => (
                <div key={campus.id} className="rounded-lg border border-stone/20 p-4">
                  <p className="text-sm font-semibold text-ink mb-2">{campus.name}</p>
                  <ol className="list-decimal list-inside text-sm text-ink/70 space-y-1">
                    {campus.tierLabels.map((label, i) => (
                      <li key={i}>{label}</li>
                    ))}
                    <li>{t("lottery.generalPool")}</li>
                  </ol>
                  {campus.closeDate && (
                    <p className="text-xs text-stone-text mt-2">
                      {t("lottery.closesLine").replace(
                        "{date}",
                        new Date(campus.closeDate).toLocaleDateString(
                          locale === "es" ? "es-US" : "en-US",
                          { month: "long", day: "numeric", year: "numeric" }
                        )
                      )}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Our promises */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("lottery.promisesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-sm text-ink/70 space-y-2 list-disc list-inside">
              <li>{t("lottery.promise1")}</li>
              <li>{t("lottery.promise2")}</li>
              <li>{t("lottery.promise3")}</li>
            </ul>
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("lottery.faqTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {faqs.map((f) => (
              <details key={f.q} className="border border-stone/20 rounded-lg">
                <summary className="px-4 py-3 cursor-pointer font-medium text-ink">
                  {t(f.q)}
                </summary>
                <p className="px-4 pb-3 text-sm text-ink/70">{t(f.a)}</p>
              </details>
            ))}
          </CardContent>
        </Card>

        {/* CTA */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-base">{t("lottery.ctaTitle")}</CardTitle>
            <CardDescription>{t("lottery.ctaBody")}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/login">
              <Button className="w-full sm:w-auto">{t("lottery.startApplication")}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
