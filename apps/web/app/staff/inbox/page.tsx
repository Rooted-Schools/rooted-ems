import { redirect } from "next/navigation";

/**
 * The standalone staff inbox/work-queue page has been superseded by the
 * Pipeline view (see /staff/pipeline). This route is kept as a redirect
 * only — old bookmarks, emails, and links that point at /staff/inbox keep
 * working; the sidebar and every other in-app link now point at
 * /staff/pipeline directly. Mirrors the /staff/dashboard redirect pattern.
 */
export default function StaffInboxRedirectPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const campusParam = searchParams?.campus ? `?campus=${searchParams.campus}` : "";
  redirect(`/staff/pipeline${campusParam}`);
}
