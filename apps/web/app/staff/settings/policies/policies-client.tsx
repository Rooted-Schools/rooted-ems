"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn, displayClass } from "@/lib/utils";
import { staffSetCampusPolicy } from "../actions";

interface PolicyItem {
  itemType: string;
  title: string;
  defaultEn: string;
  defaultEs: string;
  overrideEn: string;
  overrideEs: string;
}

interface PoliciesClientProps {
  campuses: { id: string; name: string }[];
  activeCampusId: string;
  items: PolicyItem[];
}

/**
 * Editor for a campus's registration-policy text. Each policy starts from the
 * school's own text where it exists, otherwise the built-in default (so staff
 * edit real wording, never a blank box). Clearing both languages resets it to
 * the built-in default.
 */
export function PoliciesClient({ campuses, activeCampusId, items }: PoliciesClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // Per-item working text: override if present, else the built-in default.
  const [drafts, setDrafts] = useState<Record<string, { en: string; es: string }>>(() => {
    const d: Record<string, { en: string; es: string }> = {};
    for (const it of items) {
      d[it.itemType] = {
        en: it.overrideEn || it.defaultEn,
        es: it.overrideEs || it.defaultEs,
      };
    }
    return d;
  });

  function setDraft(itemType: string, patch: Partial<{ en: string; es: string }>) {
    setDrafts((prev) => ({ ...prev, [itemType]: { ...prev[itemType], ...patch } }));
  }

  function save(it: PolicyItem) {
    const draft = drafts[it.itemType];
    setSavingKey(it.itemType);
    startTransition(async () => {
      const result = await staffSetCampusPolicy(activeCampusId, it.itemType, draft.en, draft.es);
      setSavingKey(null);
      if (result.error) {
        toast({ title: "Couldn't save", description: result.error, variant: "error" });
      } else {
        toast({ title: `Saved "${it.title}"`, variant: "success" });
        router.refresh();
      }
    });
  }

  function resetToDefault(it: PolicyItem) {
    setDraft(it.itemType, { en: it.defaultEn, es: it.defaultEs });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/staff/settings" className="text-sm text-rooted-green hover:underline">
          &larr; Back to Settings
        </Link>
        <h1 className={cn("mt-2 text-2xl font-bold text-ink", displayClass)}>Registration policies</h1>
        <p className="mt-1 text-sm text-stone">
          Edit the exact text a family reads and signs for each policy. Empty text falls back to the
          built-in default. Changes apply to the selected campus only.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="policy-campus" className="text-xs font-medium text-stone">
          Campus
        </label>
        <Select
          id="policy-campus"
          value={activeCampusId}
          onChange={(e) => router.push(`/staff/settings/policies?campus=${e.target.value}`)}
          className="w-full sm:w-72"
        >
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-4">
        {items.map((it) => {
          const draft = drafts[it.itemType];
          const isCustomized = !!(it.overrideEn.trim() || it.overrideEs.trim());
          return (
            <section key={it.itemType} className="rounded-[6px] border border-line bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">{it.title}</h2>
                <span
                  className={cn(
                    "rounded-[6px] border px-2 py-0.5 text-xs font-medium",
                    isCustomized
                      ? "border-rooted-green/30 bg-rooted-green/10 text-deep-green"
                      : "border-line bg-sunken/40 text-stone"
                  )}
                >
                  {isCustomized ? "Customized" : "Using default"}
                </span>
              </div>
              <div className="space-y-3 px-4 py-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone">English</label>
                  <textarea
                    value={draft.en}
                    onChange={(e) => setDraft(it.itemType, { en: e.target.value })}
                    rows={5}
                    className="w-full rounded-[6px] border border-line bg-white px-2.5 py-2 text-sm text-ink"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-stone">Spanish</label>
                  <textarea
                    value={draft.es}
                    onChange={(e) => setDraft(it.itemType, { es: e.target.value })}
                    rows={5}
                    className="w-full rounded-[6px] border border-line bg-white px-2.5 py-2 text-sm text-ink"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={() => save(it)}
                  >
                    {savingKey === it.itemType ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => resetToDefault(it)}
                  >
                    Reset to default
                  </Button>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
