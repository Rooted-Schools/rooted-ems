"use client";

import { useLocale } from "@/lib/i18n/locale-context";

/**
 * The 5-step "How Enrollment Works" explainer, shared by the network landing
 * page (app/(public)/landing-client.tsx) and every per-campus landing page
 * (app/(public)/[campusSlug]/campus-landing-client.tsx) so the steps stay in
 * sync in one place. Must render inside a LocaleProvider.
 */
export function HowEnrollmentWorksSection() {
  const { t } = useLocale();

  const steps = [
    { step: 1, title: t("public.step1Title"), desc: t("public.step1Desc") },
    { step: 2, title: t("public.step2Title"), desc: t("public.step2Desc") },
    { step: 3, title: t("public.step3Title"), desc: t("public.step3Desc") },
    { step: 4, title: t("public.step4Title"), desc: t("public.step4Desc") },
    { step: 5, title: t("public.step5Title"), desc: t("public.step5Desc") },
  ];

  return (
    <section className="py-16 bg-rooted-gray-light">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-2xl font-bold text-ink text-center mb-10">
          {t("public.howItWorks")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {steps.map((s) => (
            <div key={s.step} className="text-center">
              <div className="w-10 h-10 rounded-full bg-deep-green text-white flex items-center justify-center text-sm font-bold mx-auto mb-3">
                {s.step}
              </div>
              <p className="text-sm font-semibold text-ink">{s.title}</p>
              <p className="text-xs text-stone-text mt-1">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
