"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  grade: string;
  campus_name: string;
  status: string;
  application_id: string;
  guardian_name: string;
  race_ethnicity: string[];
}

const statusConfig: Record<string, { label: string; variant: string }> = {
  submitted: { label: "Submitted", variant: "default" },
  needs_info: { label: "Needs Info", variant: "warning" },
  verified: { label: "Verified", variant: "success" },
  lottery_assigned: { label: "Lottery", variant: "secondary" },
  offered: { label: "Offered", variant: "default" },
  accepted: { label: "Accepted", variant: "success" },
  registered: { label: "Registered", variant: "success" },
  declined: { label: "Declined", variant: "destructive" },
  withdrawn: { label: "Withdrawn", variant: "secondary" },
  expired: { label: "Expired", variant: "secondary" },
};

interface StudentsClientProps {
  students: StudentRow[];
  initialSearch?: string;
}

export function StudentsClient({ students, initialSearch = "" }: StudentsClientProps) {
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");

  // Unique values for filters
  const grades = useMemo(
    () => [...new Set(students.map((s) => s.grade))].sort(),
    [students]
  );
  const statuses = useMemo(
    () => [...new Set(students.map((s) => s.status))],
    [students]
  );

  const filtered = useMemo(() => {
    let result = students;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.first_name.toLowerCase().includes(q) ||
          s.last_name.toLowerCase().includes(q) ||
          s.guardian_name.toLowerCase().includes(q) ||
          `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((s) => s.status === statusFilter);
    }

    if (gradeFilter !== "all") {
      result = result.filter((s) => s.grade === gradeFilter);
    }

    return result;
  }, [students, search, statusFilter, gradeFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Students</h1>
        <p className="text-sm text-gray-500 mt-1">
          {filtered.length} of {students.length} student record
          {students.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search students or guardians..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 focus:border-rooted-green"
          />
        </div>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
        >
          <option value="all">All Grades</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
        >
          <option value="all">All Statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {statusConfig[s]?.label ?? s}
            </option>
          ))}
        </select>
        {(search || statusFilter !== "all" || gradeFilter !== "all") && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setGradeFilter("all");
            }}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Student Records</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400">
                {students.length === 0
                  ? "No student records found"
                  : "No students match your filters"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Student
                    </th>
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Campus
                    </th>
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Grade
                    </th>
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Guardian
                    </th>
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Demographics
                    </th>
                    <th className="text-left py-2.5 text-xs font-medium text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const config = statusConfig[s.status] ?? {
                      label: s.status,
                      variant: "secondary",
                    };
                    return (
                      <tr
                        key={s.application_id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-3">
                          <Link
                            href={`/staff/applications/${s.application_id}`}
                            className="no-underline"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-rooted-green/10 flex items-center justify-center">
                                <span className="text-xs font-bold text-rooted-green">
                                  {s.first_name[0]}
                                  {s.last_name[0]}
                                </span>
                              </div>
                              <span className="text-sm font-medium text-gray-900 hover:text-rooted-green-dark">
                                {s.first_name} {s.last_name}
                              </span>
                            </div>
                          </Link>
                        </td>
                        <td className="py-3 text-gray-600">{s.campus_name}</td>
                        <td className="py-3 text-gray-600">
                          Grade {s.grade}
                        </td>
                        <td className="py-3 text-gray-600">
                          {s.guardian_name}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-1">
                            {s.race_ethnicity.map((eth) => (
                              <Badge
                                key={eth}
                                variant="secondary"
                                className="text-[10px]"
                              >
                                {eth}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-3">
                          <Badge
                            variant={
                              config.variant as
                                | "default"
                                | "secondary"
                                | "success"
                                | "warning"
                                | "destructive"
                            }
                          >
                            {config.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
