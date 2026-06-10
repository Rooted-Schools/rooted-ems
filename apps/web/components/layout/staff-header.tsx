"use client";

import Link from "next/link";
import { useMemo, useState, useEffect, useRef } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@rooted-ems/database";
import { Select } from "@/components/ui/select";
import { NAV_SECTIONS, ROLE_LEVEL } from "@/components/layout/staff-sidebar";
import { StaffNotificationBell } from "@/components/layout/staff-notification-bell";
import type { FamilyMessageRow } from "@/lib/queries";

interface StaffHeaderProps {
  userEmail?: string | null;
  campuses?: Array<{ id: string; name: string }>;
  unreadNotificationCount?: number;
  /** Most recent notifications for the bell dropdown preview */
  recentNotifications?: FamilyMessageRow[];
  /** The user's highest role across all campuses (drives mobile nav filtering) */
  highestRole?: string;
}

export function StaffHeader({
  userEmail,
  campuses = [],
  unreadNotificationCount = 0,
  recentNotifications = [],
  highestRole = "compliance_auditor",
}: StaffHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Read current campus from URL, fall back to "all"
  const selectedCampus = searchParams.get("campus") ?? "";

  const supabase = useMemo(() => createBrowserClient(), []);

  // Close mobile menu on Escape or tap outside the header
  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [mobileOpen]);

  // Preserve campus selection across navigation (mirrors staff-sidebar)
  function buildHref(base: string) {
    return selectedCampus ? `${base}?campus=${selectedCampus}` : base;
  }

  const userLevel = ROLE_LEVEL[highestRole] ?? 1;

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
    <div ref={containerRef}>
      {/* Top green branded bar */}
      <div className="h-10 bg-deep-green flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white/90 text-xs tracking-wide uppercase truncate">
            <span className="font-bold">rooted</span><span className="font-normal">schools</span><span className="hidden sm:inline"> Enrollment Management System</span>
          </span>
          <span className="hidden sm:inline text-white/40 text-xs">|</span>
          <span className="hidden sm:inline text-white/60 text-xs truncate">
            {selectedCampusName}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {userEmail && (
            <span className="hidden sm:inline text-white/70 text-xs truncate max-w-[180px]">{userEmail}</span>
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
      <header className="h-12 border-b border-stone/20 bg-white flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4">
          {/* Mobile hamburger */}
          <button
            className="md:hidden flex items-center justify-center w-11 h-11 -ml-2 text-ink/70 hover:text-ink"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="staff-mobile-menu"
          >
            {mobileOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          {campuses.length > 1 && (
            <div className="hidden md:flex items-center gap-2">
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
          <StaffNotificationBell
            unreadCount={unreadNotificationCount}
            notifications={recentNotifications}
          />

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
              className="h-8 w-40 sm:w-56 rounded-lg border border-stone/20 bg-rooted-gray-light px-3 pr-8 text-sm text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-rooted-green/30 focus:border-rooted-green"
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

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div id="staff-mobile-menu" className="md:hidden border-b border-stone/20 bg-white pb-3">
          {/* Campus selector */}
          {campuses.length > 1 && (
            <div className="flex items-center gap-2 px-4 pt-3">
              <label
                htmlFor="campus-select-mobile"
                className="text-xs text-stone font-medium shrink-0"
              >
                Campus:
              </label>
              <Select
                id="campus-select-mobile"
                value={selectedCampus}
                onChange={(e) => handleCampusChange(e.target.value)}
                className="flex-1 h-9 text-sm"
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

          {/* Nav links (role-filtered, mirrors staff-sidebar) */}
          <nav className="px-4 pt-2">
            {NAV_SECTIONS.map((section, sIdx) => {
              const visibleItems = section.items.filter((item) => {
                const required = ROLE_LEVEL[item.minRole ?? "compliance_auditor"] ?? 1;
                return userLevel >= required;
              });
              if (visibleItems.length === 0) return null;

              return (
                <div key={sIdx}>
                  {section.title && (
                    <div className="pt-3 pb-1">
                      <span className="text-[10px] font-semibold text-stone uppercase tracking-wider">
                        {section.title}
                      </span>
                    </div>
                  )}
                  {visibleItems.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/staff/dashboard" &&
                        pathname.startsWith(item.href));
                    return (
                      <Link
                        key={item.href}
                        href={buildHref(item.href)}
                        onClick={() => setMobileOpen(false)}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center gap-2.5 min-h-[44px] px-2 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-rooted-green/10 text-deep-green"
                            : "text-ink/70 hover:bg-rooted-gray-light hover:text-ink"
                        }`}
                      >
                        <span className="text-sm" aria-hidden="true">
                          {item.icon}
                        </span>
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </div>
      )}
    </div>
  );
}
