"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { syncLeadsNow, type LeadSyncSummary } from "../lead-sync-actions";

/**
 * Admin control to pull the C.R. Neal lead tracker into the app on demand.
 * The tracker Google Sheet is the source of truth; this and the weekly job
 * bring one record per email into the app, never duplicates.
 */
export function LeadSyncCard() {
  const { toast } = useToast();
  const [isPending, start] = useTransition();
  const [last, setLast] = useState<LeadSyncSummary | null>(null);

  function run() {
    start(async () => {
      const r = await syncLeadsNow();
      if (!r.ok || !r.summary) {
        toast({ variant: "error", title: "Sync failed", description: r.error ?? "Please try again." });
        return;
      }
      setLast(r.summary);
      toast({
        variant: "success",
        title: "Leads synced",
        description: `${r.summary.unique_emails} families in sync. ${r.summary.to_insert} added, ${r.summary.to_update} updated.`,
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead tracker sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-stone">
          The C.R. Neal lead tracker sheet is the source of truth. Leads sync automatically every
          week, and you can pull the latest now. One record per family, never duplicates.
        </p>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={run}
            disabled={isPending}
            className="min-h-[44px] rounded-[6px] bg-rooted-green hover:bg-rooted-green/90 text-white"
          >
            {isPending ? "Syncing…" : "Sync leads now"}
          </Button>
          {last && (
            <span className="text-sm text-stone">
              {last.unique_emails} families &middot; {last.to_insert} added &middot; {last.to_update} updated
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
