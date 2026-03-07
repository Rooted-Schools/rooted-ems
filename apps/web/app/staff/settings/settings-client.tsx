"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CampusRow, EnrollmentWindowRow, StaffUserRow } from "@/lib/queries";
import {
  staffCreateEnrollmentWindow,
  staffUpdateWindowStatus,
  staffAssignRole,
  staffRemoveRole,
} from "./actions";

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

interface SchoolYear {
  id: string;
  name: string;
  is_current: boolean;
}

interface SettingsClientProps {
  campuses: CampusRow[];
  windows: EnrollmentWindowRow[];
  users: StaffUserRow[];
  schoolYears: SchoolYear[];
  staffUserId: string;
}

export function SettingsClient({
  campuses,
  windows,
  users,
  schoolYears,
  staffUserId,
}: SettingsClientProps) {
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
          <CampusTab campuses={campuses} />
        </TabsContent>

        <TabsContent value="enrollment">
          <EnrollmentWindowsTab
            windows={windows}
            campuses={campuses}
            schoolYears={schoolYears}
          />
        </TabsContent>

        <TabsContent value="users">
          <StaffUsersTab
            users={users}
            campuses={campuses}
            staffUserId={staffUserId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Campus Tab ──────────────────────────────────────────

function CampusTab({ campuses }: { campuses: CampusRow[] }) {
  return (
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
                <Badge variant="secondary">{campus.short_code || "—"}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Enrollment Windows Tab ──────────────────────────────

function EnrollmentWindowsTab({
  windows,
  campuses,
  schoolYears,
}: {
  windows: EnrollmentWindowRow[];
  campuses: CampusRow[];
  schoolYears: SchoolYear[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [campusId, setCampusId] = useState("");
  const [schoolYearId, setSchoolYearId] = useState(
    schoolYears.find((sy) => sy.is_current)?.id ?? schoolYears[0]?.id ?? ""
  );
  const [status, setStatus] = useState<"draft" | "open">("draft");
  const [openDate, setOpenDate] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [description, setDescription] = useState("");

  function resetForm() {
    setName("");
    setCampusId("");
    setStatus("draft");
    setOpenDate("");
    setCloseDate("");
    setDescription("");
  }

  function handleCreate() {
    if (!name.trim() || !campusId || !schoolYearId || !openDate || !closeDate) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await staffCreateEnrollmentWindow({
        campus_id: campusId,
        school_year_id: schoolYearId,
        name: name.trim(),
        open_date: new Date(openDate).toISOString(),
        close_date: new Date(closeDate).toISOString(),
        status,
        description: description.trim() || undefined,
      });
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: "Enrollment window created." });
        setDialogOpen(false);
        resetForm();
        router.refresh();
      }
    });
  }

  function handleStatusChange(windowId: string, newStatus: "draft" | "open" | "closed" | "archived") {
    startTransition(async () => {
      const result = await staffUpdateWindowStatus(windowId, newStatus);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Enrollment Windows</CardTitle>
            <CardDescription>
              Define when families can submit applications.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger>
              <Button>Create Window</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Enrollment Window</DialogTitle>
                <DialogDescription>
                  Set up a new enrollment period for a campus.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Fall 2026-27 Open Enrollment"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Campus</label>
                    <select
                      value={campusId}
                      onChange={(e) => setCampusId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    >
                      <option value="">Select campus</option>
                      {campuses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">School Year</label>
                    <select
                      value={schoolYearId}
                      onChange={(e) => setSchoolYearId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    >
                      {schoolYears.map((sy) => (
                        <option key={sy.id} value={sy.id}>{sy.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Open Date</label>
                    <input
                      type="date"
                      value={openDate}
                      onChange={(e) => setOpenDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Close Date</label>
                    <input
                      type="date"
                      value={closeDate}
                      onChange={(e) => setCloseDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Initial Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "draft" | "open")}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                  >
                    <option value="draft">Draft</option>
                    <option value="open">Open</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of this enrollment window"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                  />
                </div>
              </div>
              {feedback?.type === "error" && (
                <p className="text-sm text-red-600 mb-2">{feedback.message}</p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={isPending || !name.trim() || !campusId || !openDate || !closeDate}
                >
                  {isPending ? "Creating…" : "Create Window"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {feedback?.type === "success" && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
            {feedback.message}
          </div>
        )}
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
              const nextStatus = w.status === "draft" ? "open" : w.status === "open" ? "closed" : null;
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
                  <div className="flex items-center gap-2">
                    {nextStatus && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleStatusChange(w.id, nextStatus)}
                      >
                        {nextStatus === "open" ? "Open" : "Close"}
                      </Button>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
                    >
                      {cfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Staff Users Tab ─────────────────────────────────────

function StaffUsersTab({
  users,
  campuses,
  staffUserId,
}: {
  users: StaffUserRow[];
  campuses: CampusRow[];
  staffUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Form state
  const [email, setEmail] = useState("");
  const [campusId, setCampusId] = useState("");
  const [role, setRole] = useState<"enrollment_staff" | "enrollment_manager" | "system_admin" | "compliance_auditor">("enrollment_staff");

  function resetForm() {
    setEmail("");
    setCampusId("");
    setRole("enrollment_staff");
  }

  function handleAssign() {
    if (!email.trim() || !campusId) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await staffAssignRole({
        user_email: email.trim().toLowerCase(),
        campus_id: campusId,
        role,
        assigned_by: staffUserId,
      });
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: `Role assigned to ${email.trim()}.` });
        setDialogOpen(false);
        resetForm();
        router.refresh();
      }
    });
  }

  function handleRemove(roleId: string, userName: string) {
    if (!confirm(`Remove ${userName}'s role? They will lose access to this campus.`)) return;
    startTransition(async () => {
      const result = await staffRemoveRole(roleId);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Staff Users</CardTitle>
            <CardDescription>
              Manage staff access and role assignments.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger>
              <Button>Assign Role</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Staff Role</DialogTitle>
                <DialogDescription>
                  Assign a campus role to a user. They must have logged in at least once.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@rootedschool.org"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Campus</label>
                    <select
                      value={campusId}
                      onChange={(e) => setCampusId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    >
                      <option value="">Select campus</option>
                      {campuses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as typeof role)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    >
                      <option value="enrollment_staff">Enrollment Staff</option>
                      <option value="enrollment_manager">Enrollment Manager</option>
                      <option value="system_admin">System Admin</option>
                      <option value="compliance_auditor">Compliance Auditor</option>
                    </select>
                  </div>
                </div>
              </div>
              {feedback?.type === "error" && (
                <p className="text-sm text-red-600 mb-2">{feedback.message}</p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleAssign}
                  disabled={isPending || !email.trim() || !campusId}
                >
                  {isPending ? "Assigning…" : "Assign Role"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {feedback?.type === "success" && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
            {feedback.message}
          </div>
        )}
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
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-500">
                    {roleLabels[user.role] ?? user.role}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleRemove(user.id, user.full_name)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
