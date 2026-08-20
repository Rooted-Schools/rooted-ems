"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatRelativeTime } from "@/lib/queries/utils";
import { buildCsv, downloadCsv } from "@/lib/csv";
import { replyToFeedback, setFeedbackResolved } from "./actions";
import type { FeedbackCategory } from "./feedback-constants";

export interface FeedbackReply {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface FeedbackItem {
  id: string;
  category: string;
  context: string | null;
  body: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
  author_name: string;
  resolver_name: string;
  screenshotUrl: string | null;
  replies: FeedbackReply[];
}

const CATEGORY_CHIP: Record<FeedbackCategory, string> = {
  Bug: "bg-error/10 text-error border-error/30",
  Confusing: "bg-amber-100 text-amber-800 border-amber-300",
  Idea: "bg-blue-100 text-blue-800 border-blue-300",
  "Working well": "bg-rooted-green/10 text-rooted-green border-rooted-green/30",
};

function chipClass(category: string): string {
  return CATEGORY_CHIP[category as FeedbackCategory] ?? "bg-stone/10 text-ink border-stone/30";
}

type Filter = "open" | "resolved" | "all";

export function FeedbackClient({ items }: { items: FeedbackItem[] }) {
  const [filter, setFilter] = useState<Filter>("open");

  const openCount = items.filter((i) => i.status === "open").length;
  const resolvedCount = items.length - openCount;

  const visible = useMemo(
    () => items.filter((i) => (filter === "all" ? true : i.status === filter)),
    [items, filter]
  );

  function exportCsv() {
    const header = [
      "Created", "Author", "Category", "Where", "Status",
      "Resolved by", "Resolved at", "Feedback", "Has screenshot", "Replies",
    ];
    const rows = items.map((i) => [
      i.created_at,
      i.author_name,
      i.category,
      i.context ?? "",
      i.status,
      i.status === "resolved" ? i.resolver_name : "",
      i.resolved_at ?? "",
      i.body,
      i.screenshotUrl ? "yes" : "no",
      i.replies.map((r) => `${r.author_name}: ${r.body}`).join(" | "),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`pilot-feedback-${today}.csv`, buildCsv(header, rows));
  }

  const TABS: { key: Filter; label: string }[] = [
    { key: "open", label: `Open (${openCount})` },
    { key: "resolved", label: `Resolved (${resolvedCount})` },
    { key: "all", label: `All (${items.length})` },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">Pilot feedback</h1>
          <p className="text-sm text-stone mt-1">
            Everything testers flag from the app, in one place. Reply in the thread, and mark it
            resolved when it is handled.
          </p>
        </div>
        <Button
          type="button"
          onClick={exportCsv}
          disabled={items.length === 0}
          className="min-h-[40px] rounded-[6px] bg-white border border-stone/30 text-ink hover:bg-rooted-gray-light"
        >
          Export to spreadsheet
        </Button>
      </div>

      <div className="flex gap-1 border-b border-stone/20">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              filter === t.key
                ? "border-rooted-green text-rooted-green"
                : "border-transparent text-ink/60 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={filter === "open" ? "No open feedback" : "Nothing here yet"}
          description={
            filter === "open"
              ? "When a tester sends feedback from the app, it lands here."
              : "Try a different filter."
          }
        />
      ) : (
        <div className="space-y-4">
          {visible.map((item) => (
            <FeedbackCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackCard({ item }: { item: FeedbackItem }) {
  const router = useRouter();
  const { toast } = useToast();
  const [reply, setReply] = useState("");
  const [isPending, startTransition] = useTransition();

  function sendReply() {
    const body = reply.trim();
    if (!body) return;
    startTransition(async () => {
      const res = await replyToFeedback({ feedbackId: item.id, body });
      if (res.error) {
        toast({ variant: "error", title: "Couldn't add reply", description: res.error });
        return;
      }
      setReply("");
      router.refresh();
    });
  }

  function toggleResolved() {
    startTransition(async () => {
      const res = await setFeedbackResolved({ feedbackId: item.id, resolved: item.status === "open" });
      if (res.error) {
        toast({ variant: "error", title: "Couldn't update status", description: res.error });
        return;
      }
      toast({
        variant: "success",
        title: item.status === "open" ? "Marked resolved" : "Reopened",
      });
      router.refresh();
    });
  }

  return (
    <Card className={item.status === "resolved" ? "opacity-80" : ""}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center rounded-[6px] border px-1.5 py-0.5 text-[11px] font-medium ${chipClass(item.category)}`}>
              {item.category}
            </span>
            {item.status === "resolved" ? (
              <span className="inline-flex items-center gap-1 rounded-[6px] border border-rooted-green/30 bg-rooted-green/10 px-1.5 py-0.5 text-[11px] font-medium text-rooted-green">
                Resolved
              </span>
            ) : (
              <span className="inline-flex items-center rounded-[6px] border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                Open
              </span>
            )}
          </div>
          <span className="text-xs text-stone">{formatRelativeTime(item.created_at)}</span>
        </div>

        <p className="text-sm text-ink whitespace-pre-wrap">{item.body}</p>

        <div className="text-xs text-stone">
          {item.author_name}
          {item.context ? <> &middot; {item.context}</> : null}
          {item.status === "resolved" && item.resolver_name !== "Unknown" ? (
            <> &middot; resolved by {item.resolver_name}</>
          ) : null}
        </div>

        {item.screenshotUrl && (
          <a href={item.screenshotUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.screenshotUrl}
              alt="Feedback screenshot"
              className="max-h-48 w-auto rounded-[6px] border border-stone/30 object-contain hover:opacity-90 transition-opacity"
            />
          </a>
        )}

        {item.replies.length > 0 && (
          <div className="space-y-2 border-l-2 border-stone/20 pl-3">
            {item.replies.map((r) => (
              <div key={r.id} className="text-sm">
                <span className="font-medium text-ink">{r.author_name}</span>
                <span className="text-xs text-stone"> &middot; {formatRelativeTime(r.created_at)}</span>
                <p className="text-ink/80 whitespace-pre-wrap">{r.body}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 pt-1">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={1}
            placeholder="Reply…"
            className="flex-1 rounded-[6px] border border-stone/30 bg-white px-3 py-2 text-sm placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
          />
          <Button
            type="button"
            onClick={sendReply}
            disabled={isPending || !reply.trim()}
            className="min-h-[40px] rounded-[6px] bg-rooted-green hover:bg-rooted-green/90 text-white"
          >
            Reply
          </Button>
          <Button
            type="button"
            onClick={toggleResolved}
            disabled={isPending}
            className={`min-h-[40px] rounded-[6px] ${
              item.status === "open"
                ? "bg-white border border-rooted-green/40 text-rooted-green hover:bg-rooted-green/10"
                : "bg-white border border-stone/30 text-ink hover:bg-rooted-gray-light"
            }`}
          >
            {item.status === "open" ? "Mark resolved" : "Reopen"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
