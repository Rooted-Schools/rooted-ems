"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IconCheckCircle } from "@/components/ui/icons";
import type { EventDetail } from "@/lib/queries";
import { staffAddWalkIn, staffCheckInRsvp, staffSetRsvpStatus, staffTogglePublish } from "../../actions";

export function EventDetailClient({
  event,
  publicUrl,
  staffUserId,
}: {
  event: EventDetail | null;
  publicUrl: string;
  staffUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInError, setWalkInError] = useState<string | null>(null);

  if (!event) {
    return (
      <div className="space-y-6">
        <Link href="/staff/recruitment/events" className="text-sm text-rooted-green hover:underline">&larr; Back to Events</Link>
        <Card><CardContent className="py-12 text-center"><p className="text-stone">Event not found, or not on your campus.</p></CardContent></Card>
      </div>
    );
  }

  function setStatus(rsvpId: string, status: "registered" | "attended" | "no_show") {
    startTransition(async () => {
      await staffSetRsvpStatus(rsvpId, event!.id, status, staffUserId);
      router.refresh();
    });
  }

  function checkIn(rsvpId: string) {
    startTransition(async () => {
      await staffCheckInRsvp(rsvpId, event!.id, staffUserId);
      router.refresh();
    });
  }

  function addWalkIn() {
    if (!walkInName.trim()) {
      setWalkInError("Name is required.");
      return;
    }
    setWalkInError(null);
    startTransition(async () => {
      const result = await staffAddWalkIn(
        { event_id: event!.id, campus_id: event!.campus_id, guardian_name: walkInName.trim(), phone: walkInPhone.trim() || undefined },
        staffUserId
      );
      if (result.error) {
        setWalkInError(result.error);
        return;
      }
      setWalkInName("");
      setWalkInPhone("");
      setWalkInOpen(false);
      router.refresh();
    });
  }

  function togglePublish() {
    startTransition(async () => {
      await staffTogglePublish(event!.id, !event!.is_published);
      router.refresh();
    });
  }

  const when = new Date(event.starts_at).toLocaleString("en-US", {
    weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  const active = event.rsvps.filter((r) => r.status !== "cancelled");
  const totalGuests = active.reduce((s, r) => s + r.party_size, 0);

  return (
    <div className="space-y-6">
      <Link href="/staff/recruitment/events" className="text-sm text-rooted-green hover:underline">&larr; Back to Events</Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-ink">{event.title}</h1>
            <Badge variant={event.is_published ? "success" : "secondary"}>{event.is_published ? "Published" : "Draft"}</Badge>
          </div>
          <p className="text-sm text-stone mt-1">
            {when}{event.location ? ` · ${event.location}` : ""} · {event.campus_name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
            {copied ? "Copied!" : "Copy public link"}
          </Button>
          <Button variant="outline" onClick={togglePublish} disabled={isPending}>
            {event.is_published ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      <div className={`grid gap-3 ${event.checkInAvailable ? "grid-cols-4" : "grid-cols-3"}`}>
        {(
          [
            { label: "Registered", value: active.length, accent: false, suffix: event.capacity ? ` / ${event.capacity}` : "" },
            { label: "Total guests", value: totalGuests, accent: false, suffix: "" },
            ...(event.checkInAvailable
              ? [{ label: "Checked in", value: event.checked_in, accent: true, suffix: ` / ${active.length}` }]
              : []),
            { label: "Attended", value: event.attended, accent: !event.checkInAvailable, suffix: "" },
          ] as Array<{ label: string; value: number; accent: boolean; suffix: string }>
        ).map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4 text-center">
              <p className={`text-2xl font-bold ${s.accent ? "text-rooted-green" : "text-ink"}`}>{s.value}</p>
              <p className="text-xs text-stone mt-0.5">{s.label}{s.suffix}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {event.checkInAvailable ? "Check-in roster" : "Roster"}
              </CardTitle>
              <CardDescription>
                {event.checkInAvailable
                  ? "Tap Check in as families arrive — attendees are nudged forward to “engaged” automatically."
                  : "Mark attendance on the day — attendees are nudged forward to “engaged” automatically."}
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => setWalkInOpen((v) => !v)} className="shrink-0">
              {walkInOpen ? "Cancel" : "+ Walk-in"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {walkInOpen && (
            <div className="rounded-md border border-stone/20 bg-sunken/40 p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
                <div>
                  <label htmlFor="walkin-name" className="block text-xs font-medium text-ink/70 mb-1">Name *</label>
                  <Input id="walkin-name" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} placeholder="Family name" />
                </div>
                <div>
                  <label htmlFor="walkin-phone" className="block text-xs font-medium text-ink/70 mb-1">Phone (optional)</label>
                  <Input id="walkin-phone" type="tel" value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} placeholder="(555) 555-0100" />
                </div>
                <div className="flex items-end">
                  <Button onClick={addWalkIn} disabled={isPending} className="w-full sm:w-auto">
                    Add &amp; check in
                  </Button>
                </div>
              </div>
              {walkInError && <p className="text-xs text-red-600">{walkInError}</p>}
              <p className="text-xs text-stone">Creates a lead (source: event) and marks them checked in right away.</p>
            </div>
          )}

          {event.rsvps.length === 0 ? (
            <p className="text-sm text-stone text-center py-6">No RSVPs yet. Share the public link to start collecting registrations.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Family</TableHead>
                  <TableHead className="hidden sm:table-cell">Contact</TableHead>
                  <TableHead className="text-center">Party</TableHead>
                  {event.checkInAvailable && <TableHead className="text-center">Check-in</TableHead>}
                  <TableHead className="text-right">Attendance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {event.rsvps.map((r) => (
                  <TableRow key={r.id} className={r.status === "cancelled" ? "opacity-50" : undefined}>
                    <TableCell>
                      {r.lead_id ? (
                        <Link href={`/staff/recruitment/${r.lead_id}`} className="font-medium text-rooted-green hover:underline">
                          {r.guardian_name}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink">{r.guardian_name}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">
                      {r.email ? (
                        <a href={`mailto:${r.email}`} className="text-rooted-green hover:text-deep-green">
                          {r.email}
                        </a>
                      ) : r.phone ? (
                        <a href={`tel:${r.phone}`} className="text-rooted-green hover:text-deep-green">
                          {r.phone}
                        </a>
                      ) : (
                        <span className="text-stone">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm">{r.party_size}</TableCell>
                    {event.checkInAvailable && (
                      <TableCell className="text-center">
                        {r.checked_in_at ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-rooted-green">
                            <IconCheckCircle size={16} />
                            {new Date(r.checked_in_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => checkIn(r.id)}
                            disabled={isPending || r.status === "cancelled"}
                            className="text-xs px-2 py-1.5 min-h-[32px] rounded border border-stone/30 text-ink/70 hover:border-rooted-green hover:text-rooted-green transition-colors disabled:opacity-40"
                          >
                            Check in
                          </button>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => setStatus(r.id, "attended")}
                          disabled={isPending}
                          className={`text-xs px-2 py-1 rounded border transition-colors ${
                            r.status === "attended"
                              ? "bg-rooted-green text-white border-rooted-green"
                              : "border-stone/30 text-ink/70 hover:border-rooted-green"
                          }`}
                        >
                          Attended
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(r.id, "no_show")}
                          disabled={isPending}
                          className={`text-xs px-2 py-1 rounded border transition-colors ${
                            r.status === "no_show"
                              ? "bg-stone/70 text-white border-stone/70"
                              : "border-stone/30 text-ink/70 hover:border-stone/50"
                          }`}
                        >
                          No-show
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
