import { FamilyLoginForm } from "@/components/auth/family-login-form";
import { PublicLanguageToggle } from "@/components/ui/public-language-toggle";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export const metadata = {
  title: "Family Login | Rooted EMS",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-white px-4">
      {/* Language toggle — top-right, visible before login */}
      <div className="fixed top-4 right-4 z-50">
        <PublicLanguageToggle />
      </div>
      <FamilyLoginForm />
    </div>
  );
}
