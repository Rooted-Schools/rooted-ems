"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  IconBuilding,
  IconCalendar,
  IconClipboardList,
  IconUsers,
  IconGraduationCap,
  IconX,
  IconPenLine,
} from "@/components/ui/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { CampusRow, EnrollmentWindowRow, StaffUserRow, PacketRequirementRow } from "@/lib/queries";
import {
  staffCreateEnrollmentWindow,
  staffUpdateWindowStatus,
  staffUpdateEnrollmentWindow,
  staffAssignRole,
  staffEditRole,
  staffRemoveRole,
  staffUpdatePacketRequirement,
  staffCreateSchoolYear,
  staffUpdateSchoolYearCurrent,
  staffCreateGradeLevel,
  staffDeleteGradeLevel,
  staffCreateCapacityPlan,
} from "./actions";
// Reused directly rather than duplicated: this is the same mutation and the
// same access gate the Seats tab's inline seat-total editor already uses.
import { staffUpdateCapacity } from "@/app/staff/seats/actions";

/** The real grade_level_code enum values (supabase/migrations/00001_enums.sql). */
const GRADE_LEVEL_CODES = ["6", "7", "8", "9", "10", "11", "12"];

const roleLabels: Record<string, string> = {
  system_admin: "System Admin",
  enrollment_manager: "Enrollment Manager",
  enrollment_staff: "Enrollment Staff",
  compliance_auditor: "Compliance Auditor",
};

const windowStatusConfig: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-green-100 text-green-800" },
  draft: { label: "Draft", className: "bg-rooted-gray text-ink/70" },
  closed: { label: "Closed", className: "bg-rooted-gray text-ink" },
  archived: { label: "Archived", className: "bg-rooted-gray text-stone" },
};

interface SchoolYear {
  id: string;
  name: string;
  is_current: boolean;
  start_date?: string;
  end_date?: string;
}

interface GradeLevel {
  id: string;
  grade: string;
  campus_id: string;
  school_year_id: string;
}

interface CapacityPlanRow {
  id: string;
  campus_id: string;
  campus_name: string;
  grade_level_id: string;
  grade: string;
  school_year_id: string;
  school_year_name: string;
  total_seats: number;
}

interface SettingsClientProps {
  campuses: CampusRow[];
  windows: EnrollmentWindowRow[];
  users: StaffUserRow[];
  packetRequirements: PacketRequirementRow[];
  schoolYears: SchoolYear[];
  gradeLevels?: GradeLevel[];
  capacityPlans?: CapacityPlanRow[];
  systemSettings?: Record<string, string>;
  staffUserId: string;
  activeCampusId?: string;
  /**
   * Whether the signed-in staff member holds system_admin on at least one
   * campus. Drives visibility of the school-year, grade-level, and capacity
   * plan create/edit/delete controls. This is a UI courtesy only — every
   * mutation those controls call re-checks system_admin server-side via
   * requireMinRole, so hiding a button here is not what keeps a lower role
   * from acting; it just keeps them from seeing a control they can't use.
   */
  isSystemAdmin?: boolean;
}

export function SettingsClient({
  campuses,
  windows,
  users,
  packetRequirements,
  schoolYears,
  gradeLevels = [],
  capacityPlans = [],
  systemSettings = {},
  staffUserId,
  activeCampusId,
  isSystemAdmin = false,
}: SettingsClientProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="text-sm text-stone mt-1">
          Manage campus configuration, enrollment windows, registration requirements, and staff access.
        </p>
      </div>

      <Tabs defaultValue="campus">
        <TabsList className="flex-wrap">
          <TabsTrigger value="campus">Campuses</TabsTrigger>
          <TabsTrigger value="enrollment">Enrollment Windows</TabsTrigger>
          <TabsTrigger value="grades">School Years & Grades</TabsTrigger>
          <TabsTrigger value="registration">Registration</TabsTrigger>
          <TabsTrigger value="users">Staff Users</TabsTrigger>
          <TabsTrigger value="preferences">Preferences</TabsTrigger>
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

        <TabsContent value="grades">
          <SchoolYearsGradesTab
            schoolYears={schoolYears}
            gradeLevels={gradeLevels}
            capacityPlans={capacityPlans}
            campuses={campuses}
            activeCampusId={activeCampusId}
            isSystemAdmin={isSystemAdmin}
          />
        </TabsContent>

        <TabsContent value="registration">
          <RegistrationRequirementsTab
            requirements={packetRequirements}
            campuses={campuses}
            schoolYears={schoolYears}
            activeCampusId={activeCampusId}
          />
        </TabsContent>

        <TabsContent value="users">
          <StaffUsersTab
            users={users}
            campuses={campuses}
            staffUserId={staffUserId}
          />
        </TabsContent>

        <TabsContent value="preferences">
          <PreferencesTab settings={systemSettings} />
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
            icon={<IconBuilding size={40} />}
            title="No campuses configured"
            description="Campus configuration is managed in the database."
          />
        ) : (
          <div className="space-y-3">
            {campuses.map((campus) => (
              <div
                key={campus.id}
                className="flex items-center justify-between p-3 rounded-md border border-stone/20"
              >
                <div>
                  <p className="font-medium text-sm">{campus.name}</p>
                  <p className="text-xs text-stone">{campus.region_name}</p>
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
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [openConfirm, setOpenConfirm] = useState<{ windowId: string; name: string; campusName: string } | null>(null);

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
    setSchoolYearId(schoolYears.find((sy) => sy.is_current)?.id ?? schoolYears[0]?.id ?? "");
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

  function performStatusChange(windowId: string, newStatus: "draft" | "open" | "closed" | "archived") {
    startTransition(async () => {
      const result = await staffUpdateWindowStatus(windowId, newStatus);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        toast({ variant: "success", title: `Window status changed to ${newStatus}` });
        router.refresh();
      }
    });
  }

  // Opening a window is the one transition that goes live for families the
  // instant it saves, so it gets a confirmation step. Every other transition
  // (draft, closed, archived) stays a single click.
  function handleStatusChange(
    windowId: string,
    newStatus: "draft" | "open" | "closed" | "archived",
    windowName: string,
    campusName: string
  ) {
    if (newStatus === "open") {
      setOpenConfirm({ windowId, name: windowName, campusName });
      return;
    }
    performStatusChange(windowId, newStatus);
  }

  function confirmOpenWindow() {
    if (!openConfirm) return;
    performStatusChange(openConfirm.windowId, "open");
    setOpenConfirm(null);
  }

  // ── Edit dialog state — name, open date, close date only. Status is
  // handled entirely by the transitions above, so editing never routes
  // through the open-confirmation dialog. ──
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editWindow, setEditWindow] = useState<EnrollmentWindowRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editOpenDate, setEditOpenDate] = useState("");
  const [editCloseDate, setEditCloseDate] = useState("");
  const [editFeedback, setEditFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function toDateInputValue(iso: string) {
    return iso ? iso.slice(0, 10) : "";
  }

  function openEditDialog(w: EnrollmentWindowRow) {
    setEditWindow(w);
    setEditName(w.name);
    setEditOpenDate(toDateInputValue(w.open_date_iso));
    setEditCloseDate(toDateInputValue(w.close_date_iso));
    setEditFeedback(null);
    setEditDialogOpen(true);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  // The window is live right now and the new close date has already passed —
  // still allowed (staff may be closing it out retroactively), just flagged.
  const editCloseDateInPast =
    editWindow?.status === "open" && !!editCloseDate && editCloseDate < todayStr;

  function handleSaveEdit() {
    if (!editWindow) return;
    const trimmedName = editName.trim();
    if (!trimmedName || !editOpenDate || !editCloseDate) {
      setEditFeedback({ type: "error", message: "Name, open date, and close date are required." });
      return;
    }
    if (new Date(editCloseDate).getTime() <= new Date(editOpenDate).getTime()) {
      setEditFeedback({ type: "error", message: "Close date must be after open date." });
      return;
    }
    setEditFeedback(null);
    startTransition(async () => {
      const result = await staffUpdateEnrollmentWindow(editWindow.id, {
        name: trimmedName,
        open_date: new Date(editOpenDate).toISOString(),
        close_date: new Date(editCloseDate).toISOString(),
      });
      if (result.error) {
        setEditFeedback({ type: "error", message: result.error });
      } else {
        toast({ variant: "success", title: "Enrollment window updated." });
        setEditDialogOpen(false);
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
            <DialogTrigger asChild>
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
                  <label className="block text-sm font-medium text-ink/70 mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Fall 2026-27 Open Enrollment"
                    className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1">Campus</label>
                    <select
                      value={campusId}
                      onChange={(e) => setCampusId(e.target.value)}
                      className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    >
                      <option value="">Select campus</option>
                      {campuses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1">School Year</label>
                    <select
                      value={schoolYearId}
                      onChange={(e) => setSchoolYearId(e.target.value)}
                      className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    >
                      {schoolYears.map((sy) => (
                        <option key={sy.id} value={sy.id}>{sy.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1">Open Date</label>
                    <input
                      type="date"
                      value={openDate}
                      onChange={(e) => setOpenDate(e.target.value)}
                      className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1">Close Date</label>
                    <input
                      type="date"
                      value={closeDate}
                      onChange={(e) => setCloseDate(e.target.value)}
                      className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">Initial Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "draft" | "open")}
                    className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                  >
                    <option value="draft">Draft</option>
                    <option value="open">Open</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">Description (optional)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of this enrollment window"
                    className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
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
            icon={<IconCalendar size={40} />}
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
                  className="flex items-center justify-between p-3 rounded-md border border-stone/20"
                >
                  <div>
                    <p className="font-medium text-sm">{w.name}</p>
                    <p className="text-xs text-stone">
                      {w.open_date} — {w.close_date}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-[6px] min-h-[44px]"
                      disabled={isPending}
                      onClick={() => openEditDialog(w)}
                    >
                      Edit
                    </Button>
                    {nextStatus && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleStatusChange(w.id, nextStatus, w.name, w.campus_name)}
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

      <Dialog open={!!openConfirm} onOpenChange={(v) => !v && setOpenConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open enrollment for families?</DialogTitle>
            <DialogDescription>
              Applications go live for families the moment this saves. The public site will show{" "}
              {openConfirm?.campusName || "this campus"} as open for &ldquo;{openConfirm?.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-[6px] min-h-[44px]"
              onClick={() => setOpenConfirm(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              className="rounded-[6px] min-h-[44px]"
              onClick={confirmOpenWindow}
              disabled={isPending}
            >
              {isPending ? "Opening…" : "Open Enrollment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Enrollment Window</DialogTitle>
            <DialogDescription>
              Update the name and dates for {editWindow?.campus_name || "this campus"}. Status changes
              still happen from the window list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 border border-line rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 min-h-[44px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Open Date</label>
                <input
                  type="date"
                  value={editOpenDate}
                  onChange={(e) => setEditOpenDate(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Close Date</label>
                <input
                  type="date"
                  value={editCloseDate}
                  onChange={(e) => setEditCloseDate(e.target.value)}
                  className="w-full px-3 py-2 border border-line rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 min-h-[44px]"
                />
              </div>
            </div>
            {editCloseDateInPast && (
              <p className="text-sm text-warn-text border-l-2 border-line pl-3">
                This close date is in the past; the window will stop accepting applications.
              </p>
            )}
          </div>
          {editFeedback?.type === "error" && (
            <p className="text-sm text-red-600 mb-2">{editFeedback.message}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-[6px] min-h-[44px]"
              onClick={() => setEditDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              className="rounded-[6px] min-h-[44px]"
              onClick={handleSaveEdit}
              disabled={isPending || !editName.trim() || !editOpenDate || !editCloseDate}
            >
              {isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Registration Requirements Tab ──────────────────────

const CATEGORY_LABELS: Record<number, string> = {
  1: "Core Forms",
  20: "Document Uploads",
  30: "Special Services & Compliance",
  40: "Federal Programs",
  50: "Transportation & Extended Day",
  60: "Parent/Guardian Verification",
  70: "State-Specific",
  80: "Athletics",
};

function getCategoryForSort(sortOrder: number): string {
  if (sortOrder >= 80) return "Athletics";
  if (sortOrder >= 70) return "State-Specific";
  if (sortOrder >= 60) return "Parent/Guardian Verification";
  if (sortOrder >= 50) return "Transportation & Extended Day";
  if (sortOrder >= 40) return "Federal Programs";
  if (sortOrder >= 30) return "Special Services & Compliance";
  if (sortOrder >= 20) return "Document Uploads";
  return "Core Forms";
}

function RegistrationRequirementsTab({
  requirements,
  campuses,
  schoolYears,
  activeCampusId,
}: {
  requirements: PacketRequirementRow[];
  campuses: CampusRow[];
  schoolYears: SchoolYear[];
  activeCampusId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [selectedCampus, setSelectedCampus] = useState(activeCampusId ?? campuses[0]?.id ?? "");
  const [selectedYear, setSelectedYear] = useState(
    schoolYears.find((sy) => sy.is_current)?.id ?? schoolYears[0]?.id ?? ""
  );
  const [showInactive, setShowInactive] = useState(false);

  // Filter requirements by selected campus/year
  const filtered = requirements.filter(
    (r) => r.campus_id === selectedCampus && r.school_year_id === selectedYear
  );

  // Group by category
  const grouped = filtered.reduce<Record<string, PacketRequirementRow[]>>((acc, req) => {
    const cat = getCategoryForSort(req.sort_order);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(req);
    return acc;
  }, {});

  // Stats
  const activeCount = filtered.filter((r) => r.is_active).length;
  const requiredCount = filtered.filter((r) => r.is_active && r.is_required).length;
  const totalCount = filtered.length;

  function handleToggle(reqId: string, field: "is_active" | "is_required", newValue: boolean) {
    setFeedback(null);
    startTransition(async () => {
      const result = await staffUpdatePacketRequirement(reqId, { [field]: newValue });
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        router.refresh();
      }
    });
  }

  const campusName = campuses.find((c) => c.id === selectedCampus)?.name ?? "Campus";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Registration Requirements</CardTitle>
            <CardDescription>
              Configure which registration items are required for each campus and school year.
              Active items will appear in family registration packets.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div>
            <label className="block text-xs font-medium text-stone mb-1">Campus</label>
            <select
              value={selectedCampus}
              onChange={(e) => { setSelectedCampus(e.target.value); setFeedback(null); }}
              className="px-3 py-1.5 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            >
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone mb-1">School Year</label>
            <select
              value={selectedYear}
              onChange={(e) => { setSelectedYear(e.target.value); setFeedback(null); }}
              className="px-3 py-1.5 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
            >
              {schoolYears.map((sy) => (
                <option key={sy.id} value={sy.id}>{sy.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-rooted-gray-dark/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-rooted-green/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone/30 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rooted-green" />
            </label>
            <span className="text-sm text-ink/60">Show inactive items</span>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex gap-4 mb-5 pb-4 border-b border-stone/20">
          <div className="text-center">
            <p className="text-2xl font-bold text-rooted-green">{activeCount}</p>
            <p className="text-[10px] text-stone uppercase tracking-wide">Active</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-600">{requiredCount}</p>
            <p className="text-[10px] text-stone uppercase tracking-wide">Required</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-stone">{totalCount - activeCount}</p>
            <p className="text-[10px] text-stone uppercase tracking-wide">Inactive</p>
          </div>
        </div>

        {feedback && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            feedback.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}>
            {feedback.message}
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconClipboardList size={40} />}
            title="No requirements configured"
            description={`No registration requirements found for ${campusName}. Run the packet requirements seed migration to populate items.`}
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([category, items]) => {
              const visibleItems = showInactive ? items : items.filter((r) => r.is_active);
              if (visibleItems.length === 0) return null;

              return (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-stone uppercase tracking-wider mb-2">
                    {category}
                  </h3>
                  <div className="space-y-1">
                    {visibleItems.map((req) => (
                      <div
                        key={req.id}
                        className={`flex items-center justify-between p-3 rounded-md border transition-colors ${
                          !req.is_active
                            ? "border-rooted-gray bg-rooted-gray-light/50 opacity-60"
                            : "border-stone/20 hover:border-stone/30"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink truncate">{req.name}</p>
                            {req.description && (
                              <p className="text-xs text-stone truncate">{req.description}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                          {/* Required toggle */}
                          <label className="flex items-center gap-1.5 cursor-pointer" title="Required">
                            <input
                              type="checkbox"
                              checked={req.is_required}
                              disabled={isPending || !req.is_active}
                              onChange={(e) => handleToggle(req.id, "is_required", e.target.checked)}
                              className="w-4 h-4 text-red-600 border-stone/30 rounded focus:ring-red-500 disabled:opacity-40"
                            />
                            <span className={`text-[10px] font-medium ${req.is_required && req.is_active ? "text-red-600" : "text-stone"}`}>
                              Required
                            </span>
                          </label>
                          {/* Active toggle */}
                          <label className="relative inline-flex items-center cursor-pointer" title={req.is_active ? "Active" : "Inactive"}>
                            <input
                              type="checkbox"
                              checked={req.is_active}
                              disabled={isPending}
                              onChange={(e) => handleToggle(req.id, "is_active", e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-rooted-gray-dark/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-rooted-green/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone/30 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rooted-green peer-disabled:opacity-50" />
                          </label>
                        </div>
                      </div>
                    ))}
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
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUserRow | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Assign form state
  const [email, setEmail] = useState("");
  const [campusId, setCampusId] = useState("");
  const [role, setRole] = useState<"enrollment_staff" | "enrollment_manager" | "system_admin" | "compliance_auditor">("enrollment_staff");

  // Edit form state
  const [editRole, setEditRole] = useState<string>("enrollment_staff");
  const [editCampusId, setEditCampusId] = useState("");

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
      });
      if (!result.error && result.data?.invited) {
        setFeedback({ type: "success", message: `Invite sent to ${email.trim().toLowerCase()}. They will receive an email to set up their account.` });
        return;
      }
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
        toast({ variant: "success", title: `Removed ${userName}'s role` });
        router.refresh();
      }
    });
  }

  function openEdit(user: StaffUserRow) {
    setEditingUser(user);
    setEditRole(user.role);
    setEditCampusId(user.campus_id);
    setEditDialogOpen(true);
  }

  function handleEditSave() {
    if (!editingUser) return;
    setFeedback(null);
    startTransition(async () => {
      // Check if anything actually changed
      const roleChanged = editRole !== editingUser.role;
      const campusChanged = editCampusId !== editingUser.campus_id;
      if (!roleChanged && !campusChanged) {
        setEditDialogOpen(false);
        return;
      }

      // Edit the existing role record directly
      const editResult = await staffEditRole(editingUser.id, {
        role: editRole,
        campus_id: editCampusId,
      });
      if (editResult.error) {
        setFeedback({ type: "error", message: editResult.error });
        return;
      }

      setFeedback({ type: "success", message: `Updated ${editingUser.full_name}'s role.` });
      setEditDialogOpen(false);
      router.refresh();
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
            <DialogTrigger asChild>
              <Button>Invite Staff</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Staff Member</DialogTitle>
                <DialogDescription>
                  Enter their email and role. They'll receive an invite email to set up their account — no prior login required.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">User Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@rootedschool.org"
                    className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1">Campus</label>
                    <select
                      value={campusId}
                      onChange={(e) => setCampusId(e.target.value)}
                      className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    >
                      <option value="">Select campus</option>
                      {campuses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1">Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as typeof role)}
                      className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
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
            icon={<IconUsers size={40} />}
            title="No staff users"
            description="Staff users will appear here once they are assigned campus roles."
          />
        ) : (() => {
          // Group users by person (user_id) to show multi-campus assignments together
          const grouped = users.reduce<Record<string, StaffUserRow[]>>((acc, u) => {
            const key = u.user_id || u.id;
            if (!acc[key]) acc[key] = [];
            acc[key].push(u);
            return acc;
          }, {});

          return (
            <div className="space-y-3">
              {Object.values(grouped).map((roles) => {
                const primary = roles[0];
                const highestRole = roles.reduce((best, r) => {
                  const roleOrder: Record<string, number> = { compliance_auditor: 1, enrollment_staff: 2, enrollment_manager: 3, system_admin: 4 };
                  return (roleOrder[r.role] ?? 0) > (roleOrder[best.role] ?? 0) ? r : best;
                }, roles[0]);
                const isSelf = primary.user_id === staffUserId;

                return (
                  <div
                    key={primary.user_id || primary.id}
                    className={`p-4 rounded-lg border ${isSelf ? "border-rooted-green/30 bg-rooted-green/5" : "border-stone/20"}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-rooted-green/10 flex items-center justify-center text-rooted-green font-semibold text-sm">
                          {primary.initials}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm text-ink">{primary.full_name}</p>
                            {isSelf && (
                              <span className="text-[10px] bg-rooted-green/20 text-rooted-green px-1.5 py-0.5 rounded-full font-medium">You</span>
                            )}
                          </div>
                          <p className="text-xs text-stone">{primary.email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {roleLabels[highestRole.role] ?? highestRole.role}
                      </Badge>
                    </div>

                    {/* Campus assignments */}
                    <div className="mt-3 ml-[52px] space-y-1.5">
                      {roles.map((assignment) => (
                        <div
                          key={assignment.id}
                          className="flex items-center justify-between py-1.5 px-3 rounded-md bg-rooted-gray-light group"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-ink/70">{assignment.campus_name}</span>
                            <span className="text-[10px] text-stone">
                              {roleLabels[assignment.role] ?? assignment.role}
                            </span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2"
                              disabled={isPending}
                              onClick={() => openEdit(assignment)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              disabled={isPending}
                              onClick={() => handleRemove(assignment.id, primary.full_name)}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </CardContent>

      {/* Edit Role Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Staff Role</DialogTitle>
            <DialogDescription>
              Update the role or campus assignment for {editingUser?.full_name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-rooted-gray-light rounded-lg p-3">
              <p className="text-sm font-medium">{editingUser?.full_name}</p>
              <p className="text-xs text-stone">{editingUser?.email}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Campus</label>
              <select
                value={editCampusId}
                onChange={(e) => setEditCampusId(e.target.value)}
                className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              >
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Role</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              >
                <option value="enrollment_staff">Enrollment Staff</option>
                <option value="enrollment_manager">Enrollment Manager</option>
                <option value="system_admin">System Admin</option>
                <option value="compliance_auditor">Compliance Auditor</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={isPending}>
              {isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── School Years & Grades Tab ──────────────────────────

function SchoolYearsGradesTab({
  schoolYears,
  gradeLevels,
  capacityPlans,
  campuses,
  activeCampusId,
  isSystemAdmin,
}: {
  schoolYears: SchoolYear[];
  gradeLevels: GradeLevel[];
  capacityPlans: CapacityPlanRow[];
  campuses: CampusRow[];
  activeCampusId?: string;
  isSystemAdmin: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [selectedCampus, setSelectedCampus] = useState(activeCampusId ?? campuses[0]?.id ?? "");
  const [selectedYear, setSelectedYear] = useState(
    schoolYears.find((sy) => sy.is_current)?.id ?? schoolYears[0]?.id ?? ""
  );

  // ── School Year create dialog state ──
  const [yearDialogOpen, setYearDialogOpen] = useState(false);
  const [yearFeedback, setYearFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [yearName, setYearName] = useState("");
  const [yearStart, setYearStart] = useState("");
  const [yearEnd, setYearEnd] = useState("");
  const [yearIsCurrent, setYearIsCurrent] = useState(false);

  function resetYearForm() {
    setYearName("");
    setYearStart("");
    setYearEnd("");
    setYearIsCurrent(false);
  }

  function handleCreateYear() {
    if (!yearName.trim() || !yearStart || !yearEnd) return;
    if (new Date(yearEnd) <= new Date(yearStart)) {
      setYearFeedback({ type: "error", message: "End date must be after start date." });
      return;
    }
    setYearFeedback(null);
    startTransition(async () => {
      const result = await staffCreateSchoolYear({
        name: yearName.trim(),
        start_date: yearStart,
        end_date: yearEnd,
        is_current: yearIsCurrent,
      });
      if (result.error) {
        setYearFeedback({ type: "error", message: result.error });
      } else {
        setYearDialogOpen(false);
        resetYearForm();
        toast({ variant: "success", title: `${yearName.trim()} created.` });
        router.refresh();
      }
    });
  }

  function handleToggleCurrent(sy: SchoolYear) {
    startTransition(async () => {
      const result = await staffUpdateSchoolYearCurrent(sy.id, !sy.is_current);
      if (result.error) {
        toast({ variant: "error", title: result.error });
      } else {
        toast({
          variant: "success",
          title: sy.is_current ? `${sy.name} is no longer marked current` : `${sy.name} marked current`,
        });
        router.refresh();
      }
    });
  }

  // ── Grade Level create dialog state ──
  const [gradeDialogOpen, setGradeDialogOpen] = useState(false);
  const [gradeFeedback, setGradeFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [gradeCampusId, setGradeCampusId] = useState(selectedCampus);
  const [gradeYearId, setGradeYearId] = useState(selectedYear);
  const [gradeSelection, setGradeSelection] = useState<string[]>([]);

  function openGradeDialog() {
    setGradeCampusId(selectedCampus);
    setGradeYearId(selectedYear);
    setGradeSelection([]);
    setGradeFeedback(null);
    setGradeDialogOpen(true);
  }

  function toggleGradeSelection(grade: string) {
    setGradeSelection((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade]
    );
  }

  function handleCreateGrades() {
    if (!gradeCampusId || !gradeYearId || gradeSelection.length === 0) return;
    setGradeFeedback(null);
    startTransition(async () => {
      const result = await staffCreateGradeLevel({
        campus_id: gradeCampusId,
        school_year_id: gradeYearId,
        grades: gradeSelection,
      });
      if (result.error) {
        setGradeFeedback({ type: "error", message: result.error });
      } else {
        setGradeDialogOpen(false);
        const skipped = result.data?.skipped ?? [];
        toast({
          variant: "success",
          title: `Added ${result.data?.inserted ?? 0} grade level${result.data?.inserted === 1 ? "" : "s"}.`,
          description: skipped.length > 0 ? `Grade${skipped.length > 1 ? "s" : ""} ${skipped.join(", ")} already existed and ${skipped.length > 1 ? "were" : "was"} skipped.` : undefined,
        });
        router.refresh();
      }
    });
  }

  function handleDeleteGrade(g: GradeLevel) {
    if (!confirm(`Remove Grade ${g.grade}? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await staffDeleteGradeLevel(g.id);
      if (result.error) {
        toast({ variant: "error", title: result.error });
      } else {
        toast({ variant: "success", title: `Grade ${g.grade} removed.` });
        router.refresh();
      }
    });
  }

  // ── Capacity Plan create dialog state ──
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [planFeedback, setPlanFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [planCampusId, setPlanCampusId] = useState(selectedCampus);
  const [planYearId, setPlanYearId] = useState(selectedYear);
  const [planGradeLevelId, setPlanGradeLevelId] = useState("");
  const [planTotalSeats, setPlanTotalSeats] = useState<number>(0);

  const planGradeOptions = gradeLevels
    .filter((g) => g.campus_id === planCampusId && g.school_year_id === planYearId)
    .sort((a, b) => (parseInt(a.grade) || 0) - (parseInt(b.grade) || 0));

  function openPlanDialog() {
    setPlanCampusId(selectedCampus);
    setPlanYearId(selectedYear);
    setPlanGradeLevelId("");
    setPlanTotalSeats(0);
    setPlanFeedback(null);
    setPlanDialogOpen(true);
  }

  function handleCreatePlan() {
    if (!planCampusId || !planYearId || !planGradeLevelId || planTotalSeats < 0) return;
    setPlanFeedback(null);
    startTransition(async () => {
      const result = await staffCreateCapacityPlan({
        campus_id: planCampusId,
        grade_level_id: planGradeLevelId,
        school_year_id: planYearId,
        total_seats: planTotalSeats,
      });
      if (result.error) {
        setPlanFeedback({ type: "error", message: result.error });
      } else {
        setPlanDialogOpen(false);
        toast({ variant: "success", title: "Capacity plan created." });
        router.refresh();
      }
    });
  }

  const campusGrades = gradeLevels
    .filter((g) => g.campus_id === selectedCampus && g.school_year_id === selectedYear)
    .sort((a, b) => (parseInt(a.grade) || 0) - (parseInt(b.grade) || 0));

  // ── Capacity Plan inline seat-total editing ──
  // Same interaction as the Seats tab (click value -> number input -> save/cancel),
  // scoped to the campus/year currently selected above so it lines up with the
  // grade levels shown there. Day-to-day editing across all campuses still lives
  // on the Seats tab; this closes the gap for staff already in Settings.
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editPlanValue, setEditPlanValue] = useState<number>(0);
  const [planRowFeedback, setPlanRowFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const campusCapacityPlans = capacityPlans
    .filter((p) => p.campus_id === selectedCampus && p.school_year_id === selectedYear)
    .sort((a, b) => (parseInt(a.grade) || 0) - (parseInt(b.grade) || 0));

  function handleEditPlan(plan: CapacityPlanRow) {
    setEditingPlanId(plan.id);
    setEditPlanValue(plan.total_seats);
    setPlanRowFeedback(null);
  }

  function handleCancelPlanEdit() {
    setEditingPlanId(null);
    setEditPlanValue(0);
  }

  function handleSavePlan(planId: string) {
    if (editPlanValue < 0) return;
    startTransition(async () => {
      const result = await staffUpdateCapacity(planId, editPlanValue);
      if (result.error) {
        setPlanRowFeedback({ type: "error", message: result.error });
      } else {
        setPlanRowFeedback({ type: "success", message: "Capacity updated." });
        setEditingPlanId(null);
        router.refresh();
      }
    });
  }

  const fieldClass =
    "w-full px-3 py-2 border border-line rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 min-h-[44px]";

  return (
    <div className="space-y-6">
      {/* School Years */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">School Years</CardTitle>
              <CardDescription>
                Configured school years in the system. Enrollment windows and reports default to whichever year is marked current.
              </CardDescription>
            </div>
            {isSystemAdmin && (
              <Dialog open={yearDialogOpen} onOpenChange={setYearDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-[6px] min-h-[44px]">Add School Year</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add School Year</DialogTitle>
                    <DialogDescription>
                      Set up a new school year so enrollment windows, grade levels, and capacity plans can be built against it.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <label className="block text-sm font-medium text-ink/70 mb-1">Name</label>
                      <input
                        type="text"
                        value={yearName}
                        onChange={(e) => setYearName(e.target.value)}
                        placeholder="e.g. 2028-29"
                        className={fieldClass}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-ink/70 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={yearStart}
                          onChange={(e) => setYearStart(e.target.value)}
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink/70 mb-1">End Date</label>
                        <input
                          type="date"
                          value={yearEnd}
                          onChange={(e) => setYearEnd(e.target.value)}
                          className={fieldClass}
                        />
                      </div>
                    </div>
                    <label className="flex min-h-[44px] items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={yearIsCurrent}
                        onChange={(e) => setYearIsCurrent(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-ink">Mark as current</span>
                    </label>
                    <p className="text-xs text-stone-text">
                      More than one year can be current at the same time, for example a recruiting year alongside an operating year.
                    </p>
                  </div>
                  {yearFeedback?.type === "error" && (
                    <p className="text-sm text-red-600 mb-2">{yearFeedback.message}</p>
                  )}
                  <DialogFooter>
                    <Button variant="outline" className="rounded-[6px] min-h-[44px]" onClick={() => setYearDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      className="rounded-[6px] min-h-[44px]"
                      onClick={handleCreateYear}
                      disabled={isPending || !yearName.trim() || !yearStart || !yearEnd}
                    >
                      {isPending ? "Creating…" : "Create School Year"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {schoolYears.length === 0 ? (
            <EmptyState
              icon={<IconCalendar size={40} />}
              title="No school years configured"
              description={
                isSystemAdmin
                  ? "Add a school year to start building enrollment windows and grade levels against it."
                  : "No school years have been set up yet. Ask a system administrator to add one."
              }
            />
          ) : (
            <div className="space-y-3">
              {schoolYears.map((sy) => (
                <div
                  key={sy.id}
                  className={`flex items-center justify-between p-3 rounded-[6px] border ${
                    sy.is_current ? "border-rooted-green/40 bg-rooted-green/5" : "border-line"
                  }`}
                >
                  <div>
                    <p className="font-medium text-sm">{sy.name}</p>
                    {sy.start_date && sy.end_date && (
                      <p className="text-xs text-stone">
                        {new Date(sy.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        {" — "}
                        {new Date(sy.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {sy.is_current && <Badge variant="success">Current</Badge>}
                    {isSystemAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-[6px] min-h-[44px]"
                        disabled={isPending}
                        onClick={() => handleToggleCurrent(sy)}
                      >
                        {sy.is_current ? "Unmark current" : "Mark current"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Grade Levels */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base">Grade Levels</CardTitle>
              <CardDescription>
                Grade levels configured per campus and school year. These determine which grades families can apply for.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedCampus}
                onChange={(e) => setSelectedCampus(e.target.value)}
                className="px-3 py-1.5 border border-line rounded-[6px] text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              >
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-1.5 border border-line rounded-[6px] text-sm min-h-[44px] focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              >
                {schoolYears.map((sy) => (
                  <option key={sy.id} value={sy.id}>{sy.name}</option>
                ))}
              </select>
              {isSystemAdmin && (
                <Dialog open={gradeDialogOpen} onOpenChange={setGradeDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="rounded-[6px] min-h-[44px]" onClick={openGradeDialog}>
                      Add Grade Levels
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Grade Levels</DialogTitle>
                      <DialogDescription>
                        Choose a campus and school year, then select which grades to open for applications.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-ink/70 mb-1">Campus</label>
                          <select
                            value={gradeCampusId}
                            onChange={(e) => setGradeCampusId(e.target.value)}
                            className={fieldClass}
                          >
                            {campuses.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-ink/70 mb-1">School Year</label>
                          <select
                            value={gradeYearId}
                            onChange={(e) => setGradeYearId(e.target.value)}
                            className={fieldClass}
                          >
                            {schoolYears.map((sy) => (
                              <option key={sy.id} value={sy.id}>{sy.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink/70 mb-2">Grades</label>
                        <div className="flex flex-wrap gap-2">
                          {GRADE_LEVEL_CODES.map((grade) => {
                            const checked = gradeSelection.includes(grade);
                            return (
                              <button
                                key={grade}
                                type="button"
                                onClick={() => toggleGradeSelection(grade)}
                                className={`min-h-[44px] px-4 rounded-[6px] border text-sm font-medium transition-colors ${
                                  checked
                                    ? "border-rooted-green bg-rooted-green/10 text-deep-green"
                                    : "border-line bg-white text-ink hover:bg-rooted-gray-light"
                                }`}
                              >
                                Grade {grade}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    {gradeFeedback?.type === "error" && (
                      <p className="text-sm text-red-600 mb-2">{gradeFeedback.message}</p>
                    )}
                    <DialogFooter>
                      <Button variant="outline" className="rounded-[6px] min-h-[44px]" onClick={() => setGradeDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        className="rounded-[6px] min-h-[44px]"
                        onClick={handleCreateGrades}
                        disabled={isPending || !gradeCampusId || !gradeYearId || gradeSelection.length === 0}
                      >
                        {isPending ? "Adding…" : "Add Grade Levels"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {campusGrades.length === 0 ? (
            <EmptyState
              icon={<IconGraduationCap size={40} />}
              title="No grade levels configured"
              description={
                isSystemAdmin
                  ? `No grade levels for ${campuses.find((c) => c.id === selectedCampus)?.name ?? "this campus"} in ${schoolYears.find((sy) => sy.id === selectedYear)?.name ?? "this year"}. Add one above.`
                  : "No grade levels are configured for this campus and year yet."
              }
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {campusGrades.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-2 pl-4 pr-2 py-2.5 rounded-[6px] border border-line bg-white"
                >
                  <span className="text-sm font-medium text-ink">Grade {g.grade}</span>
                  {isSystemAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteGrade(g)}
                      disabled={isPending}
                      title={`Remove Grade ${g.grade}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] text-stone hover:bg-rooted-gray-light hover:text-red-600 disabled:opacity-40"
                    >
                      <IconX size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-stone mt-4">
            {campusGrades.length} grade level{campusGrades.length !== 1 ? "s" : ""} configured for{" "}
            {campuses.find((c) => c.id === selectedCampus)?.name ?? "this campus"} in{" "}
            {schoolYears.find((sy) => sy.id === selectedYear)?.name ?? "this year"}
          </p>
        </CardContent>
      </Card>

      {/* Capacity Plans — creation lives here next to Grade Levels, so the
          campus/grade/year picker in the create dialog is scoped by the same
          data staff just configured above instead of re-deriving that context
          on a separate page. Editing an existing plan's seat total also lives
          here now (mirrors the Seats tab's inline editor), so staff no longer
          have to leave Settings to fix a number they just set. */}
      {isSystemAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">Capacity Plans</CardTitle>
                <CardDescription>
                  Set seat capacity for a campus, grade, and school year.
                </CardDescription>
              </div>
              <Dialog open={planDialogOpen} onOpenChange={setPlanDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-[6px] min-h-[44px]" onClick={openPlanDialog}>
                    Add Capacity Plan
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Capacity Plan</DialogTitle>
                    <DialogDescription>
                      Set total seats for one campus, grade, and school year combination.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-ink/70 mb-1">Campus</label>
                        <select
                          value={planCampusId}
                          onChange={(e) => {
                            setPlanCampusId(e.target.value);
                            setPlanGradeLevelId("");
                          }}
                          className={fieldClass}
                        >
                          {campuses.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink/70 mb-1">School Year</label>
                        <select
                          value={planYearId}
                          onChange={(e) => {
                            setPlanYearId(e.target.value);
                            setPlanGradeLevelId("");
                          }}
                          className={fieldClass}
                        >
                          {schoolYears.map((sy) => (
                            <option key={sy.id} value={sy.id}>{sy.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-ink/70 mb-1">Grade Level</label>
                        {planGradeOptions.length === 0 ? (
                          <p className="text-xs text-stone-text py-2">
                            No grade levels exist for this campus and year yet. Add one above first.
                          </p>
                        ) : (
                          <select
                            value={planGradeLevelId}
                            onChange={(e) => setPlanGradeLevelId(e.target.value)}
                            className={fieldClass}
                          >
                            <option value="">Select grade</option>
                            {planGradeOptions.map((g) => (
                              <option key={g.id} value={g.id}>Grade {g.grade}</option>
                            ))}
                          </select>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-ink/70 mb-1">Total Seats</label>
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={planTotalSeats}
                          onChange={(e) => setPlanTotalSeats(Math.max(0, parseInt(e.target.value) || 0))}
                          className={fieldClass}
                        />
                      </div>
                    </div>
                  </div>
                  {planFeedback?.type === "error" && (
                    <p className="text-sm text-red-600 mb-2">{planFeedback.message}</p>
                  )}
                  <DialogFooter>
                    <Button variant="outline" className="rounded-[6px] min-h-[44px]" onClick={() => setPlanDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      className="rounded-[6px] min-h-[44px]"
                      onClick={handleCreatePlan}
                      disabled={isPending || !planCampusId || !planYearId || !planGradeLevelId}
                    >
                      {isPending ? "Creating…" : "Create Capacity Plan"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {planRowFeedback && (
              <div
                className={`mb-4 p-3 rounded-[6px] text-sm ${
                  planRowFeedback.type === "success"
                    ? "bg-green-50 border border-green-200 text-green-800"
                    : "bg-red-50 border border-red-200 text-red-800"
                }`}
              >
                {planRowFeedback.message}
              </div>
            )}
            {campusCapacityPlans.length === 0 ? (
              <p className="text-sm text-stone">
                No capacity plans configured for{" "}
                {campuses.find((c) => c.id === selectedCampus)?.name ?? "this campus"} in{" "}
                {schoolYears.find((sy) => sy.id === selectedYear)?.name ?? "this year"}.
              </p>
            ) : (
              <div className="space-y-2">
                {campusCapacityPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex items-center justify-between p-3 rounded-[6px] border border-stone/20"
                  >
                    <p className="font-medium text-sm text-ink">Grade {plan.grade}</p>
                    {editingPlanId === plan.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editPlanValue}
                          onChange={(e) => setEditPlanValue(Math.max(0, parseInt(e.target.value) || 0))}
                          min={0}
                          max={999}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSavePlan(plan.id);
                            if (e.key === "Escape") handleCancelPlanEdit();
                          }}
                          className="w-20 px-2 py-2 text-right border border-stone/30 rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 min-h-[44px]"
                        />
                        <span className="text-xs text-stone">seats</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-[6px] min-h-[44px]"
                          onClick={handleCancelPlanEdit}
                          disabled={isPending}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-[6px] min-h-[44px]"
                          onClick={() => handleSavePlan(plan.id)}
                          disabled={isPending}
                        >
                          {isPending ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditPlan(plan)}
                        className="flex items-center gap-2 text-sm text-ink/80 hover:text-rooted-green transition-colors min-h-[44px] px-2 -mr-2 rounded-[6px]"
                        title="Edit total seats"
                      >
                        <span className="font-medium">{plan.total_seats}</span>
                        <span className="text-xs text-stone">seats</span>
                        <IconPenLine size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-stone mt-4 border-l-2 border-line pl-3">
              Seat totals can also be edited on the Seats tab.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Preferences Tab ────────────────────────────────────

function PreferencesTab({ settings }: { settings: Record<string, string> }) {
  const PREFERENCE_SECTIONS = [
    {
      title: "Enrollment",
      description: "Control enrollment behavior and defaults",
      items: [
        {
          key: "auto_verify_documents",
          label: "Auto-verify uploaded documents",
          description: "Automatically mark family-uploaded documents as verified. Disable to require staff manual review.",
          type: "toggle" as const,
          default: "false",
        },
        {
          key: "allow_late_applications",
          label: "Allow late applications",
          description: "Accept applications after the enrollment window close date.",
          type: "toggle" as const,
          default: "false",
        },
        {
          key: "default_offer_expiry_days",
          label: "Default offer expiration (days)",
          description: "Number of days before an offer expires if the family doesn't respond.",
          type: "number" as const,
          default: "14",
        },
        {
          key: "require_lottery_for_offers",
          label: "Require lottery before offers",
          description: "Prevent manual offers until a lottery has been run for the enrollment window.",
          type: "toggle" as const,
          default: "false",
        },
      ],
    },
    {
      title: "Notifications",
      description: "Control system notification behavior",
      items: [
        {
          key: "notify_family_on_status_change",
          label: "Notify families on status change",
          description: "Send an in-app notification when an application status changes.",
          type: "toggle" as const,
          default: "true",
        },
        {
          key: "notify_staff_on_new_application",
          label: "Notify staff on new application",
          description: "Alert assigned staff when a new application is submitted.",
          type: "toggle" as const,
          default: "true",
        },
      ],
    },
    {
      title: "Display",
      description: "Customize how data is displayed to staff",
      items: [
        {
          key: "dashboard_default_view",
          label: "Dashboard default time range",
          description: "Default time period for dashboard stats and charts.",
          type: "select" as const,
          options: [
            { value: "7d", label: "Last 7 days" },
            { value: "30d", label: "Last 30 days" },
            { value: "90d", label: "Last 90 days" },
            { value: "all", label: "All time" },
          ],
          default: "30d",
        },
        {
          key: "applications_per_page",
          label: "Applications per page",
          description: "Number of applications shown per page in list views.",
          type: "number" as const,
          default: "25",
        },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Every control below is read-only: none is wired to a mutation. They
          were styled like live controls, so staff clicked a toggle, saw no
          confirmation, and had no way to tell whether the change took. Say so
          once, up front, rather than in fine print under each card. */}
      <div className="rounded-[6px] border border-warn/40 bg-warn/10 px-4 py-3">
        <p className="text-sm font-medium text-warn-text">These settings are read only</p>
        <p className="mt-1 text-xs text-stone-text">
          This tab shows how the system is currently configured. Changing a value here does
          not save. Ask your system administrator to change any of these settings.
        </p>
      </div>
      {PREFERENCE_SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="text-base">{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-rooted-gray">
              {section.items.map((item) => {
                const currentValue = settings[item.key] ?? item.default;
                const isOn = currentValue === "true";

                return (
                  <div key={item.key} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                    <div className="pr-4">
                      <p className="text-sm font-medium text-ink">{item.label}</p>
                      <p className="text-xs text-stone mt-0.5">{item.description}</p>
                    </div>
                    <div className="flex-shrink-0">
                      {item.type === "toggle" && (
                        <label className="relative inline-flex items-center cursor-pointer" title={isOn ? "Enabled" : "Disabled"}>
                          <input
                            type="checkbox"
                            checked={isOn}
                            readOnly
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-rooted-gray-dark/30 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-rooted-green/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone/30 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rooted-green" />
                        </label>
                      )}
                      {item.type === "number" && (
                        <input
                          type="number"
                          value={currentValue}
                          readOnly
                          className="w-20 px-3 py-1.5 border border-stone/30 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                        />
                      )}
                      {item.type === "select" && "options" in item && (
                        <select
                          value={currentValue}
                          disabled
                          className="px-3 py-1.5 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                        >
                          {item.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-stone mt-4 pt-3 border-t border-rooted-gray">
              Preference changes require a database update. Contact your system administrator to modify these settings.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
