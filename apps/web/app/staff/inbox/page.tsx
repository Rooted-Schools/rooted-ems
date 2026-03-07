export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { requireStaffSession, getAccessibleCampusIds } from "@/lib/auth/get-session";

interface WorkItem {
  id: string;
  student_name: string;
  campus_name: string;
  grade: string;
  status: string;
  updated_at: string;
  days_waiting: number;
}

const QUEUE_CATEGORIES = [
  {
    key: "submitted",
    label: "New Submissions",
    description: "Awaiting initial staff review",
    statuses: ["submitted"],
    icon: "📥",
    borderColor: "border-l-blue-500",
  },
  {
    key: "needs_info",
    label: "Missing Info",
    description: "Waiting for family to provide documents",
    statuses: ["needs_info"],
    icon: "⚠️",
    borderColor: "border-l-amber-500",
  },
  {
    key: "verified",
    label: "Pending Verification",
    description: "Verified and ready for next step",
    statuses: ["verified"],
    icon: "🔍",
    borderColor: "border-l-orange-500",
  },
  {
    key: "offered",
    label: "Offers Expiring",
    description: "Pending offers awaiting family response",
    statuses: ["offered"],
    icon: "⏰",
    borderColor: "border-l-red-500",
  },
  {
    key: "accepted",
    label: "Registration Pending",
    description: "Accepted but not yet fully registered",
    statuses: ["accepted"],
    icon: "📎",
    borderColor: "border-l-purple-500",
  },
];

export default async function StaffInboxPage() {
  const session = await requireStaffSession();
  const campusIds = getAccessibleCampusIds(session);
  const supabase = await createServerClient();

  let appQuery = supabase
    .from("application")
    .select(
      `
      id, status, updated_at,
      student:student_id (first_name, last_name),
      campus:campus_id (name),
      grade_level:grade_level_id (grade)
    `
    )
    .in("status", [
      "submitted",
      "needs_info",
      "verified",
      "offered",
      "accepted",
    ])
    .order("updated_at", { ascending: true });

  if (campusIds.length > 0) {
    appQuery = appQuery.in("campus_id", campusIds);
  }

  const { data: applications } = await appQuery;

  const items: WorkItem[] = (applications ?? []).map(
    (row: Record<string, unknown>) => {
      const student = row.student as Record<string, string> | null;
      const campus = row.campus as Record<string, string> | null;
      const grade = row.grade_level as Record<string, string> | null;
      const updatedAt = new Date(row.updated_at as string);
      const now = new Date();
      const daysWaiting = Math.floor(
        (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      return {
        id: row.id as string,
        student_name: student
          ? `${student.first_name} ${student.last_name}`
          : "Unknown",
        campus_name: campus?.name ?? "",
        grade: grade?.grade ?? "",
        status: row.status as string,
        updated_at: updatedAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        days_waiting: daysWaiting,
      };
    }
  );

  const categorizedItems = QUEUE_CATEGORIES.map((cat) => ({
    ...cat,
    items: items.filter((item) => cat.statuses.includes(item.status)),
  }));

  const totalItems = items.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Staff Inbox & Work Queue
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {totalItems} item{totalItems !== 1 ? "s" : ""} requiring attention
        </p>
      </div>

      {/* Queue Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {categorizedItems.map((cat) => (
          <a key={cat.key} href={`#${cat.key}`} className="block no-underline">
            <Card
              className={`hover:shadow-md transition-shadow cursor-pointer border-l-4 ${
                cat.items.length > 0 ? cat.borderColor : "border-l-gray-200 opacity-60"
              }`}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-lg">{cat.icon}</span>
                  <span
                    className={`text-2xl font-bold ${
                      cat.items.length > 0 ? "text-gray-900" : "text-gray-300"
                    }`}
                  >
                    {cat.items.length}
                  </span>
                </div>
                <p className="text-xs font-medium text-gray-600 mt-1">
                  {cat.label}
                </p>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>

      {/* Queue Sections */}
      {categorizedItems.map((cat) => (
        <div key={cat.key} id={cat.key}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{cat.icon}</span>
                  <CardTitle className="text-base">{cat.label}</CardTitle>
                  <Badge
                    variant={cat.items.length > 0 ? "default" : "secondary"}
                  >
                    {cat.items.length}
                  </Badge>
                </div>
                <span className="text-xs text-gray-400">
                  {cat.description}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {cat.items.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-400">
                    No items in this queue
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cat.items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/staff/applications/${item.id}`}
                      className="flex items-center justify-between py-3 px-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors no-underline group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-rooted-green/10 flex items-center justify-center">
                          <span className="text-xs font-bold text-rooted-green">
                            {item.student_name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 group-hover:text-rooted-green-dark">
                            {item.student_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {item.campus_name} &middot; Grade {item.grade}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {item.days_waiting > 7 && (
                          <Badge variant="warning" className="text-[10px]">
                            {item.days_waiting}d waiting
                          </Badge>
                        )}
                        <span className="text-xs text-gray-400">
                          {item.updated_at}
                        </span>
                        <svg
                          className="w-4 h-4 text-gray-300 group-hover:text-gray-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
