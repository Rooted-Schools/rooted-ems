import { FamilyLoginForm } from "@/components/auth/family-login-form";

export const metadata = {
  title: "Family Login | Rooted EMS",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-rooted-gray px-4">
      <FamilyLoginForm />
    </div>
  );
}
