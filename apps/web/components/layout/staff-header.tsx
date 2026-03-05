"use client";

import { useState } from "react";
import { createBrowserClient } from "@rooted-ems/database";
import { Select } from "@/components/ui/select";

interface StaffHeaderProps {
  userEmail?: string | null;
  campuses?: Array<{ id: string; name: string }>;
  activeCampusId?: string;
}

export function StaffHeader({
  userEmail,
  campuses = [],
  activeCampusId,
}: StaffHeaderProps) {
  const [selectedCampus, setSelectedCampus] = useState(
    activeCampusId ?? campuses[0]?.id ?? ""
  );

  const supabase = createBrowserClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/staff-login";
  }

  return (
    <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {campuses.length > 1 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="campus-select"
              className="text-sm text-gray-500 font-medium"
            >
              Campus:
            </label>
            <Select
              id="campus-select"
              value={selectedCampus}
              onChange={(e) => setSelectedCampus(e.target.value)}
              className="w-48 h-8 text-sm"
            >
              {campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>
                  {campus.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {userEmail && (
          <span className="text-sm text-gray-500">{userEmail}</span>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
