import { createServerClient } from "@rooted-ems/database/server";
import { FamilyHeader } from "@/components/layout/family-header";

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

  return (
    <div className="min-h-screen bg-rooted-gray">
      <FamilyHeader userEmail={user?.email} userPhone={user?.phone} />
      <main className="max-w-5xl mx-auto py-6 px-4">{children}</main>
    </div>
  );
}
