import { redirect } from "next/navigation";

/**
 * The KPI dashboard has been replaced by the staff "Today" exception queue
 * (see /staff/today). This route is kept as a redirect only — old bookmarks,
 * emails, and links that point at /staff/dashboard keep working; the sidebar
 * "Today" nav item and every other in-app link now point at /staff/today
 * directly.
 */
export default function StaffDashboardRedirectPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const campusParam = searchParams?.campus ? `?campus=${searchParams.campus}` : "";
  redirect(`/staff/today${campusParam}`);
}
