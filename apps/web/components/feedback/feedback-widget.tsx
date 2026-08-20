"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { usePathname } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { uploadFile, validateFile, formatFileValidationError } from "@/lib/storage/upload";
import { FEEDBACK_CATEGORIES, type FeedbackCategory } from "@/app/staff/feedback/feedback-constants";
import { submitPilotFeedback } from "@/app/staff/feedback/actions";

/**
 * A pop-up feedback widget mounted on every staff page (see app/staff/layout).
 * A tester can flag something the moment they hit it, without navigating away,
 * and attach a screenshot — pasted straight from the clipboard (Cmd+Ctrl+Shift+4
 * on a Mac) or chosen as a file. The screenshot goes to the shared documents
 * bucket under the tester's own folder; the feedback page renders it back with
 * a server-signed URL so the whole team can see it.
 */
export function FeedbackWidget({
  staffUserId,
  activeCampusId,
}: {
  staffUserId: string;
  activeCampusId: string | null;
}) {
  const pathname = usePathname();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [category, setCategory] = useState<FeedbackCategory>("Bug");
  const [where, setWhere] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Default the "where" hint to the page the tester opened the widget on, so a
  // report is always anchored to a screen even if they don't type anything.
  useEffect(() => {
    if (open) setWhere((w) => w || pathname || "");
  }, [open, pathname]);

  // Object URL for the thumbnail preview; revoked when the file changes or the
  // widget unmounts so we don't leak blob URLs.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function chooseFile(f: File | null) {
    if (!f) {
      setFile(null);
      return;
    }
    const invalid = validateFile(f);
    if (invalid) {
      setError(formatFileValidationError(invalid));
      return;
    }
    setError(null);
    setFile(f);
  }

  // Paste-to-attach: grab the first image on the clipboard while the dialog is
  // open. This is the natural path after a Mac screenshot-to-clipboard.
  function onPaste(e: React.ClipboardEvent) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const f = item.getAsFile();
    if (f) {
      e.preventDefault();
      chooseFile(f);
    }
  }

  function reset() {
    setCategory("Bug");
    setWhere("");
    setBody("");
    setFile(null);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Feedback can't be empty.");
      return;
    }

    startTransition(async () => {
      let screenshotPath: string | undefined;
      if (file) {
        const result = await uploadFile(file, staffUserId);
        if (result.error) {
          setError(
            result.error === "file_too_large"
              ? "That image is over the 10MB limit."
              : result.error === "not_signed_in"
                ? "Your session expired. Sign in again and retry."
                : "The screenshot could not be uploaded. Try again, or send without it."
          );
          return;
        }
        screenshotPath = result.storagePath;
      }

      const res = await submitPilotFeedback({
        category,
        where: where.trim() || undefined,
        body: trimmed,
        screenshotPath,
        campusId: activeCampusId,
      });

      if (res.error) {
        setError(res.error);
        toast({ variant: "error", title: "Couldn't send feedback", description: res.error });
        return;
      }

      toast({ variant: "success", title: "Feedback sent", description: "Steven reads everything." });
      reset();
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 inline-flex items-center gap-2 rounded-full bg-rooted-green px-4 py-3 text-sm font-medium text-white shadow-lg hover:bg-rooted-green/90 focus:outline-none focus:ring-2 focus:ring-rooted-green focus:ring-offset-2 transition-colors"
        aria-label="Send pilot feedback"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Feedback
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onPaste={onPaste}>
          <DialogHeader>
            <DialogTitle>Send feedback</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="fw-category" className="block text-sm font-medium text-ink/70 mb-1">
                  Category
                </label>
                <Select
                  id="fw-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                  className="min-h-[44px] rounded-[6px]"
                >
                  {FEEDBACK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label htmlFor="fw-where" className="block text-sm font-medium text-ink/70 mb-1">
                  Where were you? (optional)
                </label>
                <Input
                  id="fw-where"
                  value={where}
                  onChange={(e) => setWhere(e.target.value)}
                  placeholder="e.g. /staff/applications"
                  className="min-h-[44px] rounded-[6px]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="fw-body" className="block text-sm font-medium text-ink/70 mb-1">
                Feedback
              </label>
              <textarea
                id="fw-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                rows={4}
                placeholder="What happened, what you expected, or what would help."
                className="flex w-full rounded-[6px] border border-stone/30 bg-white px-3 py-2 text-sm placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
              />
            </div>

            <div>
              <span className="block text-sm font-medium text-ink/70 mb-1">Screenshot (optional)</span>
              {file && previewUrl ? (
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Screenshot preview"
                    className="h-24 w-auto rounded-[6px] border border-stone/30 object-contain"
                  />
                  <div className="text-sm text-ink/70">
                    <p className="truncate max-w-[200px]">{file.name}</p>
                    <button
                      type="button"
                      onClick={() => chooseFile(null)}
                      className="mt-1 text-error hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-[6px] border border-dashed border-stone/40 px-3 py-4 text-sm text-ink/60 hover:border-rooted-green hover:text-rooted-green transition-colors"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Attach or paste an image
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1 text-xs text-stone">Tip: on a Mac, press Cmd+Ctrl+Shift+4 to copy a screenshot, then paste here.</p>
            </div>

            {error && (
              <p className="text-sm text-error bg-error/10 border border-error/30 rounded-[6px] px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-[44px] rounded-[6px] bg-white border border-stone/30 text-ink hover:bg-rooted-gray-light"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending || !body.trim()}
                className="min-h-[44px] rounded-[6px] bg-rooted-green hover:bg-rooted-green/90 text-white"
              >
                {isPending ? "Sending…" : "Send feedback"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
