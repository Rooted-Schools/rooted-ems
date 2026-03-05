import { FamilyHeader } from "@/components/layout/family-header";

export const metadata = {
  title: "Family Portal | Rooted EMS",
};

export default function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-rooted-gray">
      <FamilyHeader />
      <main className="max-w-5xl mx-auto py-6 px-4">{children}</main>
    </div>
  );
}
