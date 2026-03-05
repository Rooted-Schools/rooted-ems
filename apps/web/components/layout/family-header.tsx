"use client";

import Link from "next/link";
import { createBrowserClient } from "@rooted-ems/database";

interface FamilyHeaderProps {
  userEmail?: string | null;
  userPhone?: string | null;
}

export function FamilyHeader({ userEmail, userPhone }: FamilyHeaderProps) {
  const supabase = createBrowserClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="h-14 border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto h-full flex items-center justify-between px-4">
        <Link
          href="/family/dashboard"
          className="flex items-center gap-2 no-underline hover:opacity-90 transition-opacity"
        >
          <div className="inline-flex items-baseline gap-1 text-sm font-medium tracking-wide">
            <span className="text-rooted-green">rooted school</span>
            <span className="text-gray-800">foundation</span>
          </div>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/family/dashboard"
            className="text-sm text-gray-700 hover:text-rooted-green transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/family/applications"
            className="text-sm text-gray-700 hover:text-rooted-green transition-colors"
          >
            Applications
          </Link>
          <Link
            href="/family/documents"
            className="text-sm text-gray-700 hover:text-rooted-green transition-colors"
          >
            Documents
          </Link>

          <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-200">
            <span className="text-sm text-gray-500">
              {userEmail ?? userPhone ?? ""}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
