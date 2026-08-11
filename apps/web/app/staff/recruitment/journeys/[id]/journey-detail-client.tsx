"use client";

import { useState, useTransition } from "react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IconAlertTriangle, IconBan, IconRotateCw } from "@/components/ui/icons";
import type { JourneyDetail, JourneyEnrollmentRow, EnrollableLead } from "@/lib/queries/journeys";
import {
  staffPauseJourney,
  staffResumeJourney,
  staffExitJourneyEnrollment,
  staffEnrollLeadsInJourney,
  staffSearchEnrollableLeads,
  type EnrollFamiliesResult,
} from "../actions";

const EXIT_REASON_LABELS: Record<string, string> = {
  applied: "Applied",
  rsvp: "RSVP'd",
  contacted: "Staff logged a call",
  unsubscribed: "Unsubscribed",
  manual: "Removed by staff",
};

/** Honest future-date label, matching the "waiting until Oct 14" bar the brief set. */
function formatSendDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function nextSendLabel(row: JourneyEnrollmentRow, journeyPaused: boolean): string {
  if (row.status === "completed") return "All steps sent";
  if (row.status === "exited") {
    return `Removed — ${EXIT_REASON_LABELS[row.exit_reason ?? ""] ?? row.exit_reason ?? "unknown reason"}`;
  }
  if (!row.next_step_at) return "—";
  const date = formatSendDate(row.next_step_at);
  return journeyPaused ? `Paused — would send ${date}` : `Waiting until ${date}`;
}

/**
 * Quiet engagement chip: only ever a positive signal ("Opened" / "Clicked"),
 * never a negative "unopened" one — no evidence isn't the same as "didn't
 * open," and migration 00045 may simply not be applied yet in this env.
 * Clicks imply engagement too, so a click alone still gets the "Clicked"
 * chip even without a separately recorded open.
 */
function EngagementChip({ opened, clicked }: { opened: boolean; clicked: boolean }) {
  if (!opened && !clicked) return null;
  const label = clicked ? "Clicked" : "Opened";
  const caption = clicked
    ? "The family clicked a link in this journey's email — the reliable engagement signal."
    : "Recorded as opened. Apple Mail and similar privacy proxies pre-fetch the open pixel for nearly every email regardless of whether the family actually reads it, so treat this as a weak signal — a click is the reliable one.";
  return (
    <Badge variant={clicked ? "success" : "outline"} className="ml-1.5 align-middle" title={caption}>
      {label}
    </Badge>
  );
}

function stepProgressLabel(row: JourneyEnrollmentRow): string {
  if (row.status === "completed") return `All ${row.total_steps} step${row.total_steps === 1 ? "" : "s"} sent`;
  if (row.status === "exited") {
    return row.current_step > 0 ? `Exited after step ${row.current_step}` : "Exited before first step";
  }
  return row.current_step > 0 ? `Step ${row.current_step} of ${row.total_steps} sent` : "Not started yet";
}

interface JourneyDetailClientProps {
  journey: JourneyDetail | null;
  roster: JourneyEnrollmentRow[];
  campuses: { id: string; name: string; short_code: string }[];
  staffUserId: string;
}

export function JourneyDetailClient({ journey, roster, campuses }: JourneyDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<JourneyEnrollmentRow | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollSearch, setEnrollSearch] = useState("");
  const [enrollCampusId, setEnrollCampusId] = useState("");
  const [enrollResults, setEnrollResults] = useState<EnrollableLead[]>([]);
  const [enrollSelected, setEnrollSelected] = useState<Set<string>>(new Set());
  const [enrollSearched, setEnrollSearched] = useState(false);
  const [enrollSummary, setEnrollSummary] = useState<EnrollFamiliesResult | null>(null);

  if (!journey) {
    return (
      <div className="space-y-6">
        <Link href="/staff/recruitment/journeys" className="text-sm text-rooted-green hover:underline">
          &larr; Back to journeys
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-stone">Journey not found, or not on your campus.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const total = journey.active + journey.completed + journey.exited;
  const firstStep = journey.steps[0];

  function toggleStatus() {
    if (!journey) return;
    setStatusError(null);
    startTransition(async () => {
      const result = journey.is_active ? await staffPauseJourney(journey.id) : await staffResumeJourney(journey.id);
      if (result.error) {
        setStatusError(result.error);
        return;
      }
      setStatusConfirmOpen(false);
      router.refresh();
    });
  }

  function confirmRemove() {
    if (!removeTarget || !journey) return;
    setRemoveError(null);
    startTransition(async () => {
      const result = await staffExitJourneyEnrollment(removeTarget.id, journey.id);
      if (result.error) {
        setRemoveError(result.error);
        return;
      }
      setRemoveTarget(null);
      router.refresh();
    });
  }

  function runSearch() {
    if (!journey) return;
    startTransition(async () => {
      const results = await staffSearchEnrollableLeads(journey.id, {
        search: enrollSearch || undefined,
        campusId: enrollCampusId || undefined,
      });
      setEnrollResults(results);
      setEnrollSearched(true);
      // Drop selections that fell out of the new result set.
      setEnrollSelected((prev) => new Set([...prev].filter((id) => results.some((r: EnrollableLead) => r.id === id))));
    });
  }

  function toggleSelected(id: string) {
    setEnrollSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmEnroll() {
    if (!journey || enrollSelected.size === 0) return;
    startTransition(async () => {
      const summary = await staffEnrollLeadsInJourney(journey.id, [...enrollSelected]);
      setEnrollSummary(summary);
      setEnrollSelected(new Set());
      if (summary.enrolled > 0) router.refresh();
    });
  }

  function closeEnrollDialog() {
    setEnrollOpen(false);
    setEnrollSearch("");
    setEnrollCampusId("");
    setEnrollResults([]);
    setEnrollSelected(new Set());
    setEnrollSearched(false);
    setEnrollSummary(null);
  }

  return (
    <div className="space-y-6">
      <Link href="/staff/recruitment/journeys" className="text-sm text-rooted-green hover:underline">
        &larr; Back to journeys
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-ink">{journey.name}</h1>
            <Badge variant={journey.is_active ? "success" : "secondary"}>
              {journey.is_active ? "Active" : "Paused"}
            </Badge>
          </div>
          {journey.description && <p className="text-sm text-stone mt-1">{journey.description}</p>}
          <p className="text-xs text-stone mt-1">{journey.campus_name ?? "All campuses (network default)"}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => setEnrollOpen(true)}
            disabled={journey.steps.length === 0}
            title={journey.steps.length === 0 ? "This journey has no steps configured yet" : undefined}
          >
            + Enroll families
          </Button>
          <Button
            variant={journey.is_active ? "outline" : "default"}
            className="gap-1.5"
            onClick={() => { setStatusError(null); setStatusConfirmOpen(true); }}
          >
            {journey.is_active ? <><IconBan size={16} /> Pause</> : <><IconRotateCw size={16} /> Resume</>}
          </Button>
        </div>
      </div>

      {!journey.is_active && (
        <p className="flex items-center gap-1.5 rounded-[6px] border border-warn/30 bg-warn/10 px-3 py-2 text-xs font-medium text-warn-text">
          <IconAlertTriangle size={14} aria-hidden />
          This journey is paused. No emails are sending to any enrolled family until you resume it.
        </p>
      )}

      {/* Stats header, with denominators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active", value: journey.active, accent: true },
          { label: "Completed", value: journey.completed, accent: false },
          { label: "Exited", value: journey.exited, accent: false },
          { label: "Enrolled ever", value: total, accent: false },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4 text-center">
              <p className={`text-2xl font-bold ${s.accent ? "text-rooted-green" : "text-ink"}`}>{s.value}</p>
              <p className="text-xs text-stone mt-0.5">
                {s.label}
                {s.label !== "Enrolled ever" && total > 0 ? ` of ${total}` : ""}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Steps */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Steps</CardTitle>
          <CardDescription>
            In send order. Previews render the real template with this step&apos;s saved content — actual sends use
            each family&apos;s own campus name; this preview uses {journey.campus_name ?? "“your school”"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {journey.steps.length === 0 ? (
            <p className="text-sm text-stone text-center py-6">No steps configured yet.</p>
          ) : (
            journey.steps.map((step, i) => (
              <div key={step.id} className="rounded-[6px] border border-line bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      Step {i + 1}: {step.template_label}
                    </p>
                    <p className="mt-0.5 text-xs text-stone-text">Sends {step.delay_label}</p>
                  </div>
                </div>
                {step.preview_unavailable ? (
                  <p className="mt-3 text-xs text-stone-text italic">
                    Preview unavailable — &ldquo;{step.template_key}&rdquo; isn&apos;t a recognized template.
                  </p>
                ) : (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-stone">Subject</p>
                    <p className="mt-0.5 text-sm font-medium text-ink">{step.subject}</p>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-stone">Body</p>
                    <pre className="mt-1 whitespace-pre-wrap rounded-[6px] bg-sunken p-3 font-mono text-[12.5px] leading-relaxed text-ink/80">
                      {step.preview_text}
                    </pre>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Roster */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Enrollment roster</CardTitle>
          <CardDescription>Every family ever enrolled in this journey, newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {roster.length === 0 ? (
            <p className="text-sm text-stone text-center py-6">No families enrolled yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Family</TableHead>
                  <TableHead className="hidden sm:table-cell">Campus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Progress</TableHead>
                  <TableHead>Next send</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link href={`/staff/recruitment/${row.lead_id}`} className="font-medium text-rooted-green hover:underline">
                        {row.family_name}
                      </Link>
                      <EngagementChip opened={row.opened} clicked={row.clicked} />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">{row.campus_name}</TableCell>
                    <TableCell>
                      <Badge
                        variant={row.status === "active" ? "default" : row.status === "completed" ? "success" : "secondary"}
                      >
                        {row.status === "active" ? "Active" : row.status === "completed" ? "Completed" : "Exited"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-stone">
                      {stepProgressLabel(row)}
                    </TableCell>
                    <TableCell className="text-sm text-stone">{nextSendLabel(row, !journey.is_active)}</TableCell>
                    <TableCell className="text-right">
                      {row.status === "active" && (
                        <button
                          type="button"
                          onClick={() => { setRemoveError(null); setRemoveTarget(row); }}
                          className="text-xs px-2 py-1.5 min-h-[32px] rounded border border-stone/30 text-ink/70 hover:border-red-400 hover:text-red-600 transition-colors whitespace-nowrap"
                        >
                          Remove from journey
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pause / resume confirm */}
      <Dialog open={statusConfirmOpen} onOpenChange={setStatusConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{journey.is_active ? "Pause this journey?" : "Resume this journey?"}</DialogTitle>
            <DialogDescription>
              {journey.is_active
                ? "Pausing stops all sends for every enrolled family until you resume it. Nobody is removed from the journey — they just stop moving forward."
                : "Resuming picks up where each family left off. Any family whose step came due while paused will send on the next daily run."}
            </DialogDescription>
          </DialogHeader>
          {statusError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{statusError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusConfirmOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={toggleStatus} disabled={isPending}>
              {isPending ? "Saving…" : journey.is_active ? "Pause journey" : "Resume journey"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove-from-journey confirm */}
      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.family_name} from this journey?</DialogTitle>
            <DialogDescription>
              No further journey emails will send to this family. This does not undo emails already sent, and does
              not affect any other journey they may be enrolled in.
            </DialogDescription>
          </DialogHeader>
          {removeError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{removeError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={isPending}>
              {isPending ? "Removing…" : "Remove from journey"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll families */}
      <Dialog open={enrollOpen} onOpenChange={(open) => (open ? setEnrollOpen(true) : closeEnrollDialog())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-xl">
          <DialogHeader>
            <DialogTitle>Enroll families in {journey.name}</DialogTitle>
            <DialogDescription>
              Search by name or email, or filter by campus, then pick who to enroll.
            </DialogDescription>
          </DialogHeader>

          {enrollSummary ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-ink">
                Enrolled {enrollSummary.enrolled} famil{enrollSummary.enrolled === 1 ? "y" : "ies"}.
              </p>
              {enrollSummary.skipped.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone">
                    Skipped ({enrollSummary.skipped.length})
                  </p>
                  <ul className="mt-1 space-y-1 text-xs text-stone-text max-h-40 overflow-y-auto">
                    {enrollSummary.skipped.map((s: { leadId: string; reason: string }) => (
                      <li key={s.leadId}>
                        {enrollResults.find((r: EnrollableLead) => r.id === s.leadId)
                          ? `${enrollResults.find((r: EnrollableLead) => r.id === s.leadId)?.first_name} ${enrollResults.find((r: EnrollableLead) => r.id === s.leadId)?.last_name}`
                          : s.leadId}
                        {" — "}
                        {s.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <DialogFooter>
                <Button onClick={closeEnrollDialog}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {!journey.is_active && (
                <p className="flex items-center gap-1.5 rounded-[6px] border border-warn/30 bg-warn/10 px-3 py-2 text-xs font-medium text-warn-text">
                  <IconAlertTriangle size={14} aria-hidden />
                  This journey is paused — enrolled families won&apos;t receive anything until you resume it.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                <Input
                  placeholder="Search by name or email…"
                  value={enrollSearch}
                  onChange={(e) => setEnrollSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                />
                {campuses.length > 1 && (
                  <Select value={enrollCampusId} onChange={(e) => setEnrollCampusId(e.target.value)} className="sm:w-44">
                    <option value="">Any campus</option>
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                )}
                <Button variant="outline" onClick={runSearch} disabled={isPending}>
                  Search
                </Button>
              </div>

              {enrollSearched && (
                <>
                  {enrollResults.length === 0 ? (
                    <p className="text-sm text-stone text-center py-6">
                      No eligible families match — already enrolled, unsubscribed, suppressed, or missing an email
                      are excluded automatically.
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto border border-line rounded-[6px] divide-y divide-line">
                      {enrollResults.map((lead) => (
                        <label
                          key={lead.id}
                          className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-sunken/60"
                        >
                          <input
                            type="checkbox"
                            checked={enrollSelected.has(lead.id)}
                            onChange={() => toggleSelected(lead.id)}
                            className="h-4 w-4 rounded border-stone/40 text-rooted-green focus:ring-rooted-green"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium text-ink">{lead.first_name} {lead.last_name}</span>
                            <span className="text-stone"> · {lead.email} · {lead.campus_name}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}

              {enrollSelected.size > 0 && firstStep && (
                <p className="text-xs text-stone-text">
                  {enrollSelected.size} selected. Their first message sends {firstStep.delay_days} day
                  {firstStep.delay_days === 1 ? "" : "s"} after enrollment, on the daily schedule.
                </p>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeEnrollDialog} disabled={isPending}>
                  Cancel
                </Button>
                <Button onClick={confirmEnroll} disabled={isPending || enrollSelected.size === 0}>
                  {isPending ? "Enrolling…" : `Enroll ${enrollSelected.size || ""} famil${enrollSelected.size === 1 ? "y" : "ies"}`.trim()}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
