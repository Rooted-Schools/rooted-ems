"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CampusRow, EnrollmentWindowRow, StaffUserRow } from "@/lib/queries";

const roleLabels: Record<string, string> = {
  system_admin: "System Admin",
  enrollment_manager: "Enrollment Manager",
  enrollment_staff: "Enrollment Staff",
  compliance_auditor: "Compliance Auditor",
};

const windowStatusConfig: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-green-100 text-green-800" },
  draft: { label: "Draft", className: "bg-gray-100 text-gray-700" },
  closed: { label: "Closed", className: "bg-gray-100 text-gray-900" },
  archived: { label: "Archived", className: "bg-gray-100 text-gray-500" },
};

interface SettingsClientProps {
  campuses: CampusRow[];
  windows: EnrollmentWindowRow[];
  users: StaffUserRow[];
}

export function SettingsClient({ campuses, windows, users }: SettingsClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage campus configuration, enrollment windows, and system preferences.
        </p>
      </div>

      <Tabs defaultValue="campus">
        <TabsList>
          <TabsTrigger value="campus">Campuses</TabsTrigger>
          <TabsTrigger value="enrollment">Enrollment Windows</TabsTrigger>
          <TabsTrigger value="users">Staff Users</TabsTrigger>
        </TabsList>

        <TabsContent value="campus">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campuses</CardTitle>
              <CardDescription>
                Campuses configured in the system.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {campuses.length === 0 ? (
                <EmptyState
                  icon="🏫"
                  title="No campuses configured"
                  description="Campus configuration is managed in the database."
                />
              ) : (
                <div className="space-y-3">
                  {campuses.map((campus) => (
                    <div
                      key={campus.id}
                      className="flex items-center justify-between p-3 rounded-md border border-gray-200"
                    >
                      <div>
                        <p className="font-medium text-sm">{campus.name}</p>
                        <p className="text-xs text-gray-500">{campus.region_name}</p>
                      </div>
                      <Badge variant="secondary">{campus.slug || "—"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enrollment">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Enrollment Windows</CardTitle>
                  <CardDescription>
                    Define when families can submit applications.
                  </CardDescription>
                </div>
                <Button disabled>Create Window</Button>
              </div>
            </CardHeader>
            <CardContent>
              {windows.length === 0 ? (
                <EmptyState
                  icon="📅"
                  title="No enrollment windows"
                  description="Create an enrollment window to allow families to submit applications."
                />
              ) : (
                <div className="space-y-3">
                  {windows.map((w) => {
                    const cfg = windowStatusConfig[w.status] ?? windowStatusConfig.draft;
                    return (
                      <div
                        key={w.id}
                        className="flex items-center justify-between p-3 rounded-md border border-gray-200"
                      >
                        <div>
                          <p className="font-medium text-sm">{w.name}</p>
                          <p className="text-xs text-gray-500">
                            {w.open_date} — {w.close_date}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
                        >
                          {cfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Staff Users</CardTitle>
                  <CardDescription>
                    Manage staff access and role assignments.
                  </CardDescription>
                </div>
                <Button disabled>Invite User</Button>
              </div>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <EmptyState
                  icon="👥"
                  title="No staff users"
                  description="Staff users will appear here once they are assigned campus roles."
                />
              ) : (
                <div className="space-y-3">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-md border border-gray-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-rooted-green/10 flex items-center justify-center text-rooted-green text-sm font-medium">
                          {user.initials}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{user.full_name}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-gray-500">
                        {roleLabels[user.role] ?? user.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
