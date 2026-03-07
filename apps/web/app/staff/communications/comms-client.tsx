"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  staffSendNotification,
  staffCreateTemplate,
  staffDeleteTemplate,
} from "./actions";

// ─── Types ──────────────────────────────────────────────

interface CommunicationRow {
  id: string;
  subject: string | null;
  channel: string;
  status: string;
  sent_at: string | null;
  recipient_count: number;
}

interface CommunicationStats {
  total_sent: number;
  delivered: number;
  queued: number;
  failed: number;
}

interface MessageTemplate {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  channel: string;
  merge_fields: string[];
  is_active: boolean;
}

interface Recipient {
  userId: string;
  name: string;
  email: string;
  status: string;
  campus: string;
}

interface CommsClientProps {
  messages: CommunicationRow[];
  stats: CommunicationStats;
  templates: MessageTemplate[];
  recipients: Recipient[];
  campuses: { id: string; name: string }[];
  staffUserId: string;
}

// ─── Constants ──────────────────────────────────────────

const channelIcons: Record<string, string> = {
  email: "📧",
  sms: "📱",
  in_app: "🔔",
};

const statusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "secondary" }> = {
  queued: { label: "Queued", variant: "secondary" },
  sent: { label: "Sent", variant: "default" },
  delivered: { label: "Delivered", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  bounced: { label: "Bounced", variant: "warning" },
};

const appStatusLabels: Record<string, string> = {
  submitted: "Submitted",
  needs_info: "Needs Info",
  verified: "Verified",
  lottery_assigned: "In Lottery",
  offered: "Offered",
  accepted: "Accepted",
  registered: "Registered",
};

// ─── Main Component ─────────────────────────────────────

export function CommsClient({
  messages,
  stats,
  templates,
  recipients,
  campuses,
  staffUserId,
}: CommsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Communications</h1>
          <p className="text-sm text-gray-500 mt-1">
            Send and track messages to families via email, SMS, or in-app notifications.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTemplates(true)}>
            Message Templates
          </Button>
          <Button onClick={() => setShowNewMessage(true)}>New Message</Button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-sm ${
            feedback.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_sent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Delivered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.delivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Queued
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats.queued > 0 ? "text-amber-600" : "text-gray-300"}`}>
              {stats.queued}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats.failed > 0 ? "text-red-600" : "text-gray-300"}`}>
              {stats.failed}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Message Log */}
      {messages.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon="📧"
              title="No messages sent yet"
              description="Use the 'New Message' button to send your first notification to families."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Messages</CardTitle>
            <CardDescription>All messages sent from the enrollment system.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((msg) => {
                  const cfg = statusConfig[msg.status] ?? statusConfig.queued;
                  return (
                    <TableRow key={msg.id}>
                      <TableCell>
                        <span className="text-lg" aria-hidden="true">
                          {channelIcons[msg.channel] ?? "📧"}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{msg.subject ?? "\u2014"}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-500">{msg.sent_at ?? "\u2014"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* New Message Dialog */}
      <NewMessageDialog
        open={showNewMessage}
        onOpenChange={setShowNewMessage}
        recipients={recipients}
        templates={templates}
        campuses={campuses}
        isPending={isPending}
        onSend={(input) => {
          startTransition(async () => {
            const result = await staffSendNotification(input);
            if (result.error) {
              setFeedback({ type: "error", message: result.error });
            } else {
              setFeedback({
                type: "success",
                message: `Sent ${result.data?.sentCount ?? 0} notification${(result.data?.sentCount ?? 0) !== 1 ? "s" : ""} successfully.`,
              });
              setShowNewMessage(false);
              router.refresh();
            }
          });
        }}
      />

      {/* Templates Dialog */}
      <TemplatesDialog
        open={showTemplates}
        onOpenChange={setShowTemplates}
        templates={templates}
        campuses={campuses}
        staffUserId={staffUserId}
        isPending={isPending}
        onShowNew={() => {
          setShowTemplates(false);
          setShowNewTemplate(true);
        }}
        onDelete={(id) => {
          startTransition(async () => {
            const result = await staffDeleteTemplate(id);
            if (result.error) {
              setFeedback({ type: "error", message: result.error });
            } else {
              setFeedback({ type: "success", message: "Template archived." });
              router.refresh();
            }
          });
        }}
      />

      {/* New Template Dialog */}
      <NewTemplateDialog
        open={showNewTemplate}
        onOpenChange={setShowNewTemplate}
        campuses={campuses}
        staffUserId={staffUserId}
        isPending={isPending}
        onSave={(input) => {
          startTransition(async () => {
            const result = await staffCreateTemplate(input);
            if (result.error) {
              setFeedback({ type: "error", message: result.error });
            } else {
              setFeedback({ type: "success", message: "Template created." });
              setShowNewTemplate(false);
              router.refresh();
            }
          });
        }}
      />
    </div>
  );
}

// ─── New Message Dialog ─────────────────────────────────

function NewMessageDialog({
  open,
  onOpenChange,
  recipients,
  templates,
  campuses,
  isPending,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: Recipient[];
  templates: MessageTemplate[];
  campuses: { id: string; name: string }[];
  isPending: boolean;
  onSend: (input: {
    recipientUserIds: string[];
    campusId?: string;
    channel: "email" | "sms" | "in_app";
    subject: string;
    body: string;
    link?: string;
    templateId?: string;
  }) => void;
}) {
  const [channel, setChannel] = useState<"in_app" | "email" | "sms">("in_app");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [audienceType, setAudienceType] = useState<"all" | "status" | "individual">("all");
  const [statusTarget, setStatusTarget] = useState("submitted");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState("");

  function handleTemplateSelect(tplId: string) {
    setTemplateId(tplId);
    const tpl = templates.find((t) => t.id === tplId);
    if (tpl) {
      setSubject(tpl.subject ?? tpl.name);
      setBody(tpl.body);
      setChannel(tpl.channel as "in_app" | "email" | "sms");
    }
  }

  function getTargetRecipients(): string[] {
    if (audienceType === "all") return recipients.map((r) => r.userId);
    if (audienceType === "status")
      return recipients.filter((r) => r.status === statusTarget).map((r) => r.userId);
    return Array.from(selectedIds);
  }

  function handleSend() {
    const ids = getTargetRecipients();
    if (ids.length === 0 || !subject.trim() || !body.trim()) return;
    onSend({
      recipientUserIds: ids,
      channel,
      subject: subject.trim(),
      body: body.trim(),
      link: link.trim() || undefined,
      templateId: templateId || undefined,
    });
  }

  const recipientCount = getTargetRecipients().length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Send Notification</DialogTitle>
          <DialogDescription>
            Send an in-app notification to families. Email and SMS delivery will be available when provider integration is configured.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Template selector */}
          {templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Use Template (optional)
              </label>
              <select
                value={templateId}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              >
                <option value="">No template — write custom message</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.channel})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Channel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Channel
            </label>
            <div className="flex gap-2">
              {(["in_app", "email", "sms"] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannel(ch)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    channel === ch
                      ? "bg-rooted-green text-white border-rooted-green"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {channelIcons[ch]} {ch === "in_app" ? "In-App" : ch === "email" ? "Email" : "SMS"}
                </button>
              ))}
            </div>
            {channel !== "in_app" && (
              <p className="text-xs text-amber-600 mt-1">
                {channel === "email" ? "Email" : "SMS"} delivery requires provider setup. Messages will be queued.
              </p>
            )}
          </div>

          {/* Audience */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Audience
            </label>
            <div className="flex gap-2 mb-2">
              {(["all", "status", "individual"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAudienceType(type)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    audienceType === type
                      ? "bg-rooted-green text-white border-rooted-green"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {type === "all" ? "All Families" : type === "status" ? "By Status" : "Individual"}
                </button>
              ))}
            </div>

            {audienceType === "status" && (
              <select
                value={statusTarget}
                onChange={(e) => setStatusTarget(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              >
                {Object.entries(appStatusLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            )}

            {audienceType === "individual" && (
              <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg">
                {recipients.length === 0 ? (
                  <p className="text-sm text-gray-400 p-3">No recipients available.</p>
                ) : (
                  recipients.map((r) => (
                    <label
                      key={r.userId}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.userId)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(r.userId);
                          else next.delete(r.userId);
                          setSelectedIds(next);
                        }}
                        className="rounded border-gray-300"
                      />
                      <span className="font-medium">{r.name}</span>
                      <span className="text-gray-400">{r.email}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        {appStatusLabels[r.status] ?? r.status}
                      </Badge>
                    </label>
                  ))
                )}
              </div>
            )}

            <p className="text-xs text-gray-500 mt-1">
              {recipientCount} recipient{recipientCount !== 1 ? "s" : ""} selected
            </p>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Notification title..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 resize-none"
            />
          </div>

          {/* Optional link (in-app only) */}
          {channel === "in_app" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Link (optional)
              </label>
              <input
                type="text"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="/family/dashboard"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              />
              <p className="text-xs text-gray-400 mt-0.5">
                Deep link shown in the notification (e.g. /family/applications)
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isPending || recipientCount === 0 || !subject.trim() || !body.trim()}
          >
            {isPending ? "Sending..." : `Send to ${recipientCount} recipient${recipientCount !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Templates Dialog ───────────────────────────────────

function TemplatesDialog({
  open,
  onOpenChange,
  templates,
  campuses,
  staffUserId,
  isPending,
  onShowNew,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: MessageTemplate[];
  campuses: { id: string; name: string }[];
  staffUserId: string;
  isPending: boolean;
  onShowNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Message Templates</DialogTitle>
          <DialogDescription>
            Reusable message templates for common notifications.
          </DialogDescription>
        </DialogHeader>

        {templates.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-400 mb-3">No templates created yet.</p>
            <Button size="sm" onClick={onShowNew}>
              Create First Template
            </Button>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-start justify-between gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{tpl.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {channelIcons[tpl.channel] ?? ""} {tpl.channel === "in_app" ? "In-App" : tpl.channel}
                    </Badge>
                  </div>
                  {tpl.subject && (
                    <p className="text-xs text-gray-500 mt-0.5">Subject: {tpl.subject}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1 truncate">{tpl.body}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(tpl.id)}
                  disabled={isPending}
                  className="text-xs text-red-600 hover:text-red-700 shrink-0"
                >
                  Archive
                </Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={onShowNew}>New Template</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Template Dialog ────────────────────────────────

function NewTemplateDialog({
  open,
  onOpenChange,
  campuses,
  staffUserId,
  isPending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campuses: { id: string; name: string }[];
  staffUserId: string;
  isPending: boolean;
  onSave: (input: {
    campusId?: string;
    name: string;
    subject?: string;
    body: string;
    channel: "email" | "sms" | "in_app";
    mergeFields?: string[];
    createdBy?: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState<"in_app" | "email" | "sms">("in_app");

  function handleSave() {
    if (!name.trim() || !body.trim()) return;
    onSave({
      name: name.trim(),
      subject: subject.trim() || undefined,
      body: body.trim(),
      channel,
      createdBy: staffUserId,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Template</DialogTitle>
          <DialogDescription>
            Create a reusable message template for common notifications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Application Received"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Channel
            </label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as "in_app" | "email" | "sms")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            >
              <option value="in_app">In-App Notification</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject (optional)
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Notification subject line..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the template message..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending || !name.trim() || !body.trim()}>
            {isPending ? "Saving..." : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
