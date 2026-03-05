import { StaffLoginForm } from "@/components/auth/staff-login-form";

export const metadata = {
  title: "Staff Login | Rooted EMS",
};

export default function StaffLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-rooted-gray px-4">
      <StaffLoginForm />
    </div>
  );
}
