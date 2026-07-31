import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import { FamilyHeader } from "@/components/layout/family-header";
import { FamilyTabBar } from "@/components/layout/family-tabbar";
import { LocaleProvider } from "@/lib/i18n/locale-context";
import { ToastProvider } from "@/components/ui/toast";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Locale } from "@/lib/i18n/translations";

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
  // header nav and the phone bottom tab bar.
  const db = createServiceRoleClient();
  const { count } = await db
    .from("notification")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  const unreadCount = count ?? 0;
  const cookieStore = await cookies();
  const initialLocale = (cookieStore.get("NEXT_LOCALE")?.value as Locale | undefined) ?? "en";

  return (
    <LocaleProvider initialLocale={initialLocale}>
      <ToastProvider>
        <div className="min-h-screen bg-warm-white">
          <FamilyHeader unreadMessageCount={unreadCount} />
          {/* pb-[72px] keeps content clear of the fixed 58px+ phone bottom tab bar */}
          <main className="max-w-5xl mx-auto py-6 px-4 pb-[72px] md:pb-6">{children}</main>
          <FamilyTabBar unreadMessageCount={unreadCount} />
        </div>
      </ToastProvider>
    </LocaleProvider>
  );
}
