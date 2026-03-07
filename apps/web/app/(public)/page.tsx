import { FamilyLoginForm } from "@/components/auth/family-login-form";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export const metadata = {
  title: "Family Portal | Rooted Schools",
};

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-rooted-gray px-4">
      <FamilyLoginForm />
    </div>
  );
}
