"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  CAMPAIGN_TEMPLATES,
  renderCampaignEmail,
  type CampaignPayload,
  type CampaignTemplateKey,
} from "@/lib/email-templates";
import { staffCountAudience, staffCreateCampaign, staffSendCampaignTest } from "./actions";

const AUDIENCE_OPTIONS = [
  { value: "open", label: "All open leads", hint: "new + contacted + engaged" },
  { value: "new", label: "New only", hint: "never contacted" },
  { value: "contacted", label: "Contacted", hint: "spoke once, keep warming" },
  { value: "engaged", label: "Engaged", hint: "warm — push to apply" },
] as const;

interface CampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campuses: { id: string; name: string }[];
  staffUserId: string;
}

export function CampaignDialog({ open, onOpenChange, campuses, staffUserId }: CampaignDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [campusId, setCampusId] = useState(campuses.length === 1 ? campuses[0].id : "");
  const [audience, setAudience] = useState<"open" | "new" | "contacted" | "engaged">("open");
  const [count, setCount] = useState<number | null>(null);
  const [templateKey, setTemplateKey] = useState<CampaignTemplateKey>("reintroduction");
  const [payload, setPayload] = useState<CampaignPayload>({});
  const [name, setName] = useState("");
  const [dailyLimit, setDailyLimit] = useState("150");
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<number | null>(null);

  const campusName = campuses.find((c) => c.id === campusId)?.name ?? "your school";

  // Live audience count whenever campus/audience changes
  useEffect(() => {
    if (!open || !campusId) return;
    setCount(null);
    staffCountAudience(campusId, audience).then(setCount).catch(() => setCount(null));
  }, [open, campusId, audience]);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
      setTestStatus(null);
      setLaunched(null);
      setPayload({});
      setName("");
      setDailyLimit("150");
    }
  }, [open]);

  const preview = useMemo(() => {
    try {
      return renderCampaignEmail(templateKey, payload, campusName);
    } catch {
      return null;
    }
  }, [templateKey, payload, campusName]);

  const templateReady =
    templateKey === "custom"
      ? !!(payload.subject?.trim() && payload.bodyEn?.trim())
      : templateKey === "event_invite"
        ? !!payload.eventName?.trim()
        : templateKey === "deadline"
          ? !!payload.deadline?.trim()
          : true;

  const updatePayload = (patch: Partial<CampaignPayload>) =>
    setPayload((p) => ({ ...p, ...patch }));

  function sendTest() {
    setTestStatus("sending");
    startTransition(async () => {
      const result = await staffSendCampaignTest(templateKey, payload, campusName);
      setTestStatus(result.error ? `Failed: ${result.error}` : "Test sent — check your inbox!");
    });
  }

  function launch() {
    if (!campusId || !templateReady) return;
    setError(null);
    startTransition(async () => {
      const result = await staffCreateCampaign(
        {
          campus_id: campusId,
          name: name.trim() || `${CAMPAIGN_TEMPLATES[templateKey].label} — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
          template_key: templateKey,
          payload,
          audience_stage: audience,
          daily_limit: parseInt(dailyLimit, 10) || 150,
        },
        staffUserId
      );
      if (result.error) {
        setError(result.error);
      } else {
        setLaunched(result.data?.recipients ?? 0);
        router.refresh();
      }
    });
  }

  const days = count && parseInt(dailyLimit, 10) > 0 ? Math.ceil(count / parseInt(dailyLimit, 10)) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {launched !== null ? (
          <>
            <DialogHeader>
              <DialogTitle>Campaign launched</DialogTitle>
              <DialogDescription>
                {launched.toLocaleString()} famil{launched === 1 ? "y" : "ies"} enrolled. Sending starts
                with today&apos;s batch and continues automatically at {dailyLimit}/day. Every send
                appears on the family&apos;s timeline, and replies go to your campus inbox.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Email families</DialogTitle>
              <DialogDescription>
                Step {step} of 3 — {step === 1 ? "choose your audience" : step === 2 ? "pick a template" : "review and launch"}
              </DialogDescription>
            </DialogHeader>

            {/* ── Step 1: Audience ── */}
            {step === 1 && (
              <div className="space-y-4 py-2">
                {campuses.length > 1 && (
                  <div>
                    <label htmlFor="camp-campus" className="block text-sm font-medium text-ink/70 mb-1">Campus</label>
                    <Select id="camp-campus" value={campusId} onChange={(e) => setCampusId(e.target.value)}>
                      <option value="">Choose…</option>
                      {campuses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                        audience === opt.value ? "border-rooted-green bg-rooted-green/5" : "border-stone/20 hover:border-stone/40"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="audience"
                          checked={audience === opt.value}
                          onChange={() => setAudience(opt.value)}
                          className="h-4 w-4 text-rooted-green focus:ring-rooted-green"
                        />
                        <span>
                          <span className="text-sm font-medium text-ink block">{opt.label}</span>
                          <span className="text-xs text-stone">{opt.hint}</span>
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {campusId && (
                  <p className="text-sm text-ink/70 bg-stone/5 rounded-md px-3 py-2">
                    {count === null ? "Counting…" : `${count.toLocaleString()} famil${count === 1 ? "y" : "ies"} with an email address will receive this.`}
                  </p>
                )}
              </div>
            )}

            {/* ── Step 2: Template ── */}
            {step === 2 && (
              <div className="space-y-2 py-2">
                {(Object.entries(CAMPAIGN_TEMPLATES) as [CampaignTemplateKey, { label: string; description: string }][]).map(
                  ([key, meta]) => (
                    <label
                      key={key}
                      className={`block rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                        templateKey === key ? "border-rooted-green bg-rooted-green/5" : "border-stone/20 hover:border-stone/40"
                      }`}
                    >
                      <span className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="template"
                          checked={templateKey === key}
                          onChange={() => setTemplateKey(key)}
                          className="mt-1 h-4 w-4 text-rooted-green focus:ring-rooted-green"
                        />
                        <span>
                          <span className="text-sm font-medium text-ink block">{meta.label}</span>
                          <span className="text-xs text-stone">{meta.description}</span>
                        </span>
                      </span>
                    </label>
                  )
                )}
                <p className="text-xs text-stone pt-1">
                  Every template is bilingual (English + Spanish), Rooted-branded, and includes an opt-out line. Replies go to your campus inbox.
                </p>
              </div>
            )}

            {/* ── Step 3: Details, preview, launch ── */}
            {step === 3 && (
              <div className="space-y-3 py-2">
                {templateKey === "event_invite" && (
                  <>
                    <div>
                      <label htmlFor="camp-event" className="block text-sm font-medium text-ink/70 mb-1">Event name *</label>
                      <Input id="camp-event" value={payload.eventName ?? ""} onChange={(e) => updatePayload({ eventName: e.target.value })} placeholder="Open House" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="camp-date" className="block text-sm font-medium text-ink/70 mb-1">Date &amp; time</label>
                        <Input id="camp-date" value={payload.eventDate ?? ""} onChange={(e) => updatePayload({ eventDate: e.target.value })} placeholder="Sat, July 19 · 10am" />
                      </div>
                      <div>
                        <label htmlFor="camp-loc" className="block text-sm font-medium text-ink/70 mb-1">Location</label>
                        <Input id="camp-loc" value={payload.eventLocation ?? ""} onChange={(e) => updatePayload({ eventLocation: e.target.value })} placeholder="1225 Laurel St" />
                      </div>
                    </div>
                  </>
                )}
                {templateKey === "deadline" && (
                  <div>
                    <label htmlFor="camp-deadline" className="block text-sm font-medium text-ink/70 mb-1">Deadline *</label>
                    <Input id="camp-deadline" value={payload.deadline ?? ""} onChange={(e) => updatePayload({ deadline: e.target.value })} placeholder="Friday, August 1" />
                  </div>
                )}
                {templateKey === "custom" && (
                  <>
                    <div>
                      <label htmlFor="camp-subject" className="block text-sm font-medium text-ink/70 mb-1">Subject *</label>
                      <Input id="camp-subject" value={payload.subject ?? ""} onChange={(e) => updatePayload({ subject: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="camp-body-en" className="block text-sm font-medium text-ink/70 mb-1">Message (English) *</label>
                      <textarea
                        id="camp-body-en"
                        value={payload.bodyEn ?? ""}
                        onChange={(e) => updatePayload({ bodyEn: e.target.value })}
                        rows={4}
                        className="w-full rounded-md border border-stone/30 px-3 py-2 text-sm focus:border-rooted-green focus:outline-none focus:ring-1 focus:ring-rooted-green"
                        placeholder="Blank line between paragraphs."
                      />
                    </div>
                    <div>
                      <label htmlFor="camp-body-es" className="block text-sm font-medium text-ink/70 mb-1">Message (Spanish) — optional, English used if blank</label>
                      <textarea
                        id="camp-body-es"
                        value={payload.bodyEs ?? ""}
                        onChange={(e) => updatePayload({ bodyEs: e.target.value })}
                        rows={4}
                        className="w-full rounded-md border border-stone/30 px-3 py-2 text-sm focus:border-rooted-green focus:outline-none focus:ring-1 focus:ring-rooted-green"
                      />
                    </div>
                  </>
                )}

                {/* Live preview */}
                {preview && templateReady && (
                  <div className="rounded-lg border border-stone/20 bg-stone/5 px-3 py-2.5">
                    <p className="text-xs text-stone mb-1">Preview</p>
                    <p className="text-sm font-semibold text-ink">{preview.subject}</p>
                    <p className="text-sm text-ink/70 mt-1 line-clamp-3 whitespace-pre-line">
                      {preview.text.split("\n\n").slice(1, 3).join("\n\n")}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="camp-name" className="block text-sm font-medium text-ink/70 mb-1">Campaign name</label>
                    <Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={CAMPAIGN_TEMPLATES[templateKey].label} />
                  </div>
                  <div>
                    <label htmlFor="camp-limit" className="block text-sm font-medium text-ink/70 mb-1">Emails per day</label>
                    <Input id="camp-limit" type="number" min={10} max={500} value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} />
                  </div>
                </div>

                <p className="text-xs text-stone">
                  {count?.toLocaleString() ?? "…"} recipients at {dailyLimit}/day
                  {days ? ` — finishes in about ${days} day${days === 1 ? "" : "s"}.` : "."} Daily pacing protects
                  email deliverability; you can cancel anytime.
                </p>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={sendTest} disabled={isPending || !templateReady}>
                    Send me a test
                  </Button>
                  {testStatus && <span className="text-xs text-stone">{testStatus === "sending" ? "Sending…" : testStatus}</span>}
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              {step > 1 && (
                <Button variant="outline" onClick={() => setStep(step - 1)} disabled={isPending}>
                  Back
                </Button>
              )}
              {step < 3 ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 && (!campusId || count === 0)}
                >
                  Next
                </Button>
              ) : (
                <Button onClick={launch} disabled={isPending || !templateReady || !count}>
                  {isPending ? "Launching…" : `Launch to ${count?.toLocaleString() ?? "…"} families`}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
