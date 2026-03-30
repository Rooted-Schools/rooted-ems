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
import type { CampusRow, EnrollmentWindowRow, StaffUserRow, PacketRequirementRow } from "@/lib/queries";
import {
  staffCreateEnrollmentWindow,
  staffUpdateWindowStatus,
  staffAssignRole,
  staffEditRole,
  staffRemoveRole,
  staffUpdatePacketRequirement,
} from "./actions";

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
}

interface SettingsClientProps {
  campuses: CampusRow[];
  windows: EnrollmentWindowRow[];
  users: StaffUserRow[];
  packetRequirements: PacketRequirementRow[];
  schoolYears: SchoolYear[];
  gradeLevels?: GradeLevel[];
  systemSettings?: Record<string, string>;
  staffUserId: string;
  activeCampusId?: string;
}

export function SettingsClient({
  campuses,
  windows,
  users,
  packetRequirements,
  schoolYears,
  gradeLevels = [],
  systemSettings = {},
  staffUserId,
  activeCampusId,
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
            campuses={campuses}
            activeCampusId={activeCampusId}
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
            icon="🏫"
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
                  className="flex items-center justify-between p-3 rounded-md border border-stone/20"
                >
                  <div>
                    <p className="font-medium text-sm">{w.name}</p>
                    <p className="text-xs text-stone">
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

// ─── Registration Requirements Tab ──────────────────────

const ITEM_ICONS: Record<string, string> = {
  emergency_contact: "🚨",
  medical_info: "🏥",
  medication_auth: "💊",
  food_allergy_plan: "🥜",
  tech_policy: "💻",
  handbook_ack: "📖",
  discipline_policy: "📋",
  media_release: "📷",
  field_trip: "🚌",
  internet_safety: "🔒",
  anti_bullying: "🤝",
  uniform_policy: "👔",
  ferpa_consent: "📝",
  pickup_auth: "🚗",
  immunization_records: "💉",
  proof_of_residency: "🏠",
  proof_of_age: "📄",
  lthc_form: "⚕️",
  sc_health_exam: "🩺",
  sc_dental_screen: "🦷",
  oh_custody_affidavit: "⚖️",
  income_verification: "💰",
  iep_records: "📚",
  "504_plan": "♿",
  home_language_survey: "🌐",
  mckinney_vento: "🏘️",
  previous_school_records: "🎓",
  frl_app: "🍽️",
  military_family: "🎖️",
  transport: "🚌",
  before_after_care: "🕐",
  parent_id: "🪪",
  custody_docs: "⚖️",
  student_photo: "📸",
  sports_physical: "🏃",
  wa_health_exam: "🩺",
};

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
            icon="📋"
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
                          <span className="text-lg flex-shrink-0">
                            {ITEM_ICONS[req.item_type] ?? "📄"}
                          </span>
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
        assigned_by: staffUserId,
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
            icon="👥"
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
                            <span className="text-xs" aria-hidden="true">🏫</span>
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
  campuses,
  activeCampusId,
}: {
  schoolYears: SchoolYear[];
  gradeLevels: GradeLevel[];
  campuses: CampusRow[];
  activeCampusId?: string;
}) {
  const [selectedCampus, setSelectedCampus] = useState(activeCampusId ?? campuses[0]?.id ?? "");

  const campusGrades = gradeLevels
    .filter((g) => g.campus_id === selectedCampus)
    .sort((a, b) => {
      const numA = parseInt(a.grade) || 0;
      const numB = parseInt(b.grade) || 0;
      return numA - numB;
    });

  return (
    <div className="space-y-6">
      {/* School Years */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">School Years</CardTitle>
          <CardDescription>
            Configured school years in the system. The current year is used as the default for enrollment windows and reports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {schoolYears.length === 0 ? (
            <EmptyState
              icon="📅"
              title="No school years configured"
              description="School years are managed in the database."
            />
          ) : (
            <div className="space-y-3">
              {schoolYears.map((sy) => (
                <div
                  key={sy.id}
                  className={`flex items-center justify-between p-3 rounded-md border ${
                    sy.is_current ? "border-rooted-green/40 bg-rooted-green/5" : "border-stone/20"
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
                    {sy.is_current && (
                      <Badge variant="success">Current</Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {sy.id.slice(0, 8)}
                    </Badge>
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
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Grade Levels</CardTitle>
              <CardDescription>
                Grade levels configured for each campus. These determine which grades families can apply for.
              </CardDescription>
            </div>
            {campuses.length > 1 && (
              <select
                value={selectedCampus}
                onChange={(e) => setSelectedCampus(e.target.value)}
                className="px-3 py-1.5 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
              >
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {campusGrades.length === 0 ? (
            <EmptyState
              icon="🎓"
              title="No grade levels configured"
              description="Grade levels for this campus can be added in the database."
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {campusGrades.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-stone/20 bg-white"
                >
                  <span className="text-sm font-medium text-ink">
                    Grade {g.grade}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-stone mt-4">
            {campusGrades.length} grade level{campusGrades.length !== 1 ? "s" : ""} configured for{" "}
            {campuses.find((c) => c.id === selectedCampus)?.name ?? "this campus"}
          </p>
        </CardContent>
      </Card>
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
        {
          key: "notify_staff_on_new_inquiry",
          label: "Notify staff on new inquiry",
          description: "Alert staff when a new interest inquiry is received.",
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
