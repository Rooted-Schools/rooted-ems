"use client";

/**
 * Shared "send a tracked email" dialog for staff surfaces that need it — the
 * lead detail page and the application detail page today. One component so
 * the honest-outcome handling (loading state, ok/error toast) lives in one
 * place instead of being re-implemented per surface.
 *
 * Recipient is read-only: the family's email comes from the record (lead or
 * application), never typed in by staff, so there's no way to accidentally
 * send a tracked "family communication" to the wrong address.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { staffSendOneOffEmail } from "@/app/staff/communications/actions";

interface ComposeEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The family's email on file. Null disables sending — the dialog explains why. */
  recipientEmail: string | null;
  recipientName?: string | null;
  /** Exactly one of these identifies who the email is tracked against. */
  leadId?: string;
  applicationId?: string;
}

export function ComposeEmailDialog({
  open,
  onOpenChange,
  recipientEmail,
  recipientName,
  leadId,
  applicationId,
}: ComposeEmailDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  // Reset the draft each time the dialog is opened, so switching families
  // never carries over a half-written message meant for someone else.
  useEffect(() => {
    if (open) {
      setSubject("");
      setMessage("");
    }
  }, [open]);

  const canSend = Boolean(recipientEmail) && subject.trim().length > 0 && message.trim().length > 0;

  function handleSend() {
    if (!canSend || (!leadId && !applicationId)) return;
    startTransition(async () => {
      const result = await staffSendOneOffEmail({
        leadId,
        applicationId,
        subject: subject.trim(),
        message: message.trim(),
      });
      if (result.ok) {
        toast({ variant: "success", title: `Email sent to ${recipientName ?? recipientEmail}.` });
        onOpenChange(false);
        router.refresh();
      } else {
        // Data honesty: show the provider's real reason, never a generic
        // "sent" state when it wasn't.
        toast({ variant: "error", title: result.error });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send email</DialogTitle>
          <DialogDescription>
            This sends immediately and is logged on {recipientName ?? "this family"}&apos;s history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="block text-xs font-medium text-stone mb-1">To</label>
            <Input value={recipientEmail ?? "No email on file"} readOnly disabled className="bg-sunken/60" />
          </div>
          <div>
            <label htmlFor="compose-subject" className="block text-xs font-medium text-stone mb-1">
              Subject
            </label>
            <Input
              id="compose-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Following up on your application"
              disabled={!recipientEmail || isPending}
            />
          </div>
          <div>
            <label htmlFor="compose-message" className="block text-xs font-medium text-stone mb-1">
              Message
            </label>
            <textarea
              id="compose-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              disabled={!recipientEmail || isPending}
              placeholder="Write your message…"
              className="w-full rounded-[6px] border border-line px-3 py-2 text-sm focus:border-rooted-green focus:outline-none focus:ring-1 focus:ring-rooted-green disabled:opacity-50"
            />
          </div>
          {!recipientEmail && (
            <p className="text-sm text-warn bg-warn/10 border border-warn/30 rounded-[6px] px-3 py-2">
              This family has no email on file — there&apos;s nowhere to send this.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!canSend || isPending} className="rounded-[6px]">
            {isPending ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
