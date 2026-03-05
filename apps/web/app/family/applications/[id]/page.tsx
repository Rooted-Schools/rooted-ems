"use client";

import { use } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getStatusConfig, getGradeLabel } from "@/lib/application-helpers";

/* ─── Mock detail for the family's application ─── */
interface FamilyAppDetail {
  id: string;
  studentName: string;
  studentDob: string;
  studentGender: string;
  guardianName: string;
  guardianRelationship: string;
  guardianEmail: string;
  guardianPhone: string;
  address: string;
  grade: string;
  campus: string;
  status: string;
  submittedAt: string | null;
  updatedAt: string;
  schoolYear: string;
  nextStep: string | null;
}

const FAMILY_APP_DETAILS: Record<string, FamilyAppDetail> = {
  "app-001": {
    id: "app-001",
    studentName: "Marcus Johnson",
    studentDob: "2012-05-14",
    studentGender: "Male",
    guardianName: "Tanya Johnson",
    guardianRelationship: "Mother",
    guardianEmail: "tanya.johnson@email.com",
    guardianPhone: "(360) 555-0142",
    address: "1234 Elm Street, Vancouver, WA 98660",
    grade: "9",
    campus: "Vancouver WA",
    status: "submitted",
    submittedAt: "2026-02-28",
    updatedAt: "2026-02-28",
    schoolYear: "2026-27",
    nextStep: "Your application is under review. We will notify you if we need any additional information.",
  },
  "app-004": {
    id: "app-004",
    studentName: "Ava Johnson",
    studentDob: "2014-08-22",
    studentGender: "Female",
    guardianName: "Tanya Johnson",
    guardianRelationship: "Mother",
    guardianEmail: "tanya.johnson@email.com",
    guardianPhone: "(360) 555-0142",
    address: "1234 Elm Street, Vancouver, WA 98660",
    grade: "7",
    campus: "Vancouver WA",
    status: "draft",
    submittedAt: null,
    updatedAt: "2026-03-03",
    schoolYear: "2026-27",
    nextStep: "Complete and submit your application before the enrollment window closes.",
  },
};

/* ─── Mock documents for family view ─── */
interface FamilyDocument {
  id: string;
  name: string;
  status: "pending" | "verified" | "rejected";
  uploadedAt: string;
  fileSize: string;
}

const FAMILY_DOCUMENTS: Record<string, FamilyDocument[]> = {
  "app-001": [
    { id: "doc-1", name: "Birth Certificate", status: "verified", uploadedAt: "2026-02-28", fileSize: "1.2 MB" },
    { id: "doc-2", name: "Immunization Record", status: "verified", uploadedAt: "2026-02-28", fileSize: "845 KB" },
    { id: "doc-3", name: "Proof of Residency", status: "pending", uploadedAt: "2026-02-28", fileSize: "2.1 MB" },
    { id: "doc-4", name: "Previous School Records", status: "pending", uploadedAt: "2026-02-28", fileSize: "3.4 MB" },
  ],
  "app-004": [],
};

/* ─── Mock timeline for family view ─── */
interface FamilyTimelineEntry {
  id: string;
  event: string;
  date: string;
  detail: string | null;
}

const FAMILY_TIMELINE: Record<string, FamilyTimelineEntry[]> = {
  "app-001": [
    { id: "t-1", event: "Application Created", date: "2026-02-26", detail: null },
    { id: "t-2", event: "Application Submitted", date: "2026-02-28", detail: "All required documents were uploaded." },
    { id: "t-3", event: "Under Review", date: "2026-02-28", detail: "Your application is being reviewed by enrollment staff." },
  ],
  "app-004": [
    { id: "t-4", event: "Application Created", date: "2026-03-03", detail: null },
  ],
};

/* ─── Status guide — what happens at each stage ─── */
function getStatusExplanation(status: string): { title: string; explanation: string; icon: string } {
  switch (status) {
    case "draft":
      return { title: "Draft", explanation: "Your application has been started but not yet submitted. Complete all required fields and documents, then submit before the enrollment window closes.", icon: "📝" };
    case "submitted":
      return { title: "Under Review", explanation: "Your application has been received and is being reviewed by our enrollment team. We may contact you if we need any additional information.", icon: "📬" };
    case "needs_info":
      return { title: "Information Needed", explanation: "We need additional information or documents to continue processing your application. Please check your email or upload the requested items.", icon: "⚠️" };
    case "verified":
      return { title: "Verified", explanation: "All information and documents have been verified. Your application will be included in the upcoming enrollment lottery.", icon: "✅" };
    case "lottery_assigned":
      return { title: "In Lottery", explanation: "Your application has been entered into the enrollment lottery. Results will be shared once the lottery is run.", icon: "🎲" };
    case "offered":
      return { title: "Seat Offered", explanation: "Congratulations! A seat has been offered to your student. Please respond before the deadline to accept or decline.", icon: "🎉" };
    case "accepted":
      return { title: "Offer Accepted", explanation: "You have accepted the enrollment offer. Complete the registration process to finalize your student's enrollment.", icon: "✅" };
    case "waitlisted":
      return { title: "Waitlisted", explanation: "Your student is on the waitlist. We will notify you if a seat becomes available.", icon: "📋" };
    case "registered":
      return { title: "Registered", explanation: "Your student is fully enrolled and registered. Welcome to the Rooted School family!", icon: "🎓" };
    default:
      return { title: status, explanation: "", icon: "📄" };
  }
}

const docStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" }> = {
  pending: { label: "Pending Review", variant: "warning" },
  verified: { label: "Verified", variant: "success" },
  rejected: { label: "Needs Re-upload", variant: "destructive" },
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  );
}

export default function FamilyApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const app = FAMILY_APP_DETAILS[id];
  const documents = FAMILY_DOCUMENTS[id] ?? [];
  const timeline = FAMILY_TIMELINE[id] ?? [];

  if (!app) {
    return (
      <div className="space-y-6">
        <Link href="/family/applications" className="text-sm text-rooted-green hover:underline">
          ← Back to My Applications
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">Application not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusCfg = getStatusConfig(app.status);
  const statusExplanation = getStatusExplanation(app.status);
  const isDraft = app.status === "draft";
  const isOffered = app.status === "offered";
  const needsAction = isDraft || app.status === "needs_info" || isOffered;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/family/applications" className="text-sm text-rooted-green hover:underline">
        ← Back to My Applications
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{app.studentName}</h1>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {getGradeLabel(app.grade)} &middot; {app.campus} &middot; {app.schoolYear}
          </p>
        </div>
        {isDraft && (
          <Link href={`/family/applications/${app.id}/edit`}>
            <Button>Continue Application</Button>
          </Link>
        )}
        {isOffered && (
          <div className="flex gap-2">
            <Button>Accept Offer</Button>
            <Button variant="outline">Decline</Button>
          </div>
        )}
      </div>

      {/* Status explanation card */}
      <Card className={needsAction ? "border-amber-200 bg-amber-50/30" : "border-rooted-green/20 bg-rooted-green/5"}>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden="true">{statusExplanation.icon}</span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{statusExplanation.title}</p>
              <p className="text-sm text-gray-600 mt-0.5">{statusExplanation.explanation}</p>
              {app.nextStep && needsAction && (
                <div className="mt-2 bg-white border border-amber-200 rounded-md p-2.5">
                  <p className="text-xs font-medium text-amber-800 mb-0.5">What to do next</p>
                  <p className="text-sm text-gray-700">{app.nextStep}</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Application details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Student Information</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Full Name" value={app.studentName} />
            <DetailRow label="Date of Birth" value={formatDate(app.studentDob)} />
            <DetailRow label="Gender" value={app.studentGender} />
            <DetailRow label="Campus" value={app.campus} />
            <DetailRow label="Grade" value={getGradeLabel(app.grade)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Guardian" value={app.guardianName} />
            <DetailRow label="Relationship" value={app.guardianRelationship} />
            <DetailRow label="Email" value={app.guardianEmail} />
            <DetailRow label="Phone" value={app.guardianPhone} />
            <DetailRow label="Address" value={app.address} />
          </CardContent>
        </Card>
      </div>

      {/* Documents */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Documents</CardTitle>
              <CardDescription>
                Documents uploaded with this application.
              </CardDescription>
            </div>
            {(isDraft || app.status === "needs_info") && (
              <Button variant="outline" size="sm">Upload Document</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-gray-500">No documents uploaded yet.</p>
              {isDraft && (
                <p className="text-xs text-gray-400 mt-1">
                  Documents will be required before submitting your application.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const dcfg = docStatusConfig[doc.status] ?? docStatusConfig.pending;
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-md border border-gray-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg" aria-hidden="true">📄</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {doc.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {doc.fileSize} &middot; Uploaded {formatDate(doc.uploadedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={dcfg.variant}>{dcfg.label}</Badge>
                      <Button variant="outline" size="sm">View</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Application Timeline</CardTitle>
          <CardDescription>
            Track the progress of this application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-center text-gray-500 py-6 text-sm">
              No activity recorded yet.
            </p>
          ) : (
            <div className="relative">
              <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
              <div className="space-y-5">
                {[...timeline].reverse().map((entry, idx) => (
                  <div key={entry.id} className="relative flex gap-4 pl-0">
                    <div
                      className={`relative z-10 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center shrink-0 ${
                        idx === 0 ? "bg-rooted-green" : "bg-gray-200"
                      }`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          idx === 0 ? "bg-white" : "bg-gray-400"
                        }`}
                      />
                    </div>
                    <div className="flex-1 -mt-0.5">
                      <p className="text-sm font-medium text-gray-900">
                        {entry.event}
                      </p>
                      {entry.detail && (
                        <p className="text-sm text-gray-500 mt-0.5">
                          {entry.detail}
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(entry.date)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dates footer */}
      <div className="flex gap-6 text-xs text-gray-400 pb-4">
        {app.submittedAt && <span>Submitted: {formatDate(app.submittedAt)}</span>}
        <span>Last Updated: {formatDate(app.updatedAt)}</span>
        <span>Application ID: {app.id}</span>
      </div>
    </div>
  );
}
