export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { requireStaffSession, getAccessibleCampusIds, resolveActiveCampus } from "@/lib/auth/get-session";
import {
  IconInbox,
  IconAlertTriangle,
  IconCheckCircle,
  IconClock,
  IconPaperclip,
} from "@/components/ui/icons";

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
    icon: IconInbox,
    borderColor: "border-l-blue-500",
  },
  {
    key: "needs_info",
    label: "Missing Info",
    description: "Waiting for family to provide documents",
    statuses: ["needs_info"],
    icon: IconAlertTriangle,
    borderColor: "border-l-amber-500",
  },
  {
    key: "verified",
    label: "Verified — Ready",
    description: "Verified and ready for lottery or offer",
    statuses: ["verified"],
    icon: IconCheckCircle,
    borderColor: "border-l-green-500",
  },
  {
    key: "offered",
    label: "Pending Response",
    description: "Awaiting family response to seat offers",
    statuses: ["offered"],
    icon: IconClock,
    borderColor: "border-l-red-500",
  },
  {
    key: "accepted",
    label: "Pending Enrollment",
    description: "Accepted offer — awaiting registration completion",
    statuses: ["accepted"],
    icon: IconPaperclip,
    borderColor: "border-l-purple-500",
  },
];

export default async function StaffInboxPage({
  searchParams,
}: {
  searchParams: { campus?: string };
}) {
  const session = await requireStaffSession();
  const accessibleIds = getAccessibleCampusIds(session);
  const activeCampus = resolveActiveCampus(session, searchParams?.campus);
  const scopedCampusIds = activeCampus ? [activeCampus] : accessibleIds;
  const supabase = createServiceRoleClient();

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

  if (scopedCampusIds.length > 0) {
    appQuery = appQuery.in("campus_id", scopedCampusIds);
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
        <h1 className="text-2xl font-bold text-ink">
          Staff Inbox & Work Queue
        </h1>
        <p className="text-sm text-stone mt-1">
          {totalItems} item{totalItems !== 1 ? "s" : ""} requiring attention
        </p>
      </div>

      {/* Queue Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {categorizedItems.map((cat) => (
          <a key={cat.key} href={`#${cat.key}`} className="block no-underline">
            <Card
              className={`hover:shadow-md transition-shadow cursor-pointer border-l-4 ${
                cat.items.length > 0 ? cat.borderColor : "border-l-stone/20 opacity-60"
              }`}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <cat.icon size={20} aria-hidden="true" />
                  <span
                    className={`text-2xl font-bold ${
                      cat.items.length > 0 ? "text-ink" : "text-stone/50"
                    }`}
                  >
                    {cat.items.length}
                  </span>
                </div>
                <p className="text-xs font-medium text-ink/60 mt-1">
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
                  <cat.icon size={18} aria-hidden="true" />
                  <CardTitle className="text-base">{cat.label}</CardTitle>
                  <Badge
                    variant={cat.items.length > 0 ? "default" : "secondary"}
                  >
                    {cat.items.length}
                  </Badge>
                </div>
                <span className="text-xs text-stone">
                  {cat.description}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {cat.items.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-stone">
                    No items in this queue
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-rooted-gray">
                  {cat.items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/staff/applications/${item.id}`}
                      className="flex items-center justify-between py-3 px-2 -mx-2 rounded-lg hover:bg-rooted-gray-light transition-colors no-underline group"
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
                          <p className="text-sm font-medium text-ink group-hover:text-rooted-green-dark">
                            {item.student_name}
                          </p>
                          <p className="text-xs text-stone">
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
                        <span className="text-xs text-stone">
                          {item.updated_at}
                        </span>
                        <svg
                          className="w-4 h-4 text-stone/50 group-hover:text-stone"
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
