"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import {
  IconSprout,
  IconMail,
  IconMessageSquare,
  IconPhone,
  IconPenLine,
  IconArrowLeftRight,
  IconRefreshCw,
  IconCheckCircle,
  IconClipboardList,
  IconBan,
} from "@/components/ui/icons";
import type { LeadDetail } from "@/lib/queries/leads";
import { formatRelativeTime } from "@/lib/queries/utils";
import { staffDeleteLead, staffGetReferralLink, staffLogLeadActivity, staffUpdateLead } from "../actions";
import { PATHWAY_LABELS, SOURCE_LABELS, STAGE_CONFIG } from "../recruitment-client";

const ACTIVITY_ICONS: Record<string, ReactNode> = {
  inquiry: <IconSprout size={16} />,
  email: <IconMail size={16} />,
  sms: <IconMessageSquare size={16} />,
  call: <IconPhone size={16} />,
  note: <IconPenLine size={16} />,
  stage_change: <IconArrowLeftRight size={16} />,
  reengagement: <IconRefreshCw size={16} />,
  converted: <IconCheckCircle size={16} />,
};

const FOLLOW_UP_OPTIONS = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "Next week", days: 7 },
  { label: "No follow-up needed", days: null },
] as const;

export function LeadDetailClient({
  lead,
  staffUserId,
}: {
  lead: LeadDetail | null;
  staffUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [logOpen, setLogOpen] = useState(false);
  const [logType, setLogType] = useState<"call" | "note">("call");
  const [logBody, setLogBody] = useState("");
  const [logFollowUpDays, setLogFollowUpDays] = useState<number | null>(3);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(lead?.referral_code ?? null);
  const [linkCopied, setLinkCopied] = useState(false);

  const appBase = process.env.NEXT_PUBLIC_APP_URL ?? "https://enroll.rootedschool.org";
  const referralLink = referralCode ? `${appBase}/refer/${referralCode}` : null;

  function getReferralLink() {
    if (!lead) return;
    startTransition(async () => {
      const result = await staffGetReferralLink(lead.id);
      if (result.data?.code) setReferralCode(result.data.code);
    });
  }

  if (!lead) {
    return (
      <div className="space-y-6">
        <Link href="/staff/recruitment" className="text-sm text-rooted-green hover:underline">
          &larr; Back to Recruitment
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-stone">Lead not found, or you don&apos;t have access to this campus.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cfg = STAGE_CONFIG[lead.stage] ?? STAGE_CONFIG.new;

  function openLog(type: "call" | "note") {
    setLogType(type);
    setLogBody("");
    setLogFollowUpDays(type === "call" ? 3 : null);
    setError(null);
    setLogOpen(true);
  }

  function submitLog() {
    if (!lead) return;
    if (!logBody.trim()) {
      setError("Add a quick note about what happened.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await staffLogLeadActivity(lead.id, logType, logBody.trim(), staffUserId);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (logFollowUpDays !== undefined) {
        const next =
          logFollowUpDays === null
            ? null
            : new Date(Date.now() + logFollowUpDays * 24 * 60 * 60 * 1000).toISOString();
        await staffUpdateLead(lead.id, { next_follow_up_at: next }, staffUserId);
      }
      setLogOpen(false);
      router.refresh();
    });
  }

  function doDelete() {
    if (!lead) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await staffDeleteLead(lead.id, staffUserId);
      if (result.error) {
        setDeleteError(result.error);
      } else {
        router.push("/staff/recruitment");
      }
    });
  }

  function changeStage(stage: string) {
    if (!lead || stage === lead.stage) return;
    startTransition(async () => {
      await staffUpdateLead(
        lead.id,
        { stage: stage as "new" | "contacted" | "engaged" | "applied" | "closed" },
        staffUserId
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Link href="/staff/recruitment" className="text-sm text-rooted-green hover:underline">
        &larr; Back to Recruitment
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">
              {lead.first_name} {lead.last_name}
            </h1>
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
          </div>
          <p className="text-sm text-stone mt-1">
            {lead.campus_name} · {SOURCE_LABELS[lead.source] ?? lead.source} · inquired {formatRelativeTime(lead.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-1.5" onClick={() => openLog("call")} disabled={isPending}>
            <IconPhone size={16} /> Log a call
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => openLog("note")} disabled={isPending}>
            <IconPenLine size={16} /> Add note
          </Button>
          {!lead.application_id && (
            <Link href={`/staff/applications/new?lead=${lead.id}`}>
              <Button variant="outline" className="gap-1.5" disabled={isPending}>
                <IconClipboardList size={16} /> Start application
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Converted banner */}
      {lead.application_id && (
        <Card className="border-rooted-green/40 bg-rooted-green/5">
          <CardContent className="py-3 flex items-center justify-between">
            <p className="text-sm font-medium text-rooted-green flex items-center gap-1.5">
              <IconCheckCircle size={16} /> This family applied{lead.converted_at ? ` ${formatRelativeTime(lead.converted_at)}` : ""} — they&apos;re in the enrollment pipeline now.
            </p>
            <Link href={`/staff/applications/${lead.application_id}`}>
              <Button size="sm" variant="outline">View application &rarr;</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Profile */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Family profile</CardTitle>
            <CardDescription>Grows richer with every conversation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-stone">Contact</p>
              {lead.email ? (
                <a href={`mailto:${lead.email}`} className="text-rooted-green hover:underline block">
                  {lead.email}
                </a>
              ) : (
                <p className="text-ink/60">No email</p>
              )}
              {lead.phone ? (
                <a href={`tel:${lead.phone}`} className="text-rooted-green hover:underline block">
                  {lead.phone}
                </a>
              ) : (
                <p className="text-ink/60">No phone</p>
              )}
              <p className="text-xs text-stone mt-1 flex items-center gap-1">
                {lead.sms_consent ? (
                  <><IconCheckCircle size={14} /> OK to text</>
                ) : (
                  <><IconBan size={14} /> No text consent</>
                )}{" "}· prefers {lead.preferred_language === "es" ? "Spanish" : "English"}
              </p>
            </div>
            <div>
              <p className="text-xs text-stone">Student</p>
              <p className="text-ink">
                {lead.student_first_name ?? "—"}
                {lead.entry_grade && ` · entering ${lead.entry_grade === "K" ? "Kindergarten" : `Grade ${lead.entry_grade}`}`}
              </p>
            </div>
            <div>
              <p className="text-xs text-stone">Pathway interest</p>
              <p className="text-ink">
                {lead.pathway_interest ? (PATHWAY_LABELS[lead.pathway_interest] ?? lead.pathway_interest) : "Not sure yet"}
              </p>
            </div>
            {lead.zip && (
              <div>
                <p className="text-xs text-stone">Zip code</p>
                <p className="text-ink">{lead.zip}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-stone">Origin</p>
              <p className="text-ink/80">
                {lead.source_detail ?? (SOURCE_LABELS[lead.source] ?? lead.source)}
              </p>
              <p className="text-xs text-stone mt-0.5">
                Signed up{" "}
                {new Date(lead.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
            {lead.notes && (
              <div>
                <p className="text-xs text-stone">Notes</p>
                <p className="text-ink/80 whitespace-pre-wrap">{lead.notes}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-stone">Next follow-up</p>
              <p className="text-ink">
                {lead.next_follow_up_at ? formatRelativeTime(lead.next_follow_up_at) : "None scheduled"}
              </p>
            </div>
            {lead.referred_by_name && (
              <div>
                <p className="text-xs text-stone">Referred by</p>
                <p className="text-ink flex items-center gap-1"><IconSprout size={14} /> {lead.referred_by_name}</p>
              </div>
            )}
            <div className="pt-2 border-t border-stone/10">
              <p className="text-xs text-stone mb-1">Refer-a-family link</p>
              {referralLink ? (
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-stone/10 rounded px-2 py-1 flex-1 truncate">{referralLink}</code>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(referralLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
                    className="text-xs text-rooted-green hover:underline whitespace-nowrap"
                  >
                    {linkCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={getReferralLink}
                  disabled={isPending}
                  className="text-xs text-rooted-green hover:underline"
                >
                  Generate link to share
                </button>
              )}
              {lead.referral_count > 0 && (
                <p className="text-xs text-stone mt-1">
                  Referred {lead.referral_count} famil{lead.referral_count === 1 ? "y" : "ies"}
                  {lead.referral_applied > 0 && ` · ${lead.referral_applied} applied`}
                </p>
              )}
            </div>
            <div className="pt-2 border-t border-stone/10">
              <label htmlFor="stage-select" className="text-xs text-stone block mb-1">Stage</label>
              <Select
                id="stage-select"
                value={lead.stage}
                onChange={(e) => changeStage(e.target.value)}
                disabled={isPending || !!lead.application_id}
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="engaged">Engaged</option>
                <option value="applied">Applied</option>
                <option value="closed">Closed</option>
              </Select>
              {lead.application_id && (
                <p className="text-xs text-stone mt-1">Stage is locked once a family applies.</p>
              )}
            </div>
            {!lead.application_id && (
              <div className="pt-2 border-t border-stone/10">
                <button
                  type="button"
                  onClick={() => { setDeleteError(null); setDeleteOpen(true); }}
                  className="text-xs text-red-600 hover:text-red-700 hover:underline"
                >
                  Delete this lead
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Journey timeline</CardTitle>
            <CardDescription>Every touchpoint, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {lead.activities.length === 0 ? (
              <p className="text-sm text-stone text-center py-6">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {lead.activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 pb-3 border-b border-stone/10 last:border-0 last:pb-0"
                  >
                    <span className="text-stone mt-0.5" aria-hidden="true">
                      {ACTIVITY_ICONS[activity.activity_type] ?? <span className="text-lg leading-none">•</span>}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-ink/80">{activity.body ?? activity.activity_type}</p>
                      <p className="text-xs text-stone mt-0.5">
                        {formatRelativeTime(activity.created_at)}
                        {activity.actor_name && ` · ${activity.actor_name}`}
                        {!activity.actor_name && ["inquiry", "email", "sms", "reengagement", "converted"].includes(activity.activity_type) && " · automated"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {lead.first_name} {lead.last_name}?</DialogTitle>
            <DialogDescription>
              This permanently removes the lead and their entire activity timeline. It cannot be
              undone. If this family just isn&apos;t interested, set the stage to Closed instead —
              that keeps the history.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{deleteError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={isPending}>
              Keep lead
            </Button>
            <Button
              onClick={doDelete}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log dialog */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{logType === "call" ? "Log a call" : "Add a note"}</DialogTitle>
            <DialogDescription>
              {logType === "call"
                ? "What did you talk about? Calls automatically mark this family as contacted."
                : "Anything worth remembering for the next conversation."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <textarea
              value={logBody}
              onChange={(e) => setLogBody(e.target.value)}
              rows={3}
              autoFocus
              className="w-full rounded-md border border-stone/30 px-3 py-2 text-sm focus:border-rooted-green focus:outline-none focus:ring-1 focus:ring-rooted-green"
              placeholder={logType === "call" ? "Spoke with mom — very interested in healthcare pathway, worried about bus routes…" : "…"}
            />
            <div>
              <label htmlFor="follow-up-select" className="block text-sm font-medium text-ink/70 mb-1">
                Follow up again…
              </label>
              <Select
                id="follow-up-select"
                value={String(logFollowUpDays)}
                onChange={(e) =>
                  setLogFollowUpDays(e.target.value === "null" ? null : Number(e.target.value))
                }
              >
                {FOLLOW_UP_OPTIONS.map((opt) => (
                  <option key={opt.label} value={String(opt.days)}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submitLog} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
