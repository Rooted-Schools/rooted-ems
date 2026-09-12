"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { IconMail } from "@/components/ui/icons";
import { cn, displayClass } from "@/lib/utils";
import { sendNotificationTestEmail } from "../notification-test-actions";

interface TemplateMeta {
  key: string;
  label: string;
  group: string;
}

interface NotificationEmailTestsProps {
  campuses: { id: string; name: string }[];
  templates: TemplateMeta[];
  /** Staff member's own address — shown so it's clear where the test lands. */
  toEmail: string | null;
}

/**
 * Send-yourself-a-preview for every automated family notification email.
 *
 * Branding is campus-specific, so the campus picker drives which school's
 * logo/name/contact the previews render with. Each row sends one real template
 * (rendered with sample data) to the signed-in staff member — never to a
 * family, and never recorded in delivery stats.
 */
export function NotificationEmailTests({ campuses, templates, toEmail }: NotificationEmailTestsProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [campusId, setCampusId] = useState(campuses[0]?.id ?? "");
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, TemplateMeta[]>();
    for (const tpl of templates) {
      if (!byGroup.has(tpl.group)) {
        byGroup.set(tpl.group, []);
        order.push(tpl.group);
      }
      byGroup.get(tpl.group)!.push(tpl);
    }
    return order.map((g) => ({ group: g, items: byGroup.get(g)! }));
  }, [templates]);

  function sendTest(key: string, label: string) {
    if (!campusId) {
      toast({ title: "Pick a campus first", variant: "info" });
      return;
    }
    setSendingKey(key);
    startTransition(async () => {
      const result = await sendNotificationTestEmail(key, campusId);
      setSendingKey(null);
      if (result.ok) {
        toast({ title: `Sent "${label}" test`, description: toEmail ? `Check ${toEmail}` : "Check your inbox.", variant: "success" });
      } else {
        toast({ title: "Couldn't send test", description: result.error, variant: "error" });
      }
    });
  }

  return (
    <section className="rounded-[6px] border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <h2 className={cn("text-sm font-semibold uppercase tracking-wide text-ink", displayClass)}>
          Notification email previews
        </h2>
        <p className="mt-1 text-xs text-stone">
          Send yourself a copy of any automated family email to see exactly what it looks like.
          {toEmail ? <> Tests go to <span className="font-medium text-ink">{toEmail}</span>.</> : null} They
          use sample student/offer details and are never recorded as real sends.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <label htmlFor="notif-test-campus" className="text-xs font-medium text-stone">
          Branding for
        </label>
        <Select
          id="notif-test-campus"
          value={campusId}
          onChange={(e) => setCampusId(e.target.value)}
          className="w-full sm:w-64"
        >
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="divide-y divide-line">
        {groups.map(({ group, items }) => (
          <div key={group} className="px-4 py-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone">{group}</p>
            <ul className="space-y-1.5">
              {items.map((tpl) => (
                <li key={tpl.key} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm text-ink">
                    <IconMail size={14} className="shrink-0 text-stone" aria-hidden />
                    {tpl.label}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => sendTest(tpl.key, tpl.label)}
                  >
                    {sendingKey === tpl.key ? "Sending…" : "Send test to me"}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
