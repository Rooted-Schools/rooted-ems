import { createServerClient } from "@rooted-ems/database/server";
import { getUnreadNotificationCount, getFamilyPrimaryCampus } from "@/lib/queries";
import { getCampusIdentityByShortCode } from "@/lib/campus-identity";
import { FamilyHeader } from "@/components/layout/family-header";
import { FamilyTabBar } from "@/components/layout/family-tabbar";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { getLocaleCookie } from "@/lib/i18n/get-locale";
import { ToastProvider } from "@/components/ui/toast";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Family Portal | Rooted EMS",
};

export default async function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Unread message count powers the Messages badge in both the desktop
  // header nav and the phone bottom tab bar. Family context only, so a
  // dual-role user's staff-console notifications don't inflate this badge.
  const unreadCount = await getUnreadNotificationCount(user.id, "family");
  // Undefined (no "?? en" default) when no cookie has ever been set, so
  // LocaleProvider falls back to detecting the browser's language instead
  // of silently defaulting to English for a first-time family visitor.
  const initialLocale = await getLocaleCookie();

  // The family's campus, from their most recent application — powers the
  // campus-branded header (components/layout/family-header.tsx). Null for a
  // family with no application yet, or a short_code this app doesn't have
  // an identity for; either way the header falls back to the network
  // wordmark rather than guessing.
  const primaryCampus = await getFamilyPrimaryCampus(user.id);
  const campusIdentity = primaryCampus
    ? getCampusIdentityByShortCode(primaryCampus.shortCode)
    : undefined;

  return (
    <LocaleProvider initialLocale={initialLocale}>
      <ToastProvider>
        <div className="min-h-screen bg-warm-white">
          <FamilyHeader unreadMessageCount={unreadCount} campusIdentity={campusIdentity} />
          {/* pb-[72px] keeps content clear of the fixed 58px+ phone bottom tab bar */}
          <main className="max-w-5xl mx-auto py-6 px-4 pb-[72px] md:pb-6">{children}</main>
          <FamilyTabBar unreadMessageCount={unreadCount} />
        </div>
      </ToastProvider>
    </LocaleProvider>
  );
}
