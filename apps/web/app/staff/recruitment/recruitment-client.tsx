"use client";

import { useMemo, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CampaignRow, JourneyStat, LeadPipelineSummary, LeadRow } from "@/lib/queries/leads";
import { formatRelativeTime } from "@/lib/queries/utils";
import { staffCancelCampaign, staffCreateLead, staffSyncLeadSheets } from "./actions";
import { CampaignDialog } from "./campaign-dialog";
import { ShareDialog } from "./share-dialog";
import { CAMPAIGN_TEMPLATES, type CampaignTemplateKey } from "@/lib/email-templates";

/* ─── Display config ─── */

export const STAGE_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" }> = {
  new: { label: "New", variant: "secondary" },
  contacted: { label: "Contacted", variant: "default" },
  engaged: { label: "Engaged", variant: "warning" },
  applied: { label: "Applied", variant: "success" },
  closed: { label: "Closed", variant: "secondary" },
};

export const SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  event: "Event",
  referral: "Referral",
  qr: "Flyer / QR",
  ad: "Ad / Social",
  walk_in: "Walk-in",
  staff: "Staff-added",
  other: "Other",
};

export const PATHWAY_LABELS: Record<string, string> = {
  healthcare: "Healthcare",
  technology: "Technology",
  advanced_manufacturing: "Adv. Manufacturing",
  entrepreneurship: "Entrepreneurship",
};

const GRADE_OPTIONS = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

/* ─── Component ─── */

interface RecruitmentClientProps {
  queue: LeadRow[];
  summary: LeadPipelineSummary;
  leads: LeadRow[];
  campaigns: CampaignRow[];
  journeys: JourneyStat[];
  campuses: { id: string; name: string; short_code: string }[];
  /** Campus filter from ?campus= — "all" when viewing every campus. */
  activeCampusId: string;
  staffUserId: string;
}

const EMPTY_LEAD = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  sms_consent: false,
  campus_id: "",
  student_first_name: "",
  entry_grade: "",
  pathway_interest: "",
  source: "walk_in",
  notes: "",
};

export function RecruitmentClient({ queue, summary, leads, campaigns, journeys, campuses, activeCampusId, staffUserId }: RecruitmentClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("open");
  const [addOpen, setAddOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [newLead, setNewLead] = useState({ ...EMPTY_LEAD });
  const [error, setError] = useState<string | null>(null);

  function cancelCampaign(campaignId: string) {
    startTransition(async () => {
      await staffCancelCampaign(campaignId, staffUserId);
      router.refresh();
    });
  }

  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  function syncSheets() {
    setSyncStatus("Syncing…");
    startTransition(async () => {
      try {
        const summary = await staffSyncLeadSheets();
        setSyncStatus(
          summary.added === 0
            ? "Up to date — no new families on the forms."
            : `Added ${summary.added} new famil${summary.added === 1 ? "y" : "ies"}${summary.welcomed > 0 ? ` (${summary.welcomed} welcomed just now)` : ""}.`
        );
        if (summary.added > 0) router.refresh();
      } catch {
        setSyncStatus("Sync failed — try again in a minute.");
      }
    });
  }

  const updateNew = (patch: Partial<typeof EMPTY_LEAD>) =>
    setNewLead((l) => ({ ...l, ...patch }));

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      if (stageFilter === "open" && !["new", "contacted", "engaged"].includes(lead.stage)) return false;
      if (stageFilter !== "all" && stageFilter !== "open" && lead.stage !== stageFilter) return false;
      if (!term) return true;
      return (
        `${lead.first_name} ${lead.last_name}`.toLowerCase().includes(term) ||
        (lead.email ?? "").toLowerCase().includes(term) ||
        (lead.student_first_name ?? "").toLowerCase().includes(term)
      );
    });
  }, [leads, search, stageFilter]);

  function submitNewLead() {
    if (!newLead.first_name.trim() || !newLead.last_name.trim() || !newLead.campus_id) {
      setError("First name, last name, and campus are required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await staffCreateLead(
        {
          campus_id: newLead.campus_id,
          first_name: newLead.first_name,
          last_name: newLead.last_name,
          email: newLead.email || undefined,
          phone: newLead.phone || undefined,
          sms_consent: newLead.sms_consent,
          student_first_name: newLead.student_first_name || undefined,
          entry_grade: newLead.entry_grade || undefined,
          pathway_interest: newLead.pathway_interest || undefined,
          source: newLead.source,
          notes: newLead.notes || undefined,
        },
        staffUserId
      );
      if (result.error) {
        setError(result.error);
      } else {
        setAddOpen(false);
        setNewLead({ ...EMPTY_LEAD });
        router.refresh();
      }
    });
  }

  const stat = (key: string) => summary.stage_counts[key] ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Recruitment</h1>
          <p className="text-sm text-stone mt-1">
            Every prospective family, from first hello to submitted application.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {syncStatus && (
            <span className="text-xs text-stone">{syncStatus}</span>
          )}
          <Link href={activeCampusId === "all" ? "/staff/recruitment/events" : `/staff/recruitment/events?campus=${activeCampusId}`}>
            <Button variant="outline">🗓️ Events</Button>
          </Link>
          <Link href={activeCampusId === "all" ? "/staff/recruitment/analytics" : `/staff/recruitment/analytics?campus=${activeCampusId}`}>
            <Button variant="outline">📊 Funnel</Button>
          </Link>
          <Button variant="outline" onClick={() => setShareOpen(true)} title="Make a tagged link or QR code for a flyer or the school website">
            🔗 Share &amp; QR
          </Button>
          <Button variant="outline" onClick={syncSheets} disabled={isPending} title="Pull new sign-ups from the campus interest form spreadsheets">
            🔄 Sync sheets
          </Button>
          <Button variant="outline" onClick={() => setCampaignOpen(true)}>
            ✉️ Email Families
          </Button>
          <Button onClick={() => { setNewLead({ ...EMPTY_LEAD, campus_id: campuses.length === 1 ? campuses[0].id : "" }); setError(null); setAddOpen(true); }}>
            + Add Lead
          </Button>
        </div>
      </div>

      {/* Follow-up queue — the morning triage */}
      {queue.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              📞 Follow up today ({queue.length})
            </CardTitle>
            <CardDescription>
              Fast follow-up wins families — these leads are due (or overdue) for a touch.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {queue.slice(0, 8).map((lead) => {
              const cfg = STAGE_CONFIG[lead.stage] ?? STAGE_CONFIG.new;
              return (
                <Link
                  key={lead.id}
                  href={`/staff/recruitment/${lead.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-white border border-amber-200 px-3 py-2 hover:border-amber-400 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {lead.first_name} {lead.last_name}
                      {lead.student_first_name && (
                        <span className="text-stone font-normal"> · student: {lead.student_first_name}</span>
                      )}
                    </p>
                    <p className="text-xs text-stone truncate">
                      {lead.campus_name} · {SOURCE_LABELS[lead.source] ?? lead.source}
                      {lead.next_follow_up_at && ` · due ${formatRelativeTime(lead.next_follow_up_at)}`}
                    </p>
                  </div>
                  <Badge variant={cfg.variant} className="shrink-0">{cfg.label}</Badge>
                </Link>
              );
            })}
            {queue.length > 8 && (
              <p className="text-xs text-stone text-center pt-1">
                + {queue.length - 8} more in the table below
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active + recent campaigns */}
      {campaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">✉️ Campaigns</CardTitle>
            <CardDescription>
              Batch emails send automatically each morning at each campaign&apos;s daily pace.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {campaigns.map((c) => {
              const pct = c.total_recipients > 0 ? Math.round((c.sent_count / c.total_recipients) * 100) : 0;
              const templateLabel = CAMPAIGN_TEMPLATES[c.template_key as CampaignTemplateKey]?.label ?? c.template_key;
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-lg border border-stone/15 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">
                      {c.name}
                      <span className="text-stone font-normal"> · {templateLabel} · {c.campus_name}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-1.5 flex-1 max-w-48 rounded-full bg-stone/15 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${c.status === "cancelled" ? "bg-stone/40" : "bg-rooted-green"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-stone whitespace-nowrap">
                        {c.sent_count.toLocaleString()}/{c.total_recipients.toLocaleString()} sent
                      </span>
                    </div>
                  </div>
                  {c.status === "sending" ? (
                    <Button variant="outline" size="sm" onClick={() => cancelCampaign(c.id)} disabled={isPending}>
                      Cancel
                    </Button>
                  ) : (
                    <Badge variant={c.status === "complete" ? "success" : "secondary"}>
                      {c.status === "complete" ? "Complete" : "Cancelled"}
                    </Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Nurture journeys (LG-2) */}
      {journeys.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">🌿 Nurture journeys</CardTitle>
            <CardDescription>
              Automated email sequences that run themselves — and stop the moment a family applies, RSVPs, or you log a call.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {journeys.map((j) => (
              <div key={j.key} className="flex items-center justify-between gap-3 rounded-lg border border-stone/15 px-3 py-2">
                <p className="text-sm font-medium text-ink">{j.name}</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-rooted-green font-semibold">{j.active} active</span>
                  <span className="text-stone">{j.completed} completed</span>
                  <span className="text-stone">{j.exited} exited</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stage summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "New", value: stat("new") },
          { label: "Contacted", value: stat("contacted") },
          { label: "Engaged", value: stat("engaged") },
          { label: "Applied", value: stat("applied"), accent: true },
          { label: "Gone quiet", value: summary.gone_quiet, warn: true },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4 text-center">
              <p className={`text-2xl font-bold ${s.accent ? "text-rooted-green" : s.warn && s.value > 0 ? "text-amber-600" : "text-ink"}`}>
                {s.value}
              </p>
              <p className="text-xs text-stone mt-0.5">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters + table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {campuses.length > 1 && (
              <Select
                value={activeCampusId}
                onChange={(e) =>
                  router.push(
                    e.target.value === "all"
                      ? "/staff/recruitment"
                      : `/staff/recruitment?campus=${e.target.value}`
                  )
                }
                className="sm:w-56"
                aria-label="Filter by campus"
              >
                <option value="all">All campuses</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            )}
            <Input
              placeholder="Search by family, student, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="sm:w-44"
            >
              <option value="open">Open leads</option>
              <option value="all">All stages</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="engaged">Engaged</option>
              <option value="applied">Applied</option>
              <option value="closed">Closed</option>
            </Select>
            <span className="text-xs text-stone self-center sm:ml-auto whitespace-nowrap">
              {filtered.length.toLocaleString()} lead{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-stone text-sm">
                {leads.length === 0
                  ? "No leads yet. They'll appear here the moment a family submits the inquiry form — or add one now."
                  : "No leads match your filters."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Family</TableHead>
                  <TableHead className="hidden md:table-cell">Student</TableHead>
                  <TableHead className="hidden lg:table-cell">Campus</TableHead>
                  <TableHead className="hidden md:table-cell">Source</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="hidden lg:table-cell">Last contact</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => {
                  const cfg = STAGE_CONFIG[lead.stage] ?? STAGE_CONFIG.new;
                  return (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <p className="font-medium text-ink">
                          {lead.first_name} {lead.last_name}
                        </p>
                        <p className="text-xs text-stone">
                          {[lead.email, lead.phone].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {lead.student_first_name ?? "—"}
                        {lead.entry_grade && (
                          <span className="text-stone"> · {lead.entry_grade === "K" ? "K" : `Gr ${lead.entry_grade}`}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">{lead.campus_name}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {SOURCE_LABELS[lead.source] ?? lead.source}
                      </TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-stone">
                        {lead.last_contact_at ? formatRelativeTime(lead.last_contact_at) : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/staff/recruitment/${lead.id}`}
                          className="text-sm text-rooted-green hover:underline whitespace-nowrap"
                        >
                          View &rarr;
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Email Families wizard */}
      <CampaignDialog
        open={campaignOpen}
        onOpenChange={setCampaignOpen}
        campuses={campuses}
        staffUserId={staffUserId}
      />

      {/* Share & QR generator (Capture Kit) */}
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} campuses={campuses} />

      {/* Add Lead dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add a lead</DialogTitle>
            <DialogDescription>
              Walk-in, phone call, or event sign-up — capture it before it slips away.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="lead-first" className="block text-sm font-medium text-ink/70 mb-1">First name *</label>
                <Input id="lead-first" value={newLead.first_name} onChange={(e) => updateNew({ first_name: e.target.value })} />
              </div>
              <div>
                <label htmlFor="lead-last" className="block text-sm font-medium text-ink/70 mb-1">Last name *</label>
                <Input id="lead-last" value={newLead.last_name} onChange={(e) => updateNew({ last_name: e.target.value })} />
              </div>
            </div>
            <div>
              <label htmlFor="lead-campus" className="block text-sm font-medium text-ink/70 mb-1">Campus *</label>
              <Select id="lead-campus" value={newLead.campus_id} onChange={(e) => updateNew({ campus_id: e.target.value })}>
                <option value="">Choose…</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="lead-email" className="block text-sm font-medium text-ink/70 mb-1">Email</label>
                <Input id="lead-email" type="email" value={newLead.email} onChange={(e) => updateNew({ email: e.target.value })} />
              </div>
              <div>
                <label htmlFor="lead-phone" className="block text-sm font-medium text-ink/70 mb-1">Phone</label>
                <Input id="lead-phone" type="tel" value={newLead.phone} onChange={(e) => updateNew({ phone: e.target.value })} />
              </div>
            </div>
            {newLead.phone.trim() && (
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="lead-sms"
                  checked={newLead.sms_consent}
                  onChange={(e) => updateNew({ sms_consent: e.target.checked })}
                  className="mt-1 h-4 w-4 rounded border-stone/40 text-rooted-green focus:ring-rooted-green"
                />
                <label htmlFor="lead-sms" className="text-sm text-ink/80">
                  Family said it&apos;s OK to text them at this number
                </label>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="lead-student" className="block text-sm font-medium text-ink/70 mb-1">Student first name</label>
                <Input id="lead-student" value={newLead.student_first_name} onChange={(e) => updateNew({ student_first_name: e.target.value })} />
              </div>
              <div>
                <label htmlFor="lead-grade" className="block text-sm font-medium text-ink/70 mb-1">Entering grade</label>
                <Select id="lead-grade" value={newLead.entry_grade} onChange={(e) => updateNew({ entry_grade: e.target.value })}>
                  <option value="">—</option>
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g === "K" ? "Kindergarten" : `Grade ${g}`}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="lead-pathway" className="block text-sm font-medium text-ink/70 mb-1">Pathway interest</label>
                <Select id="lead-pathway" value={newLead.pathway_interest} onChange={(e) => updateNew({ pathway_interest: e.target.value })}>
                  <option value="">Not sure</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="technology">Technology</option>
                  <option value="advanced_manufacturing">Adv. Manufacturing</option>
                  <option value="entrepreneurship">Entrepreneurship</option>
                </Select>
              </div>
              <div>
                <label htmlFor="lead-source" className="block text-sm font-medium text-ink/70 mb-1">Source</label>
                <Select id="lead-source" value={newLead.source} onChange={(e) => updateNew({ source: e.target.value })}>
                  <option value="walk_in">Walk-in</option>
                  <option value="event">Event</option>
                  <option value="referral">Referral</option>
                  <option value="qr">Flyer / QR</option>
                  <option value="ad">Ad / Social</option>
                  <option value="website">Website</option>
                  <option value="other">Other</option>
                </Select>
              </div>
            </div>
            <div>
              <label htmlFor="lead-notes" className="block text-sm font-medium text-ink/70 mb-1">Notes</label>
              <textarea
                id="lead-notes"
                value={newLead.notes}
                onChange={(e) => updateNew({ notes: e.target.value })}
                rows={2}
                className="w-full rounded-md border border-stone/30 px-3 py-2 text-sm focus:border-rooted-green focus:outline-none focus:ring-1 focus:ring-rooted-green"
                placeholder="Anything worth remembering — questions asked, concerns, siblings…"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submitNewLead} disabled={isPending}>
              {isPending ? "Saving…" : "Save lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
