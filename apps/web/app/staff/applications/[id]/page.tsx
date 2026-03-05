"use client";

import { use, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MOCK_APPLICATIONS,
  getStatusConfig,
  getGradeLabel,
} from "@/lib/application-helpers";

/* ─── Extended mock detail for a single application ─── */
interface ApplicationDetail {
  id: string;
  studentName: string;
  studentDob: string;
  studentGender: string;
  studentRace: string;
  studentLanguage: string;
  previousSchool: string;
  iep504: string;
  guardianName: string;
  guardianRelationship: string;
  guardianEmail: string;
  guardianPhone: string;
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  grade: string;
  campus: string;
  status: string;
  submittedAt: string | null;
  updatedAt: string;
  schoolYear: string;
}

const DETAIL_MAP: Record<string, ApplicationDetail> = {
  "app-001": {
    id: "app-001",
    studentName: "Marcus Johnson",
    studentDob: "2012-05-14",
    studentGender: "Male",
    studentRace: "Black or African American",
    studentLanguage: "English",
    previousSchool: "Lincoln Middle School, Vancouver WA",
    iep504: "None",
    guardianName: "Tanya Johnson",
    guardianRelationship: "Mother",
    guardianEmail: "tanya.johnson@email.com",
    guardianPhone: "(360) 555-0142",
    address: "1234 Elm Street, Vancouver, WA 98660",
    emergencyContact: "Robert Johnson",
    emergencyPhone: "(360) 555-0198",
    emergencyRelationship: "Father",
    grade: "9",
    campus: "Vancouver WA",
    status: "submitted",
    submittedAt: "2026-02-28",
    updatedAt: "2026-02-28",
    schoolYear: "2026-27",
  },
  "app-002": {
    id: "app-002",
    studentName: "Sofia Ramirez",
    studentDob: "2014-09-22",
    studentGender: "Female",
    studentRace: "Hispanic or Latino",
    studentLanguage: "Spanish / English",
    previousSchool: "Palmetto Elementary, Columbia SC",
    iep504: "None",
    guardianName: "Elena Ramirez",
    guardianRelationship: "Mother",
    guardianEmail: "elena.ramirez@email.com",
    guardianPhone: "(803) 555-0234",
    address: "567 Oak Ave, Columbia, SC 29201",
    emergencyContact: "Carlos Ramirez",
    emergencyPhone: "(803) 555-0267",
    emergencyRelationship: "Father",
    grade: "6",
    campus: "Columbia SC",
    status: "verified",
    submittedAt: "2026-02-25",
    updatedAt: "2026-03-01",
    schoolYear: "2026-27",
  },
  "app-003": {
    id: "app-003",
    studentName: "Jaylen Williams",
    studentDob: "2011-11-03",
    studentGender: "Male",
    studentRace: "Black or African American",
    studentLanguage: "English",
    previousSchool: "East Cleveland Prep, Cleveland OH",
    iep504: "504 Plan",
    guardianName: "Derrick Williams",
    guardianRelationship: "Father",
    guardianEmail: "d.williams@email.com",
    guardianPhone: "(216) 555-0178",
    address: "890 Cedar Blvd, Cleveland, OH 44106",
    emergencyContact: "Angela Williams",
    emergencyPhone: "(216) 555-0199",
    emergencyRelationship: "Mother",
    grade: "10",
    campus: "Cleveland OH",
    status: "needs_info",
    submittedAt: "2026-02-20",
    updatedAt: "2026-03-02",
    schoolYear: "2026-27",
  },
};

/* ─── Mock documents ─── */
interface AppDocument {
  id: string;
  name: string;
  type: string;
  status: "pending" | "verified" | "rejected";
  uploadedAt: string;
  verifiedBy: string | null;
  fileSize: string;
}

const MOCK_DOCUMENTS: Record<string, AppDocument[]> = {
  "app-001": [
    { id: "doc-1", name: "Birth Certificate", type: "proof_of_age", status: "verified", uploadedAt: "2026-02-28", verifiedBy: "Staff Admin", fileSize: "1.2 MB" },
    { id: "doc-2", name: "Immunization Record", type: "immunization", status: "verified", uploadedAt: "2026-02-28", verifiedBy: "Staff Admin", fileSize: "845 KB" },
    { id: "doc-3", name: "Proof of Residency", type: "residency", status: "pending", uploadedAt: "2026-02-28", verifiedBy: null, fileSize: "2.1 MB" },
    { id: "doc-4", name: "Previous School Records", type: "school_records", status: "pending", uploadedAt: "2026-02-28", verifiedBy: null, fileSize: "3.4 MB" },
  ],
  "app-002": [
    { id: "doc-5", name: "Birth Certificate", type: "proof_of_age", status: "verified", uploadedAt: "2026-02-25", verifiedBy: "Staff Admin", fileSize: "1.1 MB" },
    { id: "doc-6", name: "Immunization Record", type: "immunization", status: "verified", uploadedAt: "2026-02-25", verifiedBy: "Staff Admin", fileSize: "920 KB" },
    { id: "doc-7", name: "Proof of Residency", type: "residency", status: "verified", uploadedAt: "2026-02-25", verifiedBy: "Staff Admin", fileSize: "1.8 MB" },
  ],
  "app-003": [
    { id: "doc-8", name: "Birth Certificate", type: "proof_of_age", status: "verified", uploadedAt: "2026-02-20", verifiedBy: "Staff Admin", fileSize: "1.3 MB" },
    { id: "doc-9", name: "504 Plan Documentation", type: "iep_504", status: "pending", uploadedAt: "2026-02-20", verifiedBy: null, fileSize: "2.7 MB" },
  ],
};

/* ─── Mock notes ─── */
interface AppNote {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  isInternal: boolean;
}

const MOCK_NOTES: Record<string, AppNote[]> = {
  "app-001": [
    { id: "note-1", author: "Staff Admin", text: "Birth certificate and immunization records verified against state database.", createdAt: "2026-02-28T14:30:00", isInternal: true },
    { id: "note-2", author: "Staff Admin", text: "Proof of residency document is a utility bill — need to confirm address matches application.", createdAt: "2026-02-28T15:00:00", isInternal: true },
  ],
  "app-003": [
    { id: "note-3", author: "Staff Admin", text: "Immunization records are missing. Sent request to family via email.", createdAt: "2026-03-02T10:00:00", isInternal: true },
    { id: "note-4", author: "Staff Admin", text: "Family confirmed 504 plan is from previous school. Awaiting documentation.", createdAt: "2026-03-02T11:30:00", isInternal: true },
  ],
};

/* ─── Mock status history ─── */
interface StatusHistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string;
  changedAt: string;
  note: string | null;
}

const MOCK_HISTORY: Record<string, StatusHistoryEntry[]> = {
  "app-001": [
    { id: "hist-1", fromStatus: null, toStatus: "draft", changedBy: "Tanya Johnson", changedAt: "2026-02-26T09:00:00", note: "Application created" },
    { id: "hist-2", fromStatus: "draft", toStatus: "submitted", changedBy: "Tanya Johnson", changedAt: "2026-02-28T12:00:00", note: "Application submitted with all required documents" },
  ],
  "app-002": [
    { id: "hist-3", fromStatus: null, toStatus: "draft", changedBy: "Elena Ramirez", changedAt: "2026-02-24T10:00:00", note: "Application created" },
    { id: "hist-4", fromStatus: "draft", toStatus: "submitted", changedBy: "Elena Ramirez", changedAt: "2026-02-25T14:00:00", note: null },
    { id: "hist-5", fromStatus: "submitted", toStatus: "verified", changedBy: "Staff Admin", changedAt: "2026-03-01T09:30:00", note: "All documents verified. Ready for lottery." },
  ],
  "app-003": [
    { id: "hist-6", fromStatus: null, toStatus: "draft", changedBy: "Derrick Williams", changedAt: "2026-02-18T11:00:00", note: "Application created" },
    { id: "hist-7", fromStatus: "draft", toStatus: "submitted", changedBy: "Derrick Williams", changedAt: "2026-02-20T16:00:00", note: null },
    { id: "hist-8", fromStatus: "submitted", toStatus: "needs_info", changedBy: "Staff Admin", changedAt: "2026-03-02T10:15:00", note: "Missing immunization records and 504 plan documentation" },
  ],
};

/* ─── Document status badge ─── */
const docStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" }> = {
  pending: { label: "Pending", variant: "warning" },
  verified: { label: "Verified", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
};

/* ─── Helpers ─── */
function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/* ─── Detail row helper ─── */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

/* ─── Status actions based on current status ─── */
function getAvailableActions(status: string): { label: string; variant: "default" | "outline" | "destructive"; targetStatus: string }[] {
  switch (status) {
    case "submitted":
      return [
        { label: "Mark as Verified", variant: "default", targetStatus: "verified" },
        { label: "Request More Info", variant: "outline", targetStatus: "needs_info" },
      ];
    case "needs_info":
      return [
        { label: "Mark as Verified", variant: "default", targetStatus: "verified" },
      ];
    case "verified":
      return [
        { label: "Assign to Lottery", variant: "default", targetStatus: "lottery_assigned" },
      ];
    case "lottery_assigned":
      return [
        { label: "Make Offer", variant: "default", targetStatus: "offered" },
        { label: "Add to Waitlist", variant: "outline", targetStatus: "waitlisted" },
      ];
    case "offered":
      return [
        { label: "Record Acceptance", variant: "default", targetStatus: "accepted" },
        { label: "Record Decline", variant: "outline", targetStatus: "declined" },
      ];
    case "accepted":
      return [
        { label: "Mark as Registered", variant: "default", targetStatus: "registered" },
      ];
    case "waitlisted":
      return [
        { label: "Make Offer", variant: "default", targetStatus: "offered" },
      ];
    default:
      return [];
  }
}

/* ─── Page Component ─── */
export default function StaffApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [noteText, setNoteText] = useState("");

  // Look up application by ID — first try detail map, fallback to list
  const detail = DETAIL_MAP[id];
  const listApp = MOCK_APPLICATIONS.find((a) => a.id === id);
  const documents = MOCK_DOCUMENTS[id] ?? [];
  const notes = MOCK_NOTES[id] ?? [];
  const history = MOCK_HISTORY[id] ?? [];

  if (!detail && !listApp) {
    return (
      <div className="space-y-6">
        <Link href="/staff/applications" className="text-sm text-rooted-green hover:underline">
          ← Back to Applications
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">Application not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Merge data sources
  const app = detail ?? {
    id: listApp!.id,
    studentName: listApp!.studentName,
    studentDob: "—",
    studentGender: "—",
    studentRace: "—",
    studentLanguage: "—",
    previousSchool: "—",
    iep504: "None",
    guardianName: listApp!.guardianName,
    guardianRelationship: "—",
    guardianEmail: "—",
    guardianPhone: "—",
    address: "—",
    emergencyContact: "—",
    emergencyPhone: "—",
    emergencyRelationship: "—",
    grade: listApp!.grade,
    campus: listApp!.campus,
    status: listApp!.status,
    submittedAt: listApp!.submittedAt,
    updatedAt: listApp!.updatedAt,
    schoolYear: "2026-27",
  };

  const statusCfg = getStatusConfig(app.status);
  const actions = getAvailableActions(app.status);
  const verifiedDocs = documents.filter((d) => d.status === "verified").length;
  const totalDocs = documents.length;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/staff/applications" className="text-sm text-rooted-green hover:underline">
        ← Back to Applications
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{app.studentName}</h1>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {getGradeLabel(app.grade)} &middot; {app.campus} &middot; {app.schoolYear} &middot; ID: {app.id}
          </p>
        </div>
        <div className="flex gap-2">
          {actions.map((action) => (
            <Button
              key={action.targetStatus}
              variant={action.variant === "default" ? "default" : "outline"}
              size="sm"
            >
              {action.label}
            </Button>
          ))}
          <Button variant="outline" size="sm">
            Withdraw
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Submitted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatDate(app.submittedAt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Last Updated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{formatDate(app.updatedAt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {verifiedDocs}/{totalDocs} verified
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{notes.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">
            Documents
            {documents.some((d) => d.status === "pending") && (
              <span className="ml-1.5 w-2 h-2 rounded-full bg-amber-400 inline-block" />
            )}
          </TabsTrigger>
          <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Student Information</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailRow label="Full Name" value={app.studentName} />
                <DetailRow label="Date of Birth" value={formatDate(app.studentDob)} />
                <DetailRow label="Gender" value={app.studentGender} />
                <DetailRow label="Race / Ethnicity" value={app.studentRace} />
                <DetailRow label="Home Language" value={app.studentLanguage} />
                <DetailRow label="Previous School" value={app.previousSchool} />
                <DetailRow label="IEP / 504" value={app.iep504} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Parent / Guardian</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailRow label="Name" value={app.guardianName} />
                <DetailRow label="Relationship" value={app.guardianRelationship} />
                <DetailRow label="Email" value={app.guardianEmail} />
                <DetailRow label="Phone" value={app.guardianPhone} />
                <DetailRow label="Address" value={app.address} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Emergency Contact</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailRow label="Name" value={app.emergencyContact} />
                <DetailRow label="Phone" value={app.emergencyPhone} />
                <DetailRow label="Relationship" value={app.emergencyRelationship} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Enrollment Details</CardTitle>
              </CardHeader>
              <CardContent>
                <DetailRow label="Campus" value={app.campus} />
                <DetailRow label="Grade" value={getGradeLabel(app.grade)} />
                <DetailRow label="School Year" value={app.schoolYear} />
                <DetailRow label="Application ID" value={app.id} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Documents Tab ── */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Uploaded Documents</CardTitle>
                  <CardDescription>
                    {verifiedDocs} of {totalDocs} documents verified
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm">Request Documents</Button>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {documents.length === 0 ? (
                <p className="text-center text-gray-500 py-8 text-sm">
                  No documents uploaded yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Verified By</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => {
                      const dcfg = docStatusConfig[doc.status] ?? docStatusConfig.pending;
                      return (
                        <TableRow key={doc.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <span aria-hidden="true">📄</span>
                              {doc.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-gray-500 capitalize">
                            {doc.type.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell className="text-gray-500">{doc.fileSize}</TableCell>
                          <TableCell>
                            <Badge variant={dcfg.variant}>{dcfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {doc.verifiedBy ?? "—"}
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {formatDate(doc.uploadedAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm">View</Button>
                              {doc.status === "pending" && (
                                <Button size="sm">Verify</Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notes Tab ── */}
        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Internal Notes</CardTitle>
              <CardDescription>
                Notes are only visible to staff members.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add note form */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add an internal note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green focus:border-transparent"
                />
                <Button disabled={!noteText.trim()}>Add Note</Button>
              </div>

              {/* Notes list */}
              {notes.length === 0 ? (
                <p className="text-center text-gray-500 py-6 text-sm">
                  No notes yet. Add one above.
                </p>
              ) : (
                <div className="space-y-3">
                  {[...notes].reverse().map((note) => (
                    <div
                      key={note.id}
                      className="border border-gray-100 rounded-md p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {note.author}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatDateTime(note.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{note.text}</p>
                      {note.isInternal && (
                        <span className="inline-block mt-1.5 text-[10px] text-gray-400 uppercase tracking-wide">
                          Internal
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── History Tab ── */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status History</CardTitle>
              <CardDescription>
                Complete timeline of status changes for this application.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-center text-gray-500 py-6 text-sm">
                  No history recorded yet.
                </p>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />

                  <div className="space-y-6">
                    {[...history].reverse().map((entry, idx) => {
                      const toCfg = getStatusConfig(entry.toStatus);
                      return (
                        <div key={entry.id} className="relative flex gap-4 pl-1">
                          {/* Timeline dot */}
                          <div
                            className={`relative z-10 w-7 h-7 rounded-full border-2 border-white shadow-sm flex items-center justify-center text-xs shrink-0 ${
                              idx === 0 ? "bg-rooted-green text-white" : "bg-gray-200 text-gray-600"
                            }`}
                          >
                            {idx === 0 ? "●" : (history.length - idx)}
                          </div>
                          <div className="flex-1 pb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {entry.fromStatus && (
                                <>
                                  <Badge variant="secondary" className="text-xs">
                                    {getStatusConfig(entry.fromStatus).label}
                                  </Badge>
                                  <span className="text-gray-400 text-xs">→</span>
                                </>
                              )}
                              <Badge variant={toCfg.variant} className="text-xs">
                                {toCfg.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">
                              by <span className="font-medium">{entry.changedBy}</span>
                            </p>
                            {entry.note && (
                              <p className="text-sm text-gray-500 mt-0.5 italic">
                                &ldquo;{entry.note}&rdquo;
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {formatDateTime(entry.changedAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
