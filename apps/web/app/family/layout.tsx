import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import { FamilyHeader } from "@/components/layout/family-header";
import { getFamilyPendingOffers } from "@/lib/queries";

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

  // Fetch pending offer count and unread notification count for nav badges
  const db = createServiceRoleClient();
  const [pendingOffers, unreadResult] = await Promise.all([
    user ? getFamilyPendingOffers(user.id) : Promise.resolve([]),
    user
      ? db
          .from("notification")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_read", false)
      : Promise.resolve({ count: 0 }),
  ]);

  const unreadCount = (unreadResult as { count: number | null }).count ?? 0;

  return (
    <div className="min-h-screen bg-rooted-gray">
      <FamilyHeader
        userEmail={user?.email}
        userPhone={user?.phone}
        pendingOfferCount={pendingOffers.length}
        unreadNotificationCount={unreadCount}
      />
      <main className="max-w-5xl mx-auto py-6 px-4">{children}</main>
    </div>
  );
}
