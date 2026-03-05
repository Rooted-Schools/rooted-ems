import { StaffSidebar } from "@/components/layout/staff-sidebar";
import { StaffHeader } from "@/components/layout/staff-header";

export const metadata = {
  title: "Staff Console | Rooted EMS",
};

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-rooted-gray">
      <StaffSidebar />
      <div className="flex-1 flex flex-col">
        <StaffHeader />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
