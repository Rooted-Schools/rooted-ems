import { Suspense } from "react";
import { StaffLoginForm } from "@/components/auth/staff-login-form";

export const dynamic = "force-dynamic";
export const runtime = "edge";

export const metadata = {
  title: "Staff Login | Rooted EMS",
};

export default function StaffLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-warm-white px-4">
      <Suspense fallback={<div className="w-full max-w-md h-80" />}>
        <StaffLoginForm />
      </Suspense>
    </div>
  );
}
