"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { IconUsers, IconMail, IconInfo } from "@/components/ui/icons";
import { formatRelativeTime } from "@/lib/queries/utils";
import { CAMPAIGN_TEMPLATES, type CampaignTemplateKey } from "@/lib/email-templates";
import {
  recipientStatusLabel,
  type DeliveryState,
} from "@/lib/campaign-recipients";
import type { CampaignDetail } from "@/lib/queries/campaign-detail";

const AUDIENCE_LABELS: Record<string, string> = {
  open: "All open leads",
  new: "New leads",
  contacted: "Contacted leads",
  engaged: "Engaged leads",
};

const STATUS_BADGE: Record<string, BadgeProps["variant"]> = {
  sending: "secondary",
  complete: "success",
  cancelled: "outline",
};

function formatAbsoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Recipient count tiles, in a fixed order — only statuses actually present are shown. */
const STAT_ORDER = ["sent", "pending", "failed", "suppressed"];

function deliveryDisplay(state: DeliveryState): { label: string; variant: BadgeProps["variant"] } {
  switch (state.kind) {
    case "not_sent":
      return { label: "Not sent yet", variant: "secondary" };
    case "failed":
      return { label: "Failed to send", variant: "destructive" };
    case "skipped":
      return { label: recipientStatusLabel(state.status), variant: "outline" };
    case "sent_unrecorded":
      return { label: "Sent (delivery not recorded)", variant: "secondary" };
    case "delivered":
      return { label: "Delivered", variant: "success" };
    case "opened":
      return { label: "Opened", variant: "success" };
    case "clicked":
      return { label: "Clicked", variant: "success" };
    default:
      return { label: "Unknown", variant: "outline" };
  }
}

interface RecipientWithDelivery {
  id: string;
  lead_id: string;
  email: string;
  status: string;
  sent_at: string | null;
  delivery: DeliveryState;
}

interface CampaignDetailClientProps {
  campaign: CampaignDetail;
  statusCounts: { total: number; byStatus: Record<string, number> };
  subject: string;
  html: string;
  text: string;
  recipients: RecipientWithDelivery[];
  recipientsTotal: number;
  page: number;
  totalPages: number;
  pageSize: number;
}

export function CampaignDetailClient({
  campaign,
  statusCounts,
  subject,
  html,
  text,
  recipients,
  recipientsTotal,
  page,
  totalPages,
  pageSize,
}: CampaignDetailClientProps) {
  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");

  const templateLabel =
    CAMPAIGN_TEMPLATES[campaign.template_key as CampaignTemplateKey]?.label ?? campaign.template_key;
  const audienceLabel = AUDIENCE_LABELS[campaign.audience_stage] ?? campaign.audience_stage;

  const from = recipientsTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, recipientsTotal);

  return (
    <div className="space-y-6">
      <Link href="/staff/recruitment" className="text-sm text-rooted-green hover:underline">
        &larr; Back to Recruitment
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink">{campaign.name}</h1>
            <Badge variant={STATUS_BADGE[campaign.status] ?? "secondary"}>
              {campaign.status === "complete"
                ? "Complete"
                : campaign.status === "cancelled"
                  ? "Cancelled"
                  : "Sending"}
            </Badge>
          </div>
          <p className="text-sm text-stone mt-1">
            {campaign.campus_name} &middot; {templateLabel} &middot; {audienceLabel} &middot; created{" "}
            <time dateTime={campaign.created_at} title={formatAbsoluteDate(campaign.created_at)}>
              {formatRelativeTime(campaign.created_at)}
            </time>
            {campaign.completed_at && (
              <>
                {" "}
                &middot; completed{" "}
                <time dateTime={campaign.completed_at} title={formatAbsoluteDate(campaign.completed_at)}>
                  {formatRelativeTime(campaign.completed_at)}
                </time>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Recipient counts — only statuses with a real count are shown. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-[6px] border border-line bg-white px-4 py-3">
          <p className="text-xs text-stone flex items-center gap-1">
            <IconUsers size={14} /> Recipients
          </p>
          <p className="text-xl font-semibold text-ink mt-0.5">{statusCounts.total.toLocaleString()}</p>
        </div>
        {STAT_ORDER.filter((s) => (statusCounts.byStatus[s] ?? 0) > 0).map((s) => (
          <div key={s} className="rounded-[6px] border border-line bg-white px-4 py-3">
            <p className="text-xs text-stone">{recipientStatusLabel(s)}</p>
            <p className="text-xl font-semibold text-ink mt-0.5">
              {statusCounts.byStatus[s].toLocaleString()}
            </p>
          </div>
        ))}
        {Object.keys(statusCounts.byStatus)
          .filter((s) => !STAT_ORDER.includes(s))
          .map((s) => (
            <div key={s} className="rounded-[6px] border border-line bg-white px-4 py-3">
              <p className="text-xs text-stone">{recipientStatusLabel(s)}</p>
              <p className="text-xl font-semibold text-ink mt-0.5">
                {statusCounts.byStatus[s].toLocaleString()}
              </p>
            </div>
          ))}
      </div>

      {/* Email preview — the point of this page. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-1.5">
            <IconMail size={16} /> What was sent
          </CardTitle>
          <CardDescription>Subject: {subject}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPreviewMode("html")}
              className={`min-h-[44px] px-3 rounded-[6px] text-sm font-medium border ${
                previewMode === "html"
                  ? "border-rooted-green bg-rooted-green/5 text-deep-green"
                  : "border-stone/30 text-ink/70 hover:bg-sunken"
              }`}
            >
              Email view
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode("text")}
              className={`min-h-[44px] px-3 rounded-[6px] text-sm font-medium border ${
                previewMode === "text"
                  ? "border-rooted-green bg-rooted-green/5 text-deep-green"
                  : "border-stone/30 text-ink/70 hover:bg-sunken"
              }`}
            >
              Plain text
            </button>
          </div>

          {previewMode === "html" ? (
            <div className="rounded-[6px] border border-line overflow-hidden bg-sunken/40">
              {/* sandbox="" (no allow-scripts, no allow-same-origin) so campaign
                  HTML can render but cannot run script or reach the staff
                  console — see house rules on the sandboxed preview. */}
              <iframe
                title="Campaign email preview"
                srcDoc={html}
                sandbox=""
                className="w-full h-[520px] bg-white"
              />
            </div>
          ) : (
            <div className="rounded-[6px] border border-line bg-sunken/40 p-4 max-h-[520px] overflow-y-auto">
              <pre className="whitespace-pre-wrap font-sans text-sm text-ink">{text}</pre>
            </div>
          )}

          <p className="text-xs text-stone flex items-start gap-1.5">
            <IconInfo size={14} className="mt-0.5 shrink-0" />
            This is rendered from the campaign&apos;s saved content, so if the underlying template has
            changed since this campaign was sent, the wording here may differ from what families
            actually received.
          </p>
        </CardContent>
      </Card>

      {/* Recipients */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-1.5">
            <IconUsers size={16} /> Recipients
          </CardTitle>
          <CardDescription>
            {recipientsTotal === 0
              ? "No recipients recorded for this campaign."
              : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${recipientsTotal.toLocaleString()}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recipients.length === 0 ? (
            <p className="text-sm text-stone py-6 text-center">
              No recipients to show{page > 1 ? " on this page." : " for this campaign."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-stone">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => {
                    const delivery = deliveryDisplay(r.delivery);
                    return (
                      <tr key={r.id} className="border-b border-line/60 last:border-0">
                        <td className="py-2 pr-4 text-ink">{r.email}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline">{recipientStatusLabel(r.status)}</Badge>
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={delivery.variant}>{delivery.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {recipientsTotal > 0 && (
            <p className="text-xs text-stone flex items-start gap-1.5">
              <IconInfo size={14} className="mt-0.5 shrink-0" />
              Delivered, opened, and clicked reflect provider tracking events matched to this campaign by
              recipient and subject line; some email apps preload images automatically, which can make
              "opened" read higher than real engagement.
            </p>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-stone">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 && (
                  <Link
                    href={`/staff/recruitment/campaigns/${campaign.id}?page=${page - 1}`}
                    className="inline-flex min-h-[44px] items-center text-sm px-3 border border-stone/30 rounded-[6px] hover:bg-rooted-gray-light no-underline text-ink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rooted-green"
                  >
                    Previous
                  </Link>
                )}
                {page < totalPages && (
                  <Link
                    href={`/staff/recruitment/campaigns/${campaign.id}?page=${page + 1}`}
                    className="inline-flex min-h-[44px] items-center text-sm px-3 border border-stone/30 rounded-[6px] hover:bg-rooted-gray-light no-underline text-ink/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rooted-green"
                  >
                    Next
                  </Link>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
