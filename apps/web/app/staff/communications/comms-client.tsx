"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { IconMail, IconPhone, IconBell, IconPenLine } from "@/components/ui/icons";
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
  recipient_address: string | null;
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
  /** Has a phone on file AND has opted in — the real send-time eligibility,
   *  not just "has a phone." */
  smsEligible: boolean;
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

function ChannelIcon({ channel, size = 14 }: { channel: string; size?: number }) {
  switch (channel) {
    case "sms":
      return <IconPhone size={size} />;
    case "in_app":
      return <IconBell size={size} />;
    case "email":
    default:
      return <IconMail size={size} />;
  }
}

const channelLabels: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  in_app: "In-App",
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

function formatSentAt(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

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
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");

  // Auto-clear feedback messages after 5 seconds
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 5000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const filteredMessages = channelFilter === "all"
    ? messages
    : messages.filter((m) => m.channel === channelFilter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Communications</h1>
          <p className="text-sm text-stone mt-1">
            Send and track messages to families via email, SMS, or in-app notifications.
          </p>
          <Link
            href="/staff/communications/automated-messages"
            className="inline-block text-xs text-stone hover:text-ink mt-1.5"
          >
            Automated messages &rarr;
          </Link>
          <Link
            href="/staff/communications/inbound"
            className="inline-block text-xs text-stone hover:text-ink mt-1.5 ml-3"
          >
            Inbound email &rarr;
          </Link>
        </div>
        <Button onClick={() => setShowNewMessage(true)}>New Message</Button>
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
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Total Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total_sent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Delivered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.delivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Queued
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats.queued > 0 ? "text-amber-600" : "text-stone/50"}`}>
              {stats.queued}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats.failed > 0 ? "text-red-600" : "text-stone/50"}`}>
              {stats.failed}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed content: Messages | Templates */}
      <Tabs defaultValue="messages">
        <TabsList>
          <TabsTrigger value="messages">
            Messages
            {messages.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-rooted-gray text-[10px] font-semibold">
                {messages.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="templates">
            Templates
            {templates.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-rooted-gray text-[10px] font-semibold">
                {templates.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Messages Tab ─── */}
        <TabsContent value="messages">
          {messages.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <EmptyState
                  icon={<IconMail size={40} />}
                  title="No messages sent yet"
                  description="Use the 'New Message' button to send your first notification to families."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Message History</CardTitle>
                    <CardDescription>Click a row to view message details.</CardDescription>
                  </div>
                  <div className="flex gap-1">
                    {["all", "in_app", "email", "sms"].map((ch) => (
                      <button
                        key={ch}
                        onClick={() => setChannelFilter(ch)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          channelFilter === ch
                            ? "bg-rooted-green text-white"
                            : "text-stone hover:bg-rooted-gray"
                        }`}
                      >
                        {ch === "all" ? (
                          "All"
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <ChannelIcon channel={ch} size={14} />
                            {channelLabels[ch]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Ch.</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMessages.map((msg) => {
                      const cfg = statusConfig[msg.status] ?? statusConfig.queued;
                      const isExpanded = expandedMsgId === msg.id;
                      return (
                        <>
                          <TableRow
                            key={msg.id}
                            className={`cursor-pointer hover:bg-rooted-gray-light ${isExpanded ? "bg-rooted-gray-light" : ""}`}
                            onClick={() => setExpandedMsgId(isExpanded ? null : msg.id)}
                          >
                            <TableCell>
                              <span className="inline-flex items-center text-stone" title={channelLabels[msg.channel] ?? msg.channel} aria-hidden="true">
                                <ChannelIcon channel={msg.channel} size={16} />
                              </span>
                            </TableCell>
                            <TableCell className="text-ink/70 text-sm">
                              {msg.recipient_address ?? "\u2014"}
                              {msg.recipient_count > 1 && (
                                <span className="ml-1 text-[10px] text-stone">
                                  +{msg.recipient_count - 1} more
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium text-sm">{msg.subject ?? "\u2014"}</TableCell>
                            <TableCell>
                              <Badge variant={cfg.variant}>{cfg.label}</Badge>
                            </TableCell>
                            <TableCell className="text-stone text-sm">
                              {formatSentAt(msg.sent_at)}
                            </TableCell>
                          </TableRow>
                          {isExpanded && (
                            <TableRow key={`${msg.id}-detail`}>
                              <TableCell colSpan={5} className="bg-rooted-gray-light/70 px-6 py-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                  <div>
                                    <span className="text-stone block">Channel</span>
                                    <span className="font-medium">{channelLabels[msg.channel] ?? msg.channel}</span>
                                  </div>
                                  <div>
                                    <span className="text-stone block">Recipients</span>
                                    <span className="font-medium">{msg.recipient_count}</span>
                                  </div>
                                  <div>
                                    <span className="text-stone block">Status</span>
                                    <span className="font-medium">{cfg.label}</span>
                                  </div>
                                  <div>
                                    <span className="text-stone block">Message ID</span>
                                    <span className="font-mono text-[10px] text-stone">{msg.id.slice(0, 12)}...</span>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ─── Templates Tab ─── */}
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Message Templates</CardTitle>
                  <CardDescription>
                    Create reusable templates for common notifications. Use these when composing new messages.
                  </CardDescription>
                </div>
                <Button onClick={() => setShowNewTemplate(true)}>
                  New Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {templates.length === 0 ? (
                <EmptyState
                  icon={<IconPenLine size={40} />}
                  title="No templates created"
                  description="Create reusable message templates to speed up your communication workflow."
                >
                  <Button size="sm" onClick={() => setShowNewTemplate(true)}>
                    Create First Template
                  </Button>
                </EmptyState>
              ) : (
                <div className="space-y-3">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="flex items-start justify-between gap-4 p-4 rounded-lg border border-stone/20 hover:border-stone/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-ink">{tpl.name}</span>
                          <Badge variant="outline" className="text-[10px] inline-flex items-center gap-1">
                            <ChannelIcon channel={tpl.channel} size={12} />
                            {channelLabels[tpl.channel] ?? tpl.channel}
                          </Badge>
                          {!tpl.is_active && (
                            <Badge variant="secondary" className="text-[10px]">Archived</Badge>
                          )}
                        </div>
                        {tpl.subject && (
                          <p className="text-xs text-stone">
                            <span className="font-medium">Subject:</span> {tpl.subject}
                          </p>
                        )}
                        <p className="text-xs text-stone mt-1 line-clamp-2">{tpl.body}</p>
                        {tpl.merge_fields && tpl.merge_fields.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {tpl.merge_fields.map((field) => (
                              <span
                                key={field}
                                className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-mono"
                              >
                                {`{{${field}}}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            // Use this template to compose a new message
                            setShowNewMessage(true);
                          }}
                        >
                          Use
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            startTransition(async () => {
                              const result = await staffDeleteTemplate(tpl.id);
                              if (result.error) {
                                setFeedback({ type: "error", message: result.error });
                              } else {
                                setFeedback({ type: "success", message: "Template archived." });
                                router.refresh();
                              }
                            });
                          }}
                          disabled={isPending}
                          className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          Archive
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
              const sent = result.data?.sentCount ?? 0;
              const skipped = result.data?.skipped ?? [];
              if (result.data?.configured === false) {
                // The provider itself isn't set up — every recipient was
                // skipped for the same reason. Say that plainly rather than
                // claiming any number of messages went out.
                setFeedback({
                  type: "error",
                  message: skipped[0]?.reason ?? "This channel isn't connected in this environment.",
                });
              } else if (skipped.length > 0) {
                const preview = skipped.slice(0, 3).map((s) => `${s.name} (${s.reason})`).join("; ");
                const more = skipped.length > 3 ? `, +${skipped.length - 3} more` : "";
                setFeedback({
                  type: sent > 0 ? "success" : "error",
                  message: `Sent to ${sent} of ${sent + skipped.length} — not reached: ${preview}${more}`,
                });
              } else {
                setFeedback({
                  type: "success",
                  message: `Sent ${sent} message${sent !== 1 ? "s" : ""} successfully.`,
                });
              }
              if (sent > 0 || result.data?.configured === false) setShowNewMessage(false);
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
  const [selectedCampusId, setSelectedCampusId] = useState<string>(
    campuses.length === 1 ? campuses[0].id : ""
  );

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setChannel("in_app");
      setSubject("");
      setBody("");
      setLink("");
      setAudienceType("all");
      setStatusTarget("submitted");
      setSelectedIds(new Set());
      setTemplateId("");
      setSelectedCampusId(campuses.length === 1 ? campuses[0].id : "");
    }
  }, [open, campuses]);

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
      campusId: selectedCampusId || undefined,
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
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Use Template (optional)
              </label>
              <select
                value={templateId}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              >
                <option value="">No template — write custom message</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({channelLabels[t.channel] ?? t.channel})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Campus */}
          {campuses.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Campus
              </label>
              <select
                value={selectedCampusId}
                onChange={(e) => setSelectedCampusId(e.target.value)}
                className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              >
                <option value="">All campuses</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Channel */}
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
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
                      : "bg-white text-ink/70 border-stone/30 hover:bg-rooted-gray-light"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ChannelIcon channel={ch} size={14} />
                    {channelLabels[ch]}
                  </span>
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
            <label className="block text-sm font-medium text-ink/70 mb-1">
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
                      : "bg-white text-ink/70 border-stone/30 hover:bg-rooted-gray-light"
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
                className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              >
                {Object.entries(appStatusLabels).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            )}

            {audienceType === "individual" && (
              <div className="max-h-40 overflow-y-auto border border-stone/20 rounded-lg">
                {recipients.length === 0 ? (
                  <p className="text-sm text-stone p-3">No recipients available.</p>
                ) : (
                  recipients.map((r) => (
                    <label
                      key={r.userId}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-rooted-gray-light cursor-pointer text-sm"
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
                        className="rounded border-stone/30"
                      />
                      <span className="font-medium">{r.name}</span>
                      <span className="text-stone text-xs">{r.email}</span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        {appStatusLabels[r.status] ?? r.status}
                      </Badge>
                    </label>
                  ))
                )}
              </div>
            )}

            <p className="text-xs text-stone mt-1">
              {recipientCount} recipient{recipientCount !== 1 ? "s" : ""} selected
            </p>
            {channel === "sms" && (() => {
              const targetIds = new Set(getTargetRecipients());
              const eligible = recipients.filter((r) => targetIds.has(r.userId) && r.smsEligible).length;
              return eligible < recipientCount ? (
                <p className="text-xs text-warn-text mt-0.5">
                  Only {eligible} of {recipientCount} can be texted — the rest have no phone on
                  file or haven&apos;t opted in. They&apos;ll be skipped, not failed silently.
                </p>
              ) : null;
            })()}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Notification title..."
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              Message
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message..."
              rows={4}
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 resize-none"
            />
          </div>

          {/* Optional link (in-app only) */}
          {channel === "in_app" && (
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Link (optional)
              </label>
              <input
                type="text"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="/family/dashboard"
                className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              />
              <p className="text-xs text-stone mt-0.5">
                Deep link shown in the notification (e.g. /family/applications)
              </p>
            </div>
          )}

          {/* Preview */}
          {(subject.trim() || body.trim()) && (
            <div className="rounded-lg border border-stone/20 bg-rooted-gray-light p-3">
              <p className="text-[10px] text-stone uppercase tracking-wider mb-2">Preview</p>
              <div className="bg-white rounded-md border border-rooted-gray p-3">
                {subject.trim() && (
                  <p className="text-sm font-semibold text-ink">{subject}</p>
                )}
                {body.trim() && (
                  <p className="text-sm text-ink/60 mt-1 whitespace-pre-wrap">{body}</p>
                )}
                {link.trim() && (
                  <p className="text-xs text-rooted-green mt-2">{link}</p>
                )}
              </div>
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

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setName("");
      setSubject("");
      setBody("");
      setChannel("in_app");
    }
  }, [open]);

  function handleSave() {
    if (!name.trim() || !body.trim()) return;
    // Detect merge fields from body ({{field_name}} pattern)
    const mergeFieldMatches = body.match(/\{\{(\w+)\}\}/g);
    const mergeFields = mergeFieldMatches
      ? [...new Set(mergeFieldMatches.map((m) => m.replace(/[{}]/g, "")))]
      : [];

    onSave({
      name: name.trim(),
      subject: subject.trim() || undefined,
      body: body.trim(),
      channel,
      mergeFields: mergeFields.length > 0 ? mergeFields : undefined,
      createdBy: staffUserId,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Template</DialogTitle>
          <DialogDescription>
            Create a reusable message template. Use {"{{field_name}}"} syntax for merge fields.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              Template Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Application Received"
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
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
                      : "bg-white text-ink/70 border-stone/30 hover:bg-rooted-gray-light"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <ChannelIcon channel={ch} size={14} />
                    {channelLabels[ch]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              Subject (optional)
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Notification subject line..."
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              Message Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the template message... Use {{student_name}}, {{campus_name}} for merge fields."
              rows={5}
              className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 resize-none"
            />
            <p className="text-xs text-stone mt-1">
              Available merge fields: {"{{student_name}}"}, {"{{guardian_name}}"}, {"{{campus_name}}"}, {"{{grade}}"}, {"{{deadline}}"}
            </p>
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
