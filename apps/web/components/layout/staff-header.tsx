"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@rooted-ems/database";
import { Select } from "@/components/ui/select";

interface StaffHeaderProps {
  userEmail?: string | null;
  campuses?: Array<{ id: string; name: string }>;
}

export function StaffHeader({
  userEmail,
  campuses = [],
}: StaffHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read current campus from URL, fall back to "all"
  const selectedCampus = searchParams.get("campus") ?? "";

  const supabase = createBrowserClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/staff-login";
  }

  function handleCampusChange(campusId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (campusId) {
      params.set("campus", campusId);
    } else {
      params.delete("campus");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const selectedCampusName =
    campuses.find((c) => c.id === selectedCampus)?.name ?? "All Campuses";

  return (
    <>
      {/* Top green branded bar */}
      <div className="h-10 bg-rooted-green flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="text-white/90 text-xs font-semibold tracking-wide uppercase">
            Rooted Enrollment Management System
          </span>
          <span className="text-white/40 text-xs">|</span>
          <span className="text-white/60 text-xs">
            {selectedCampusName}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="text-white/70 text-xs">{userEmail}</span>
          )}
          <button
            onClick={handleLogout}
            className="text-white/60 hover:text-white text-xs transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Action bar */}
      <header className="h-12 border-b border-gray-200 bg-white flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          {campuses.length > 1 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="campus-select"
                className="text-xs text-gray-500 font-medium"
              >
                Campus:
              </label>
              <Select
                id="campus-select"
                value={selectedCampus}
                onChange={(e) => handleCampusChange(e.target.value)}
                className="w-52 h-8 text-sm"
              >
                <option value="">All Campuses</option>
                {campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              const input = (e.target as HTMLFormElement).elements.namedItem("q") as HTMLInputElement;
              const q = input?.value?.trim();
              if (q) router.push(`/staff/students?search=${encodeURIComponent(q)}`);
            }}
          >
            <input
              name="q"
              type="search"
              placeholder="Search students..."
              className="h-8 w-56 rounded-lg border border-gray-200 bg-gray-50 px-3 pr-8 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rooted-green/30 focus:border-rooted-green"
            />
            <svg
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </form>
        </div>
      </header>
    </>
  );
}
