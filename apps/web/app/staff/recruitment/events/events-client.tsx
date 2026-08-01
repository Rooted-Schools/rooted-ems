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
import { IconRefreshCw } from "@/components/ui/icons";
import type { EventRow } from "@/lib/queries";
import { staffCreateEvent, staffSyncTablingEvents } from "../actions";

const TYPE_LABELS: Record<string, string> = {
  info_session: "Info Session",
  open_house: "Open House",
  tour: "Campus Tour",
  tabling: "Tabling / Outreach",
  other: "Event",
};

function whenText(startsAt: string) {
  return new Date(startsAt).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

interface EventsClientProps {
  events: EventRow[];
  campuses: { id: string; name: string }[];
  activeCampusId: string;
  staffUserId: string;
}

const EMPTY = {
  campus_id: "",
  title: "",
  description: "",
  event_type: "info_session",
  location: "",
  date: "",
  time: "",
  capacity: "",
};

export function EventsClient({ events, campuses, activeCampusId, staffUserId }: EventsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  function syncCalendar() {
    setSyncStatus("Syncing…");
    startTransition(async () => {
      try {
        const s = await staffSyncTablingEvents();
        const changed = s.added + s.updated;
        setSyncStatus(
          changed === 0
            ? `No confirmed events to import (${s.confirmed} confirmed, all current).`
            : `Imported ${s.added} new, updated ${s.updated}${s.skipped_no_date > 0 ? ` · ${s.skipped_no_date} skipped (no clear date)` : ""}.`
        );
        if (changed > 0) router.refresh();
      } catch {
        setSyncStatus("Sync failed — try again in a minute.");
      }
    });
  }

  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.starts_at).getTime() >= now);
  const past = events.filter((e) => new Date(e.starts_at).getTime() < now);

  function create() {
    if (!form.title.trim() || !form.campus_id || !form.date || !form.time) {
      setError("Title, campus, date, and time are required.");
      return;
    }
    setError(null);
    const startsAt = new Date(`${form.date}T${form.time}`).toISOString();
    startTransition(async () => {
      const result = await staffCreateEvent(
        {
          campus_id: form.campus_id,
          title: form.title,
          description: form.description || undefined,
          event_type: form.event_type,
          location: form.location || undefined,
          starts_at: startsAt,
          capacity: form.capacity ? Number(form.capacity) : null,
          is_published: true,
        },
        staffUserId
      );
      if (result.error) setError(result.error);
      else {
        setOpen(false);
        setForm({ ...EMPTY });
        router.refresh();
      }
    });
  }

  function EventCard({ e }: { e: EventRow }) {
    return (
      <Link
        href={`/staff/recruitment/events/${e.id}`}
        className="flex items-center justify-between gap-4 rounded-lg border border-stone/15 px-4 py-3 hover:border-rooted-green/40 transition-colors"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-ink truncate">{e.title}</p>
            {e.event_type === "tabling" ? (
              <Badge variant="warning">Tabling</Badge>
            ) : !e.is_published ? (
              <Badge variant="secondary">Draft</Badge>
            ) : null}
          </div>
          <p className="text-xs text-stone">
            {TYPE_LABELS[e.event_type] ?? "Event"} · {whenText(e.starts_at)} · {e.campus_name}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-ink">
            {e.registered}{e.capacity ? `/${e.capacity}` : ""}
          </p>
          <p className="text-[11px] text-stone">registered{e.attended > 0 ? ` · ${e.attended} attended` : ""}</p>
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={activeCampusId === "all" ? "/staff/recruitment" : `/staff/recruitment?campus=${activeCampusId}`} className="text-sm text-rooted-green hover:underline">
            &larr; Back to Recruitment
          </Link>
          <h1 className="text-2xl font-bold text-ink mt-1">Events</h1>
          <p className="text-sm text-stone mt-1">Info sessions, open houses, and tours — RSVPs flow into your pipeline.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {syncStatus && <span className="text-xs text-stone">{syncStatus}</span>}
          <Button variant="outline" onClick={syncCalendar} disabled={isPending} title="Import Confirmed events from the Tabling Calendar spreadsheet" className="gap-1.5">
            <IconRefreshCw size={16} />
            Sync calendar
          </Button>
          <Button onClick={() => { setForm({ ...EMPTY, campus_id: campuses.length === 1 ? campuses[0].id : "" }); setError(null); setOpen(true); }}>
            + New Event
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Upcoming ({upcoming.length})</CardTitle>
          <CardDescription>Published events appear on the public /events page for families.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-stone text-center py-6">No upcoming events. Create one to start collecting RSVPs.</p>
          ) : (
            upcoming.map((e) => <EventCard key={e.id} e={e} />)
          )}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Past ({past.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {past.map((e) => <EventCard key={e.id} e={e} />)}
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New event</DialogTitle>
            <DialogDescription>Families can register the moment you publish it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label htmlFor="ev-title" className="block text-sm font-medium text-ink/70 mb-1">Title *</label>
              <Input id="ev-title" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Fall Open House" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ev-campus" className="block text-sm font-medium text-ink/70 mb-1">Campus *</label>
                <Select id="ev-campus" value={form.campus_id} onChange={(e) => set({ campus_id: e.target.value })}>
                  <option value="">Choose…</option>
                  {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <label htmlFor="ev-type" className="block text-sm font-medium text-ink/70 mb-1">Type</label>
                <Select id="ev-type" value={form.event_type} onChange={(e) => set({ event_type: e.target.value })}>
                  <option value="info_session">Info Session</option>
                  <option value="open_house">Open House</option>
                  <option value="tour">Campus Tour</option>
                  <option value="other">Other</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ev-date" className="block text-sm font-medium text-ink/70 mb-1">Date *</label>
                <Input id="ev-date" type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
              </div>
              <div>
                <label htmlFor="ev-time" className="block text-sm font-medium text-ink/70 mb-1">Time *</label>
                <Input id="ev-time" type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} />
              </div>
            </div>
            <div>
              <label htmlFor="ev-loc" className="block text-sm font-medium text-ink/70 mb-1">Location</label>
              <Input id="ev-loc" value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="1225 Laurel St, Columbia" />
            </div>
            <div>
              <label htmlFor="ev-cap" className="block text-sm font-medium text-ink/70 mb-1">Capacity (optional)</label>
              <Input id="ev-cap" type="number" min={1} value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} placeholder="Leave blank for unlimited" />
            </div>
            <div>
              <label htmlFor="ev-desc" className="block text-sm font-medium text-ink/70 mb-1">Description</label>
              <textarea
                id="ev-desc"
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
                rows={3}
                className="w-full rounded-md border border-stone/30 px-3 py-2 text-sm focus:border-rooted-green focus:outline-none focus:ring-1 focus:ring-rooted-green"
                placeholder="What families can expect…"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={create} disabled={isPending}>{isPending ? "Creating…" : "Create & publish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
