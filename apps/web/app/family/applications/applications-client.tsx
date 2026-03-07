"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { getStatusConfig, getGradeLabel } from "@/lib/application-helpers";
import type { ApplicationRow } from "@/lib/queries";

function getStatusMessage(status: string): string {
  switch (status) {
    case "draft":
      return "Application started but not yet submitted.";
    case "submitted":
      return "Application received and under review.";
    case "needs_info":
      return "Additional information or documents are required.";
    case "verified":
      return "All information verified. Awaiting lottery.";
    case "lottery_assigned":
      return "Entered into the enrollment lottery.";
    case "offered":
      return "Congratulations! A seat has been offered.";
    case "accepted":
      return "Offer accepted. Complete registration to finalize enrollment.";
    case "waitlisted":
      return "On the waitlist. You will be notified if a seat becomes available.";
    case "registered":
      return "Fully registered and enrolled.";
    case "declined":
      return "This application has been declined.";
    case "expired":
      return "The offer for this application has expired.";
    case "withdrawn":
      return "This application has been withdrawn.";
    default:
      return "";
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface FamilyApplicationsClientProps {
  applications: ApplicationRow[];
}

export function FamilyApplicationsClient({ applications }: FamilyApplicationsClientProps) {
  const hasApplications = applications.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Applications</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track the status of your children&apos;s enrollment applications.
          </p>
        </div>
        <Link href="/family/applications/new">
          <Button>Start New Application</Button>
        </Link>
      </div>

      {!hasApplications ? (
        <EmptyState
          icon="📝"
          title="No applications yet"
          description="Start a new application to enroll your child at a rootedschool campus."
        >
          <Link href="/family/applications/new">
            <Button>Start New Application</Button>
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const cfg = getStatusConfig(app.status);
            const statusMessage = getStatusMessage(app.status);
            const isDraft = app.status === "draft";
            const needsAction =
              app.status === "needs_info" ||
              app.status === "offered" ||
              app.status === "draft";

            return (
              <Card
                key={app.id}
                className={
                  needsAction
                    ? "border-amber-200 bg-amber-50/30"
                    : undefined
                }
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {app.student_name}
                      </CardTitle>
                      <p className="text-sm text-gray-500">
                        {getGradeLabel(app.grade)} &middot; {app.campus_name}
                      </p>
                    </div>
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {statusMessage && (
                    <p className="text-sm text-gray-600">{statusMessage}</p>
                  )}

                  {needsAction && (
                    <div className="bg-white border border-amber-200 rounded-md p-3">
                      <p className="text-xs font-medium text-amber-800 mb-1">
                        Action needed
                      </p>
                      <p className="text-sm text-gray-700">
                        {isDraft
                          ? "Complete and submit your application before the enrollment window closes."
                          : app.status === "needs_info"
                            ? "Additional information or documents have been requested."
                            : "Please respond to the enrollment offer before the deadline."}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex gap-4 text-xs text-gray-400">
                      {app.submitted_at && (
                        <span>Submitted: {formatDate(app.submitted_at)}</span>
                      )}
                      <span>Updated: {formatDate(app.updated_at)}</span>
                    </div>
                    <div className="flex gap-2">
                      {isDraft ? (
                        <Link href={`/family/applications/${app.id}/edit`}>
                          <Button size="sm">Continue Application</Button>
                        </Link>
                      ) : (
                        <Link href={`/family/applications/${app.id}`}>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
