import { createServerClient } from "@rooted-ems/database/server";
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

  // Fetch pending offer count so the nav badge stays accurate on every page load.
  // This runs in the layout so ALL family pages benefit from it.
  const pendingOffers = user ? await getFamilyPendingOffers(user.id) : [];

  return (
    <div className="min-h-screen bg-rooted-gray">
      <FamilyHeader
        userEmail={user?.email}
        userPhone={user?.phone}
        pendingOfferCount={pendingOffers.length}
      />
      <main className="max-w-5xl mx-auto py-6 px-4">{children}</main>
    </div>
  );
}
