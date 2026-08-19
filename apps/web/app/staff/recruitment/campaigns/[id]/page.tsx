export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";
import {
  getCampaignDetail,
  getCampaignRecipientStatusCounts,
  getCampaignRecipientsPage,
  getCampaignDeliveryEvidence,
} from "@/lib/queries/campaign-detail";
import { renderCampaignEmail, type CampaignPayload, type CampaignTemplateKey } from "@/lib/email-templates";
import { resolveDeliveryState } from "@/lib/campaign-recipients";
import { CampaignDetailClient } from "./campaign-detail-client";

const RECIPIENTS_PAGE_SIZE = 50;

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string };
}) {
  const session = await requireStaffSession();

  const campaign = await getCampaignDetail(params.id);
  if (!campaign) notFound();

  // Same gate as every other staff detail route (see e.g.
  // app/staff/applications/[id]/page.tsx): notFound() on BOTH "doesn't
  // exist" and "exists but on a campus this staff member can't access", so
  // campus membership can't be probed by watching which error comes back.
  const accessibleCampusIds = getAccessibleCampusIds(session);
  if (accessibleCampusIds.length > 0 && !accessibleCampusIds.includes(campaign.campus_id)) {
    notFound();
  }

  // Re-render the email from the campaign's own saved template_key + payload
  // — this is how the send cron produced it, so it's the closest honest
  // reconstruction of what recipients received available without storing a
  // full HTML snapshot per send.
  const rendered = renderCampaignEmail(
    campaign.template_key as CampaignTemplateKey,
    campaign.payload as CampaignPayload,
    campaign.campus_name
  );

  const parsedPage = Number.parseInt(searchParams.page ?? "1", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const [statusCounts, recipientsPage] = await Promise.all([
    getCampaignRecipientStatusCounts(campaign.id),
    getCampaignRecipientsPage(campaign.id, page, RECIPIENTS_PAGE_SIZE),
  ]);

  const evidence = await getCampaignDeliveryEvidence(
    recipientsPage.rows.map((r) => r.lead_id),
    rendered.subject,
    campaign.created_at
  );

  const recipients = recipientsPage.rows.map((r) => ({
    ...r,
    delivery: resolveDeliveryState(r.status, evidence.get(r.lead_id) ?? null),
  }));

  const totalPages = Math.max(1, Math.ceil(recipientsPage.total / RECIPIENTS_PAGE_SIZE));

  return (
    <CampaignDetailClient
      campaign={campaign}
      statusCounts={statusCounts}
      subject={rendered.subject}
      html={rendered.html}
      text={rendered.text}
      recipients={recipients}
      recipientsTotal={recipientsPage.total}
      page={page}
      totalPages={totalPages}
      pageSize={RECIPIENTS_PAGE_SIZE}
    />
  );
}
