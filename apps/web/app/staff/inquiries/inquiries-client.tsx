"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import type { InquiryRow, InquiryStats, CampusRow } from "@/lib/queries";
import {
  updateInquiryStatusAction,
  assignInquiryStaffAction,
  addContactLogAction,
  convertInquiryAction,
} from "./actions";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "applied", label: "Applied" },
  { value: "lost", label: "Lost" },
];

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "success" | "warning" | "secondary" | "outline" }
> = {
  new: { label: "New", variant: "default" },
  contacted: { label: "Contacted", variant: "warning" },
  applied: { label: "Applied", variant: "success" },
  lost: { label: "Lost", variant: "secondary" },
};

const CONTACT_CHANNELS = [
  { value: "phone", label: "Phone Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "text", label: "Text Message" },
  { value: "other", label: "Other" },
];

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Phone Call",
  email: "Email",
  meeting: "Meeting",
  text: "Text Message",
  other: "Other",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface GradeLevel {
  id: string;
  grade: string;
  campus_id: string;
}

interface EnrollmentWindow {
  id: string;
  name: string;
  campus_id: string;
  status: string;
}

interface ContactLog {
  id: string;
  channel: string;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface InquiriesClientProps {
  inquiries: InquiryRow[];
  stats: InquiryStats;
  campuses: CampusRow[];
  gradeLevels: GradeLevel[];
  enrollmentWindows: EnrollmentWindow[];
  contactLogsByInquiry: Record<string, ContactLog[]>;
  staffId: string;
}

export function InquiriesClient({
  inquiries,
  stats,
  campuses,
  gradeLevels,
  enrollmentWindows,
  contactLogsByInquiry,
  staffId,
}: InquiriesClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [campusFilter, setCampusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Contact log dialog
  const [contactLogOpen, setContactLogOpen] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<InquiryRow | null>(null);
  const [contactChannel, setContactChannel] = useState("phone");
  const [contactNotes, setContactNotes] = useState("");

  // Convert dialog
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertInquiry, setConvertInquiry] = useState<InquiryRow | null>(null);
  const [convertWindowId, setConvertWindowId] = useState("");
  const [convertGradeId, setConvertGradeId] = useState("");
  const [convertError, setConvertError] = useState("");

  const [isPending, startTransition] = useTransition();

  const filtered = inquiries.filter((inq) => {
    const name = `${inq.student_first_name} ${inq.student_last_name} ${inq.guardian_name}`.toLowerCase();
    const matchesSearch = !search || name.includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || inq.status === statusFilter;
    const matchesCampus = campusFilter === "all" || inq.campus_id === campusFilter;
    return matchesSearch && matchesStatus && matchesCampus;
  });

  function handleStatusUpdate(inquiryId: string, newStatus: string) {
    startTransition(async () => {
      await updateInquiryStatusAction(inquiryId, newStatus);
      router.refresh();
    });
  }

  function handleAssignToMe(inquiryId: string) {
    startTransition(async () => {
      await assignInquiryStaffAction(inquiryId, staffId);
      router.refresh();
    });
  }

  function openContactLog(inq: InquiryRow) {
    setSelectedInquiry(inq);
    setContactChannel("phone");
    setContactNotes("");
    setContactLogOpen(true);
  }

  function handleContactLog() {
    if (!selectedInquiry) return;
    startTransition(async () => {
      await addContactLogAction(
        selectedInquiry.id,
        contactChannel,
        contactNotes || null,
        staffId
      );
      setContactLogOpen(false);
      setContactNotes("");
      router.refresh();
    });
  }

  function openConvertDialog(inq: InquiryRow) {
    setConvertInquiry(inq);
    setConvertError("");
    const campusWindows = enrollmentWindows.filter(
      (w) => w.campus_id === inq.campus_id && w.status === "open"
    );
    setConvertWindowId(campusWindows[0]?.id ?? "");
    const campusGrades = gradeLevels.filter((g) => g.campus_id === inq.campus_id);
    const matchGrade = campusGrades.find((g) => g.grade === inq.grade_applying);
    setConvertGradeId(matchGrade?.id ?? campusGrades[0]?.id ?? "");
    setConvertOpen(true);
  }

  function handleConvert() {
    if (!convertInquiry || !convertWindowId || !convertGradeId) {
      setConvertError("Please select an enrollment window and grade.");
      return;
    }
    startTransition(async () => {
      const result = await convertInquiryAction(
        convertInquiry.id,
        convertWindowId,
        convertGradeId,
        staffId
      );
      if (result.error) {
        setConvertError(result.error);
      } else {
        setConvertOpen(false);
        if (result.data?.applicationId) {
          router.push(`/staff/applications/${result.data.applicationId}`);
        } else {
          router.refresh();
        }
      }
    });
  }

  const convertCampusId = convertInquiry?.campus_id;
  const convertCampusGrades = gradeLevels.filter((g) => g.campus_id === convertCampusId);
  const convertCampusWindows = enrollmentWindows.filter(
    (w) => w.campus_id === convertCampusId
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Inquiries</h1>
        <span className="text-sm text-stone">
          <span className="font-medium">{stats.total}</span> total inquiries
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              New
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{stats.new}</p>
            <p className="text-xs text-stone mt-1">awaiting follow-up</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Contacted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.contacted}</p>
            <p className="text-xs text-stone mt-1">in follow-up</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-rooted-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Applied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">{stats.applied}</p>
            <p className="text-xs text-stone mt-1">converted</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-gray-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Lost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-stone">{stats.lost}</p>
            <p className="text-xs text-stone mt-1">did not convert</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by student or guardian name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={campusFilter}
              onChange={(e) => setCampusFilter(e.target.value)}
              className="w-full sm:w-48"
            >
              <option value="all">All Campuses</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Status tabs + table */}
      <Tabs defaultValue="all" onValueChange={setStatusFilter}>
        <TabsList>
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value !== "all"
                ? stats[tab.value as keyof InquiryStats]
                : undefined;
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {tab.value !== "all" && typeof count === "number" && count > 0 ? (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-rooted-gray text-[10px] font-semibold">
                    {count}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={statusFilter}>
          <Card>
            <CardContent className="pt-6 px-0">
              {filtered.length === 0 ? (
                <EmptyState
                  icon="🔍"
                  title="No inquiries found"
                  description={
                    search || campusFilter !== "all"
                      ? "Try adjusting your search or filters."
                      : "Inquiries will appear here when families express interest."
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Guardian</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Campus</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Contacts</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inq) => {
                      const cfg = STATUS_CONFIG[inq.status] ?? {
                        label: inq.status,
                        variant: "outline" as const,
                      };
                      const logs = contactLogsByInquiry[inq.id] ?? [];
                      const isExpanded = expandedId === inq.id;

                      return (
                        <Fragment key={inq.id}>
                          <TableRow
                            className={`cursor-pointer hover:bg-rooted-gray/30 ${isExpanded ? "bg-rooted-gray/20" : ""}`}
                            onClick={() => setExpandedId(isExpanded ? null : inq.id)}
                          >
                            <TableCell className="font-medium">
                              {inq.student_first_name} {inq.student_last_name}
                            </TableCell>
                            <TableCell className="text-stone">
                              {inq.guardian_name}
                            </TableCell>
                            <TableCell>{inq.grade_applying}</TableCell>
                            <TableCell>{inq.campus_name ?? "—"}</TableCell>
                            <TableCell className="text-stone capitalize">
                              {inq.source?.replace(/_/g, " ")}
                            </TableCell>
                            <TableCell>
                              <Badge variant={cfg.variant}>{cfg.label}</Badge>
                            </TableCell>
                            <TableCell>
                              {logs.length > 0 ? (
                                <span className="text-xs font-medium text-rooted-green">
                                  {logs.length} {logs.length === 1 ? "contact" : "contacts"}
                                </span>
                              ) : (
                                <span className="text-xs text-stone">None</span>
                              )}
                            </TableCell>
                            <TableCell className="text-stone">
                              {inq.assigned_staff_name ?? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAssignToMe(inq.id);
                                  }}
                                  className="text-xs text-rooted-green hover:underline"
                                  disabled={isPending}
                                >
                                  Assign to me
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="text-stone">
                              {formatDate(inq.created_at)}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-1">
                                {inq.status === "new" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleStatusUpdate(inq.id, "contacted")
                                    }
                                    disabled={isPending}
                                  >
                                    Mark Contacted
                                  </Button>
                                )}
                                {(inq.status === "new" || inq.status === "contacted") && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openConvertDialog(inq)}
                                      disabled={isPending}
                                      className="text-rooted-green border-rooted-green/30 hover:bg-rooted-green/5"
                                    >
                                      Convert
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        handleStatusUpdate(inq.id, "lost")
                                      }
                                      disabled={isPending}
                                      className="text-stone hover:text-red-600"
                                    >
                                      Lost
                                    </Button>
                                  </>
                                )}
                                {inq.status === "lost" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleStatusUpdate(inq.id, "new")
                                    }
                                    disabled={isPending}
                                    className="text-rooted-green border-rooted-green/30 hover:bg-rooted-green/5"
                                  >
                                    Re-activate
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>

                          {/* Expanded detail row */}
                          {isExpanded && (
                            <TableRow key={`${inq.id}-detail`}>
                              <TableCell colSpan={10} className="bg-rooted-gray/10 p-0">
                                <div className="px-6 py-4 space-y-4">
                                  {/* Guardian contact info + Log Contact button */}
                                  <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                      <h4 className="text-sm font-semibold text-ink">
                                        Contact Information
                                      </h4>
                                      <div className="text-sm text-stone space-y-0.5">
                                        <p>
                                          <span className="font-medium text-ink">Guardian:</span>{" "}
                                          {inq.guardian_name}
                                        </p>
                                        {inq.guardian_email && (
                                          <p>
                                            <span className="font-medium text-ink">Email:</span>{" "}
                                            <a
                                              href={`mailto:${inq.guardian_email}`}
                                              className="text-rooted-green hover:underline"
                                            >
                                              {inq.guardian_email}
                                            </a>
                                          </p>
                                        )}
                                        {inq.guardian_phone && (
                                          <p>
                                            <span className="font-medium text-ink">Phone:</span>{" "}
                                            <a
                                              href={`tel:${inq.guardian_phone}`}
                                              className="text-rooted-green hover:underline"
                                            >
                                              {inq.guardian_phone}
                                            </a>
                                          </p>
                                        )}
                                        {inq.notes && (
                                          <p className="mt-1">
                                            <span className="font-medium text-ink">Notes:</span>{" "}
                                            {inq.notes}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <Button
                                      onClick={() => openContactLog(inq)}
                                      className="bg-rooted-green hover:bg-deep-green text-white shrink-0"
                                    >
                                      + Log Contact
                                    </Button>
                                  </div>

                                  {/* Contact History */}
                                  <div>
                                    <h4 className="text-sm font-semibold text-ink mb-2">
                                      Contact History
                                    </h4>
                                    {logs.length === 0 ? (
                                      <p className="text-sm text-stone italic">
                                        No contacts logged yet. Click &quot;+ Log Contact&quot; to record your first interaction.
                                      </p>
                                    ) : (
                                      <div className="space-y-2">
                                        {logs.map((log) => (
                                          <div
                                            key={log.id}
                                            className="flex items-start gap-3 bg-white rounded-lg border border-gray-100 px-3 py-2"
                                          >
                                            <div className="shrink-0 mt-0.5">
                                              <Badge variant="outline" className="text-[10px]">
                                                {CHANNEL_LABELS[log.channel] ?? log.channel}
                                              </Badge>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              {log.notes && (
                                                <p className="text-sm text-ink">{log.notes}</p>
                                              )}
                                              <p className="text-xs text-stone mt-0.5">
                                                {log.created_by_name ?? "Staff"} &middot; {formatDateTime(log.created_at)}
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Contact Log Modal */}
      <Dialog open={contactLogOpen} onOpenChange={setContactLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Log Contact —{" "}
              {selectedInquiry
                ? `${selectedInquiry.student_first_name} ${selectedInquiry.student_last_name}`
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {selectedInquiry && (
              <div className="bg-rooted-gray/50 rounded-lg p-3 text-sm space-y-0.5">
                <p><span className="font-medium">Guardian:</span> {selectedInquiry.guardian_name}</p>
                {selectedInquiry.guardian_email && (
                  <p><span className="font-medium">Email:</span> {selectedInquiry.guardian_email}</p>
                )}
                {selectedInquiry.guardian_phone && (
                  <p><span className="font-medium">Phone:</span> {selectedInquiry.guardian_phone}</p>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Contact Channel
              </label>
              <Select
                value={contactChannel}
                onChange={(e) => setContactChannel(e.target.value)}
                className="w-full"
              >
                {CONTACT_CHANNELS.map((ch) => (
                  <option key={ch.value} value={ch.value}>
                    {ch.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Notes
              </label>
              <textarea
                className="w-full rounded-lg border border-rooted-gray-dark px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                placeholder="Summary of the conversation..."
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setContactLogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleContactLog}
                disabled={isPending}
                className="bg-rooted-green hover:bg-deep-green text-white"
              >
                {isPending ? "Saving..." : "Save Contact Log"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Convert to Application Modal */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Convert to Application —{" "}
              {convertInquiry
                ? `${convertInquiry.student_first_name} ${convertInquiry.student_last_name}`
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-stone">
              This will create a draft application using the inquiry data.
              The family or staff can then complete the full application.
            </p>

            {convertInquiry && (
              <div className="bg-rooted-gray/50 rounded-lg p-3 text-sm space-y-1">
                <p><span className="font-medium">Student:</span> {convertInquiry.student_first_name} {convertInquiry.student_last_name}</p>
                <p><span className="font-medium">Guardian:</span> {convertInquiry.guardian_name}</p>
                {convertInquiry.guardian_email && (
                  <p><span className="font-medium">Email:</span> {convertInquiry.guardian_email}</p>
                )}
                {convertInquiry.guardian_phone && (
                  <p><span className="font-medium">Phone:</span> {convertInquiry.guardian_phone}</p>
                )}
                <p><span className="font-medium">Campus:</span> {convertInquiry.campus_name}</p>
                <p><span className="font-medium">Grade:</span> {convertInquiry.grade_applying}</p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Enrollment Window
              </label>
              <Select
                value={convertWindowId}
                onChange={(e) => setConvertWindowId(e.target.value)}
                className="w-full"
              >
                <option value="">Select enrollment window...</option>
                {convertCampusWindows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Grade Level
              </label>
              <Select
                value={convertGradeId}
                onChange={(e) => setConvertGradeId(e.target.value)}
                className="w-full"
              >
                <option value="">Select grade...</option>
                {convertCampusGrades.map((g) => (
                  <option key={g.id} value={g.id}>
                    Grade {g.grade}
                  </option>
                ))}
              </Select>
            </div>

            {convertError && (
              <p className="text-sm text-red-600">{convertError}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConvertOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleConvert}
                disabled={isPending || !convertWindowId || !convertGradeId}
                className="bg-rooted-green hover:bg-deep-green text-white"
              >
                {isPending ? "Converting..." : "Create Application"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
