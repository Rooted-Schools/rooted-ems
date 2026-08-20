"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatRelativeTime } from "@/lib/queries/utils";
import { submitPilotFeedback } from "./actions";
import { FEEDBACK_CATEGORIES, type FeedbackCategory } from "./feedback-constants";

export interface FeedbackEntry {
  id: string;
  content: string;
  created_at: string;
  author_name: string;
}

/** Category chip tokens, per the house semantic palette. */
const CATEGORY_CHIP: Record<FeedbackCategory, string> = {
  Bug: "border-error/30 bg-error/10 text-error",
  Confusing: "border-warn/30 bg-warn/10 text-warn-text",
  Idea: "border-info/30 bg-info/10 text-info",
  "Working well": "border-rooted-green/30 bg-rooted-green/10 text-deep-green",
};

// Matches the "[Category] (where) body" tag written by submitPilotFeedback.
// The "where" group is optional; anything that doesn't match falls back to
// "Idea" with the raw content as the body, so no note is ever hidden.
const FEEDBACK_TAG_RE =
  /^\[(Bug|Confusing|Idea|Working well)\](?:\s*\(([^)]*)\))?\s*([\s\S]*)$/;

function parseFeedback(content: string): {
  category: FeedbackCategory;
  where: string | null;
  body: string;
} {
  const match = content.match(FEEDBACK_TAG_RE);
  if (!match) {
    return { category: "Idea", where: null, body: content };
  }
  const [, category, where, body] = match;
  return {
    category: category as FeedbackCategory,
    where: where && where.trim() ? where.trim() : null,
    body: body.trim(),
  };
}

// ─── Submit Form ────────────────────────────────────────────────────────────

function FeedbackForm() {
  const [category, setCategory] = useState<FeedbackCategory>("Bug");
  const [where, setWhere] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      setError("Feedback can't be empty.");
      return;
    }
    startTransition(async () => {
      const result = await submitPilotFeedback({
        category,
        where: where.trim() || undefined,
        body: trimmedBody,
      });
      if (result.error) {
        setError(result.error);
        toast({
          variant: "error",
          title: "Couldn't send feedback",
          description: result.error,
        });
      } else {
        toast({
          variant: "success",
          title: "Feedback sent",
          description: "Steven reads everything.",
        });
        setCategory("Bug");
        setWhere("");
        setBody("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="feedback-category" className="block text-sm font-medium text-ink/70 mb-1">
            Category
          </label>
          <Select
            id="feedback-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
            className="min-h-[44px] rounded-[6px]"
          >
            {FEEDBACK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="feedback-where" className="block text-sm font-medium text-ink/70 mb-1">
            Where were you? (optional)
          </label>
          <Input
            id="feedback-where"
            value={where}
            onChange={(e) => setWhere(e.target.value)}
            placeholder="e.g. Recruitment follow-up queue"
            className="min-h-[44px] rounded-[6px]"
          />
        </div>
      </div>

      <div>
        <label htmlFor="feedback-body" className="block text-sm font-medium text-ink/70 mb-1">
          Feedback
        </label>
        <textarea
          id="feedback-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={4}
          placeholder="What happened, what you expected, or what would help."
          className="flex w-full rounded-[6px] border border-stone/30 bg-white px-3 py-2 text-sm placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {error && (
        <p className="text-sm text-error bg-error/10 border border-error/30 rounded-[6px] px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isPending || !body.trim()}
          className="min-h-[44px] rounded-[6px] bg-rooted-green hover:bg-rooted-green/90 text-white"
        >
          {isPending ? "Sending…" : "Send feedback"}
        </Button>
      </div>
    </form>
  );
}

// ─── Feed Row ───────────────────────────────────────────────────────────────

function FeedbackRow({ entry }: { entry: FeedbackEntry }) {
  const { category, where, body } = parseFeedback(entry.content);
  return (
    <div className="border border-stone/15 rounded-[6px] p-4 bg-white space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`inline-flex items-center rounded-[6px] border px-1.5 py-0.5 text-[10px] font-medium ${CATEGORY_CHIP[category]}`}
        >
          {category}
        </span>
        {where && <span className="text-xs text-stone">{where}</span>}
        <span className="text-xs text-stone ml-auto shrink-0">
          {formatRelativeTime(entry.created_at)}
        </span>
      </div>
      <p className="text-sm text-ink whitespace-pre-wrap break-words">{body}</p>
      <p className="text-xs text-stone">{entry.author_name}</p>
    </div>
  );
}

// ─── Main Client ────────────────────────────────────────────────────────────

export function FeedbackClient({ entries }: { entries: FeedbackEntry[] }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Pilot feedback</h1>
        <p className="text-sm text-stone mt-1">
          What is working, what is broken, what is missing. Steven reads everything.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Share feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <FeedbackForm />
        </CardContent>
      </Card>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              title="No feedback yet."
              description="Anything that slows you down belongs here."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <FeedbackRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
