"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { IconCheckCircle } from "@/components/ui/icons";
import { useLocale } from "@/lib/i18n/locale-context";
import { submitRsvp } from "../actions";

export function RsvpForm({ eventId, campusId, isFull }: { eventId: string; campusId: string; isFull: boolean }) {
  const { locale } = useLocale();
  const es = locale === "es";
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ guardian_name: "", email: "", phone: "", party_size: "2", website: "" });
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  if (isFull) {
    return (
      <div className="rounded-xl border border-stone/20 bg-white p-5 text-center">
        <p className="text-sm text-ink/70">
          {es ? "Este evento está lleno." : "This event is full."}{" "}
          <Link href="/inquire" className="text-rooted-green hover:underline">
            {es ? "Pida información sobre la próxima fecha" : "Ask about the next date"}
          </Link>.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-xl border border-rooted-green/30 bg-rooted-green/5 p-6 text-center space-y-2">
        <div className="flex justify-center text-rooted-green">
          <IconCheckCircle size={32} />
        </div>
        <p className="font-semibold text-ink">{es ? "¡Está registrado/a!" : "You're registered!"}</p>
        <p className="text-sm text-ink/70">
          {es
            ? "Revise su correo para la confirmación. ¡Nos vemos pronto!"
            : "Check your email for a confirmation. See you soon!"}
        </p>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.guardian_name.trim() || (!form.email.trim() && !form.phone.trim())) {
      setError(es ? "Ingrese su nombre y un correo o teléfono." : "Please enter your name and an email or phone.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitRsvp({ ...form, event_id: eventId, campus_id: campusId, party_size: Number(form.party_size) || 1 });
      if (result.error) setError(result.error);
      else setDone(true);
    });
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-stone/20 bg-white p-5 space-y-3" noValidate>
      <p className="text-sm font-semibold text-ink">{es ? "Reserve su lugar" : "Save your spot"}</p>
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set({ website: e.target.value })} />
      </div>
      <div>
        <label htmlFor="rsvp-name" className="block text-sm font-medium text-ink/70 mb-1">
          {es ? "Su nombre" : "Your name"} <span className="text-red-500">*</span>
        </label>
        <Input id="rsvp-name" value={form.guardian_name} onChange={(e) => set({ guardian_name: e.target.value })} autoComplete="name" />
      </div>
      <div>
        <label htmlFor="rsvp-email" className="block text-sm font-medium text-ink/70 mb-1">{es ? "Correo" : "Email"}</label>
        <Input id="rsvp-email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} autoComplete="email" inputMode="email" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="rsvp-phone" className="block text-sm font-medium text-ink/70 mb-1">{es ? "Teléfono" : "Phone"}</label>
          <Input id="rsvp-phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} autoComplete="tel" inputMode="tel" />
        </div>
        <div>
          <label htmlFor="rsvp-party" className="block text-sm font-medium text-ink/70 mb-1">{es ? "¿Cuántos vienen?" : "How many coming?"}</label>
          <Select id="rsvp-party" value={form.party_size} onChange={(e) => set({ party_size: e.target.value })}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={String(n)}>{n}{n === 6 ? "+" : ""}</option>
            ))}
          </Select>
        </div>
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (es ? "Registrando…" : "Registering…") : es ? "Registrarse" : "Register"}
      </Button>
    </form>
  );
}
