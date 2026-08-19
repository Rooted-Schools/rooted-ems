"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { IconInfo } from "@/components/ui/icons";
import { renderCampaignEmail, UNSUB_PLACEHOLDER, type CampaignPayload } from "@/lib/email-templates";
import type { JourneyStepPreview } from "@/lib/queries/journeys";
import { staffUpdateJourneyStepContent } from "../actions";
import {
  validateStepContent,
  refusalForTemplateKey,
  SUBJECT_MAX_LENGTH,
  BODY_MAX_LENGTH,
} from "../step-content-rules";

/**
 * One journey step, either as an editor (template_key "custom", the wording
 * lives in journey_step.payload) or as a read-only rendering (a built-in
 * template, the wording lives in lib/email-templates.ts).
 *
 * The preview is the same renderCampaignEmail call the send cron makes, run
 * against whatever is currently in the boxes, so what staff read is what the
 * family would receive. It renders inside a sandboxed iframe: email HTML is
 * still HTML, and nothing in a preview should be able to run.
 */

const TEXTAREA_CLASS =
  "w-full rounded-[6px] border border-stone/30 bg-white px-3 py-2 text-sm text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent";

const LABEL_CLASS = "block text-sm font-medium text-ink/70 mb-1";

/**
 * The live unsubscribe URL is stamped in per-family at send time. In a
 * preview there is no family, so the placeholder is pointed at "#": the link
 * looks exactly as it will in the real email, and clicking it in the preview
 * does nothing rather than going somewhere wrong.
 */
function previewHtml(html: string): string {
  return html.replaceAll(UNSUB_PLACEHOLDER, "#");
}

function PreviewFrame({ html, title }: { html: string; title: string }) {
  return (
    <iframe
      // sandbox="" is the whole point: no scripts, no forms, no navigation,
      // no same-origin access. A preview renders content, it does not run it.
      sandbox=""
      srcDoc={previewHtml(html)}
      title={title}
      className="h-[440px] w-full rounded-[6px] border border-line bg-white"
    />
  );
}

function StepHeading({ step }: { step: JourneyStepPreview }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-ink">
        Step {step.step_order}: {step.template_label}
      </p>
      <p className="mt-0.5 text-xs text-stone-text">
        Sends {step.delay_label} ({step.delay_days} day{step.delay_days === 1 ? "" : "s"})
      </p>
    </div>
  );
}

/** A step whose wording is not stored in the database. Shown, not edited. */
function ReadOnlyStep({ step }: { step: JourneyStepPreview }) {
  return (
    <div className="rounded-[6px] border border-line bg-white p-4">
      <StepHeading step={step} />

      <p className="mt-3 flex items-start gap-1.5 rounded-[6px] border border-line bg-sunken px-3 py-2 text-xs text-stone-text">
        <IconInfo size={14} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          {refusalForTemplateKey(step.template_key) ??
            "This step cannot be edited here."}{" "}
          The preview below is the real message this step sends.
        </span>
      </p>

      {step.preview_unavailable || !step.preview_html ? (
        <p className="mt-3 text-xs italic text-stone-text">
          Preview unavailable. &ldquo;{step.template_key}&rdquo; is not a template this app knows how to
          render, so there is nothing honest to show here.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-stone">Subject</p>
            <p className="mt-0.5 text-sm font-medium text-ink">{step.subject}</p>
          </div>
          <PreviewFrame html={step.preview_html} title={`Step ${step.step_order} email preview`} />
        </div>
      )}
    </div>
  );
}

interface EditableStepProps {
  journeyId: string;
  step: JourneyStepPreview;
  previewCampusName: string;
}

function EditableStep({ journeyId, step, previewCampusName }: EditableStepProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  // Pre-filled from the real saved payload, so an edit starts from the current
  // wording. A blank box here would mean "save" quietly wipes live copy.
  const [subject, setSubject] = useState(step.payload.subject ?? "");
  const [bodyEn, setBodyEn] = useState(step.payload.bodyEn ?? "");
  const [bodyEs, setBodyEs] = useState(step.payload.bodyEs ?? "");
  const [ctaLabel, setCtaLabel] = useState(step.payload.ctaLabel ?? "");
  const [ctaUrl, setCtaUrl] = useState(step.payload.ctaUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  const saved = {
    subject: step.payload.subject ?? "",
    bodyEn: step.payload.bodyEn ?? "",
    bodyEs: step.payload.bodyEs ?? "",
    ctaLabel: step.payload.ctaLabel ?? "",
    ctaUrl: step.payload.ctaUrl ?? "",
  };
  const dirty =
    subject !== saved.subject ||
    bodyEn !== saved.bodyEn ||
    bodyEs !== saved.bodyEs ||
    ctaLabel !== saved.ctaLabel ||
    ctaUrl !== saved.ctaUrl;

  // The preview always renders from what is in the boxes right now, including
  // the renderer's own fallbacks (a blank subject shows the default subject a
  // real send would use, a blank Spanish body shows the English text where the
  // Spanish would go). That second fallback is exactly the failure the
  // required-Spanish rule prevents, and seeing it is the point.
  const preview = useMemo(() => {
    const payload: CampaignPayload = {
      subject: subject.trim() || undefined,
      bodyEn,
      bodyEs,
      ctaLabel: ctaLabel.trim() || undefined,
      ctaUrl: ctaUrl.trim() || undefined,
    };
    return renderCampaignEmail("custom", payload, previewCampusName);
  }, [subject, bodyEn, bodyEs, ctaLabel, ctaUrl, previewCampusName]);

  function save() {
    // Same rules the server runs. This is a courtesy, not the gate:
    // updateJourneyStepContent validates again before it writes anything.
    const check = validateStepContent({ subject, bodyEn, bodyEs, ctaLabel, ctaUrl });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await staffUpdateJourneyStepContent(journeyId, {
        stepId: step.id,
        subject,
        bodyEn,
        bodyEs,
        ctaLabel,
        ctaUrl,
      });
      if (result.error) {
        setError(result.error);
        toast({ variant: "error", title: "Step not saved", description: result.error });
        return;
      }
      toast({
        variant: "success",
        title: `Step ${step.step_order} saved`,
        description: "Families who have not reached this step yet will receive the new wording.",
      });
      router.refresh();
    });
  }

  function discard() {
    setSubject(saved.subject);
    setBodyEn(saved.bodyEn);
    setBodyEs(saved.bodyEs);
    setCtaLabel(saved.ctaLabel);
    setCtaUrl(saved.ctaUrl);
    setError(null);
  }

  const fieldId = (name: string) => `step-${step.id}-${name}`;

  return (
    <div className="rounded-[6px] border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <StepHeading step={step} />
        {dirty && <span className="text-xs font-medium text-warn-text">Unsaved changes</span>}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Editor */}
        <div className="space-y-3">
          <div>
            <label htmlFor={fieldId("subject")} className={LABEL_CLASS}>
              Subject
            </label>
            <Input
              id={fieldId("subject")}
              value={subject}
              maxLength={SUBJECT_MAX_LENGTH}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Leave blank to use the default subject"
            />
            <p className="mt-1 text-xs text-stone-text">
              {subject.trim().length}/{SUBJECT_MAX_LENGTH} characters. Leave it blank and the email goes
              out with the default subject line shown in the preview.
            </p>
          </div>

          <div>
            <label htmlFor={fieldId("body-en")} className={LABEL_CLASS}>
              Body (English)
            </label>
            <textarea
              id={fieldId("body-en")}
              value={bodyEn}
              rows={7}
              maxLength={BODY_MAX_LENGTH}
              onChange={(e) => setBodyEn(e.target.value)}
              className={TEXTAREA_CLASS}
              placeholder="Separate paragraphs with a blank line."
            />
            <p className="mt-1 text-xs text-stone-text">
              Separate paragraphs with a blank line. {bodyEn.trim().length}/{BODY_MAX_LENGTH} characters.
            </p>
          </div>

          <div>
            <label htmlFor={fieldId("body-es")} className={LABEL_CLASS}>
              Body (Spanish)
            </label>
            <textarea
              id={fieldId("body-es")}
              value={bodyEs}
              rows={7}
              maxLength={BODY_MAX_LENGTH}
              onChange={(e) => setBodyEs(e.target.value)}
              className={TEXTAREA_CLASS}
              placeholder="Separate paragraphs with a blank line."
            />
            <p className="mt-1 text-xs text-stone-text">
              Spanish is required. Every journey email carries both languages, English first and then
              Spanish, so leaving this blank puts the English text in the Spanish half and families who
              read Spanish get an email they cannot read. Separate paragraphs with a blank line.{" "}
              {bodyEs.trim().length}/{BODY_MAX_LENGTH} characters.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={fieldId("cta-label")} className={LABEL_CLASS}>
                Button label (optional)
              </label>
              <Input
                id={fieldId("cta-label")}
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="Start your application"
              />
            </div>
            <div>
              <label htmlFor={fieldId("cta-url")} className={LABEL_CLASS}>
                Button URL (optional)
              </label>
              <Input
                id={fieldId("cta-url")}
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="https://"
              />
            </div>
          </div>
          <p className="text-xs text-stone-text">
            A button needs both a label and a URL, or neither. The URL has to start with https://
            . Clear both to remove the button.
          </p>

          {error && (
            <p className="rounded-[6px] border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={save} disabled={isPending || !dirty}>
              {isPending ? "Saving..." : "Save step"}
            </Button>
            <Button variant="outline" onClick={discard} disabled={isPending || !dirty}>
              Discard changes
            </Button>
          </div>
        </div>

        {/* Live preview */}
        <div className="space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-stone">
              Preview subject
            </p>
            <p className="mt-0.5 text-sm font-medium text-ink">{preview.subject}</p>
          </div>
          <PreviewFrame html={preview.html} title={`Step ${step.step_order} email preview`} />
          <p className="text-xs text-stone-text">
            This is the real template rendered with what is in the boxes right now. Actual sends use
            each family&apos;s own campus name; this preview uses {previewCampusName}.
          </p>
        </div>
      </div>
    </div>
  );
}

export function JourneyStepEditor({
  journeyId,
  step,
  previewCampusName,
}: {
  journeyId: string;
  step: JourneyStepPreview;
  previewCampusName: string;
}) {
  if (!step.is_editable) return <ReadOnlyStep step={step} />;
  return <EditableStep journeyId={journeyId} step={step} previewCampusName={previewCampusName} />;
}
