"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EventDetail } from "@/lib/queries";
import { staffSetRsvpStatus, staffTogglePublish } from "../../actions";

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

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Registered", value: active.length },
          { label: "Total guests", value: totalGuests },
          { label: "Attended", value: event.attended, accent: true },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4 text-center">
              <p className={`text-2xl font-bold ${s.accent ? "text-rooted-green" : "text-ink"}`}>{s.value}</p>
              <p className="text-xs text-stone mt-0.5">{s.label}{s.label === "Registered" && event.capacity ? ` / ${event.capacity}` : ""}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Roster</CardTitle>
          <CardDescription>Mark attendance on the day — attendees are nudged forward to “engaged” automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          {event.rsvps.length === 0 ? (
            <p className="text-sm text-stone text-center py-6">No RSVPs yet. Share the public link to start collecting registrations.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Family</TableHead>
                  <TableHead className="hidden sm:table-cell">Contact</TableHead>
                  <TableHead className="text-center">Party</TableHead>
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
                    <TableCell className="hidden sm:table-cell text-xs text-stone">
                      {r.email ?? r.phone ?? "—"}
                    </TableCell>
                    <TableCell className="text-center text-sm">{r.party_size}</TableCell>
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
