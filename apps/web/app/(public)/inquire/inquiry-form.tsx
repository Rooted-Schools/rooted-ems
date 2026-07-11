"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useLocale } from "@/lib/i18n/locale-context";
import { submitInquiry } from "./actions";

interface CampusOption {
  id: string;
  name: string;
  location: string;
}

const GRADE_OPTIONS = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

interface InquiryFormProps {
  campuses: CampusOption[];
  /** When arriving via /refer/[code]: the referrer's first name for the banner. */
  referrerName?: string;
  referredByLeadId?: string;
  /** Referral links lock the campus to the referrer's campus. */
  lockedCampusId?: string;
  /** LG-1: ?src= tag identifying the page/flyer/campaign that sent this lead. */
  sourceTag?: string;
  /** LG-1: ?campus= preselection (still editable by the family). */
  preselectedCampusId?: string;
}

export function InquiryForm({ campuses, referrerName, referredByLeadId, lockedCampusId, sourceTag, preselectedCampusId }: InquiryFormProps) {
  const { t, locale } = useLocale();
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    sms_consent: false,
    campus_id: lockedCampusId ?? preselectedCampusId ?? (campuses.length === 1 ? campuses[0].id : ""),
    student_first_name: "",
    entry_grade: "",
    pathway_interest: "",
    source: "",
    website: "", // honeypot
  });

  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  // LG-1: when embedded on a school website (via /embed/inquiry), post the
  // rendered height so the host iframe can size itself with no scrollbars.
  const embedded = typeof window !== "undefined" && window.parent !== window;
  useEffect(() => {
    if (!embedded) return;
    const post = () =>
      window.parent.postMessage({ rootedInquiryHeight: document.body.scrollHeight }, "*");
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [embedded, submitted, error, showValidation]);

  const missingRequired =
    !form.first_name.trim() ||
    !form.last_name.trim() ||
    !form.campus_id ||
    (!form.email.trim() && !form.phone.trim());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (missingRequired) {
      setShowValidation(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitInquiry({
        ...form,
        preferred_language: locale,
        source: form.source || "website",
        referred_by_lead_id: referredByLeadId,
        source_tag: sourceTag,
      });
      if (result.error) {
        setError(result.error);
      } else {
        setSubmitted(true);
      }
    });
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rooted-green/5 to-warm-white flex items-center justify-center px-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-10 space-y-4">
            <div className="text-4xl">🌱</div>
            <h1 className="text-xl font-bold text-ink">{t("inquiry.thanksTitle")}</h1>
            <p className="text-sm text-ink/70">{t("inquiry.thanksBody")}</p>
            <div className="flex flex-col gap-2 pt-2">
              <Link href="/login">
                <Button className="w-full">{t("public.applyNow")}</Button>
              </Link>
              <Link href="/" className="text-sm text-rooted-green hover:underline">
                {t("inquiry.backHome")}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fieldError = (missing: boolean) =>
    showValidation && missing ? "border-red-400" : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-rooted-green/5 to-warm-white py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-rooted-green hover:underline">
            &larr; {t("inquiry.backHome")}
          </Link>
          <LanguageToggle />
        </div>

        {referrerName && (
          <div className="rounded-xl border border-rooted-green/30 bg-rooted-green/5 px-4 py-3 mb-3 text-center">
            <p className="text-sm text-ink">
              🌱 <span className="font-semibold">{referrerName}</span>{" "}
              {locale === "es"
                ? "cree que su familia sería ideal para Rooted. ¡Cuéntenos sobre usted!"
                : "thinks your family would be a great fit for Rooted. Tell us about yourself!"}
            </p>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("inquiry.title")}</CardTitle>
            <CardDescription>{t("inquiry.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Honeypot — visually hidden, tab-skipped; humans never touch it */}
              <div className="absolute -left-[9999px]" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.website}
                  onChange={(e) => update({ website: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="inq-first" className="block text-sm font-medium text-ink/70 mb-1">
                    {t("inquiry.firstName")} <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="inq-first"
                    value={form.first_name}
                    onChange={(e) => update({ first_name: e.target.value })}
                    className={fieldError(!form.first_name.trim())}
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <label htmlFor="inq-last" className="block text-sm font-medium text-ink/70 mb-1">
                    {t("inquiry.lastName")} <span className="text-red-500">*</span>
                  </label>
                  <Input
                    id="inq-last"
                    value={form.last_name}
                    onChange={(e) => update({ last_name: e.target.value })}
                    className={fieldError(!form.last_name.trim())}
                    autoComplete="family-name"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="inq-email" className="block text-sm font-medium text-ink/70 mb-1">
                  {t("inquiry.email")}
                </label>
                <Input
                  id="inq-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update({ email: e.target.value })}
                  className={fieldError(!form.email.trim() && !form.phone.trim())}
                  autoComplete="email"
                  inputMode="email"
                />
              </div>

              <div>
                <label htmlFor="inq-phone" className="block text-sm font-medium text-ink/70 mb-1">
                  {t("inquiry.phone")}
                </label>
                <Input
                  id="inq-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                  className={fieldError(!form.email.trim() && !form.phone.trim())}
                  placeholder="(555) 555-0100"
                  autoComplete="tel"
                  inputMode="tel"
                />
                {showValidation && !form.email.trim() && !form.phone.trim() && (
                  <p className="text-xs text-red-600 mt-1">{t("inquiry.contactRequired")}</p>
                )}
              </div>

              {form.phone.trim() && (
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="inq-sms"
                    checked={form.sms_consent}
                    onChange={(e) => update({ sms_consent: e.target.checked })}
                    className="mt-1 h-4 w-4 rounded border-stone/40 text-rooted-green focus:ring-rooted-green"
                  />
                  <label htmlFor="inq-sms" className="text-sm text-ink/80">
                    {t("inquiry.smsConsent")}
                  </label>
                </div>
              )}

              <div>
                <label htmlFor="inq-campus" className="block text-sm font-medium text-ink/70 mb-1">
                  {t("inquiry.campus")} <span className="text-red-500">*</span>
                </label>
                <Select
                  id="inq-campus"
                  value={form.campus_id}
                  onChange={(e) => update({ campus_id: e.target.value })}
                  className={fieldError(!form.campus_id)}
                >
                  <option value="">{t("inquiry.selectCampus")}</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.location ? ` — ${c.location}` : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="inq-student" className="block text-sm font-medium text-ink/70 mb-1">
                    {t("inquiry.studentName")}
                  </label>
                  <Input
                    id="inq-student"
                    value={form.student_first_name}
                    onChange={(e) => update({ student_first_name: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="inq-grade" className="block text-sm font-medium text-ink/70 mb-1">
                    {t("inquiry.grade")}
                  </label>
                  <Select
                    id="inq-grade"
                    value={form.entry_grade}
                    onChange={(e) => update({ entry_grade: e.target.value })}
                  >
                    <option value="">—</option>
                    {GRADE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g === "K" ? t("inquiry.kindergarten") : `${t("inquiry.gradePrefix")} ${g}`}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label htmlFor="inq-pathway" className="block text-sm font-medium text-ink/70 mb-1">
                  {t("inquiry.pathway")}
                </label>
                <Select
                  id="inq-pathway"
                  value={form.pathway_interest}
                  onChange={(e) => update({ pathway_interest: e.target.value })}
                >
                  <option value="">{t("inquiry.notSure")}</option>
                  <option value="healthcare">{t("inquiry.pathwayHealthcare")}</option>
                  <option value="technology">{t("inquiry.pathwayTech")}</option>
                  <option value="advanced_manufacturing">{t("inquiry.pathwayManufacturing")}</option>
                  <option value="entrepreneurship">{t("inquiry.pathwayEntrepreneurship")}</option>
                </Select>
              </div>

              <div>
                <label htmlFor="inq-source" className="block text-sm font-medium text-ink/70 mb-1">
                  {t("inquiry.source")}
                </label>
                <Select
                  id="inq-source"
                  value={form.source}
                  onChange={(e) => update({ source: e.target.value })}
                >
                  <option value="">—</option>
                  <option value="referral">{t("inquiry.sourceReferral")}</option>
                  <option value="event">{t("inquiry.sourceEvent")}</option>
                  <option value="ad">{t("inquiry.sourceSocial")}</option>
                  <option value="qr">{t("inquiry.sourceFlyer")}</option>
                  <option value="website">{t("inquiry.sourceSearch")}</option>
                  <option value="other">{t("inquiry.sourceOther")}</option>
                </Select>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? t("inquiry.sending") : t("inquiry.submit")}
              </Button>
              <p className="text-xs text-stone text-center">{t("inquiry.responsePromise")}</p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
