const TYPE_LABELS: Record<string, { en: string; es: string }> = {
  info_session: { en: "Info Session", es: "Sesión Informativa" },
  open_house: { en: "Open House", es: "Casa Abierta" },
  tour: { en: "Campus Tour", es: "Recorrido" },
  other: { en: "Event", es: "Evento" },
};

export function EventTypeLabel({ type, es }: { type: string; es: boolean }) {
  const l = TYPE_LABELS[type] ?? TYPE_LABELS.other;
  return <>{es ? l.es : l.en}</>;
}

export function formatEventWhen(startsAt: string, endsAt: string | null, es: boolean): string {
  const locale = es ? "es-US" : "en-US";
  const start = new Date(startsAt);
  const date = start.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const endTime = endsAt
    ? new Date(endsAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
    : null;
  return `${date} · ${startTime}${endTime ? `–${endTime}` : ""}`;
}
