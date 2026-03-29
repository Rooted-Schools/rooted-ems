"use client";

import { useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@rooted-ems/database";
import { Select } from "@/components/ui/select";

interface StaffHeaderProps {
  userEmail?: string | null;
  campuses?: Array<{ id: string; name: string }>;
  unreadNotificationCount?: number;
}

export function StaffHeader({
  userEmail,
  campuses = [],
  unreadNotificationCount = 0,
}: StaffHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read current campus from URL, fall back to "all"
  const selectedCampus = searchParams.get("campus") ?? "";

  const supabase = useMemo(() => createBrowserClient(), []);

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
      <div className="h-10 bg-deep-green flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <span className="text-white/90 text-xs tracking-wide uppercase">
            <span className="font-bold">rooted</span><span className="font-normal">schools</span> Enrollment Management System
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
      <header className="h-12 border-b border-stone/20 bg-white flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          {campuses.length > 1 && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="campus-select"
                className="text-xs text-stone font-medium"
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
          {/* Notifications bell */}
          <a
            href="/staff/messages"
            className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-rooted-gray-light transition-colors"
            aria-label="Notifications"
          >
            <svg
              className="w-4.5 h-4.5 text-stone"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none px-0.5">
                {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
              </span>
            )}
          </a>

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
              className="h-8 w-56 rounded-lg border border-stone/20 bg-rooted-gray-light px-3 pr-8 text-sm text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-rooted-green/30 focus:border-rooted-green"
            />
            <svg
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone"
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
