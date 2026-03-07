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
    window.location.href = "/";
  }

  return (
    <header className="h-14 border-b border-gray-200 bg-white">
      <div className="max-w-5xl mx-auto h-full flex items-center justify-between px-4">
        <Link
          href="/family/dashboard"
          className="flex items-center gap-2 no-underline hover:opacity-90 transition-opacity"
        >
          <span className="text-sm tracking-wide">
            <span className="text-rooted-green font-bold">rooted</span><span className="text-ink font-medium">schools</span>
          </span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/family/dashboard"
            className="text-sm text-ink/70 hover:text-rooted-green transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/family/applications"
            className="text-sm text-ink/70 hover:text-rooted-green transition-colors"
          >
            Applications
          </Link>
          <Link
            href="/family/documents"
            className="text-sm text-ink/70 hover:text-rooted-green transition-colors"
          >
            Documents
          </Link>
          <Link
            href="/family/messages"
            className="text-sm text-ink/70 hover:text-rooted-green transition-colors"
          >
            Messages
          </Link>
          <Link
            href="/family/registration"
            className="text-sm text-ink/70 hover:text-rooted-green transition-colors"
          >
            Registration
          </Link>

          <div className="flex items-center gap-3 ml-4 pl-4 border-l border-gray-200">
            <span className="text-sm text-stone">
              {userEmail ?? userPhone ?? ""}
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-stone hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
