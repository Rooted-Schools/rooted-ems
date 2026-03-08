export const runtime = "edge";

import { redirect } from "next/navigation";

export default function StaffWaitlistPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  // Waitlist is now a tab within Offers & Waitlist page
  const campusParam = searchParams?.campus ? `?campus=${searchParams.campus}` : "";
  redirect(`/staff/offers${campusParam}`);
}
