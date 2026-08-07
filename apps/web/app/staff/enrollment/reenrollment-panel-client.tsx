"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconHeartPulse, IconMail, IconPenLine, IconClock } from "@/components/ui/icons";
import { staffSendReenrollmentPulse, staffMarkReenrollmentContacted } from "./re-enrollment-actions";
import { REENROLLMENT_PULSE_THROTTLE_DAYS } from "@/lib/queries/reenrollment";

export interface ReenrollmentStatsProps {
  schoolYearName: string | null;
  nextSchoolYearName: string | null;
  eligible: number;
  respondedYes: number;
  respondedDeciding: number;
  respondedNo: number;
  noResponse: number;
}

export interface ReenrollmentFollowUpRowProps {
  enrollmentId: string;
  campusId: string;
  studentName: string;
  campusName: string;
  grade: string;
  guardianName: string | null;
  guardianPhone: string | null;
  lastPulsedAt: string | null;
  canPulse: boolean;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatTile({
  label,
  value,
  denominator,
  accent,
}: {
  label: string;
  value: number;
  denominator?: number;
  accent: string;
}) {
  const pct =
    denominator && denominator > 0 ? `${Math.round((value / denominator) * 100)}% of ${denominator}` : null;
  return (
    <Card className={`border-t-4 ${accent}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold text-ink">{value}</p>
        <p className="text-xs text-stone mt-1">{pct ?? "—"}</p>
      </CardContent>
    </Card>
  );
}

export function ReenrollmentPanel({
  stats,
  followUpQueue,
}: {
  stats: ReenrollmentStatsProps;
  followUpQueue: ReenrollmentFollowUpRowProps[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!error && !notice) return;
    const timer = setTimeout(() => {
      setError(null);
      setNotice(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [error, notice]);

  async function handleSendPulse(row: ReenrollmentFollowUpRowProps) {
    setLoading(row.enrollmentId);
    setError(null);
    setNotice(null);
    const result = await staffSendReenrollmentPulse(row.enrollmentId);
    setLoading(null);
    if (result.error) {
      setError(result.error);
    } else {
      setNotice(`Pulse sent to ${row.guardianName ?? "the family"}.`);
      router.refresh();
    }
  }

  async function handleMarkContacted(row: ReenrollmentFollowUpRowProps) {
    setLoading(`contact-${row.enrollmentId}`);
    setError(null);
    setNotice(null);
    const result = await staffMarkReenrollmentContacted(
      row.enrollmentId,
      row.campusId,
      `Contacted ${row.guardianName ?? "guardian"} about re-enrollment (${row.studentName}).`
    );
    setLoading(null);
    if (result.error) {
      setError(result.error);
    } else {
      setNotice(`Marked ${row.studentName} as contacted.`);
      router.refresh();
    }
  }

  if (!stats.schoolYearName) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Re-enrollment</CardTitle>
          <CardDescription>Spring intent-to-return campaign for continuing students.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<IconHeartPulse size={40} />}
            title="No current school year configured"
            description="Set a current school year in Settings before running the re-enrollment pulse."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-ink">Re-enrollment</h2>
        <p className="text-sm text-stone mt-1">
          {stats.schoolYearName}
          {stats.nextSchoolYearName ? ` → ${stats.nextSchoolYearName}` : ""} &middot; intent-to-return
          pulse for continuing students.
        </p>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-md bg-rooted-green/10 p-3 text-sm text-rooted-green">{notice}</div>}

      {stats.eligible === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<IconHeartPulse size={40} />}
              title="No continuing students yet"
              description="Active enrollments for the current school year will appear here as eligible for the re-enrollment pulse."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatTile label="Eligible" value={stats.eligible} accent="border-t-stone" />
            <StatTile
              label="Yes, returning"
              value={stats.respondedYes}
              denominator={stats.eligible}
              accent="border-t-rooted-green"
            />
            <StatTile
              label="Still deciding"
              value={stats.respondedDeciding}
              denominator={stats.eligible}
              accent="border-t-warn"
            />
            <StatTile
              label="Not returning"
              value={stats.respondedNo}
              denominator={stats.eligible}
              accent="border-t-stone"
            />
            <StatTile
              label="No response"
              value={stats.noResponse}
              denominator={stats.eligible}
              accent="border-t-stone"
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Follow-up queue</CardTitle>
              <CardDescription>
                Continuing students with no response yet. Send a pulse or log a phone contact.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 px-0">
              {followUpQueue.length === 0 ? (
                <p className="text-sm text-stone text-center py-6">
                  Everyone in scope has responded — nothing to follow up on.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Guardian</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Last pulsed</TableHead>
                      <TableHead className="w-56">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {followUpQueue.map((row) => {
                      const isLoading = loading === row.enrollmentId;
                      const isContacting = loading === `contact-${row.enrollmentId}`;
                      const lastPulsed = formatDate(row.lastPulsedAt);
                      return (
                        <TableRow key={row.enrollmentId}>
                          <TableCell className="font-medium">
                            {row.studentName}
                            <div className="text-xs text-stone">
                              {row.campusName} &middot; Grade {row.grade}
                            </div>
                          </TableCell>
                          <TableCell>{row.guardianName ?? "—"}</TableCell>
                          <TableCell>{row.guardianPhone ?? "—"}</TableCell>
                          <TableCell className="text-stone">
                            {lastPulsed ? (
                              <span className="inline-flex items-center gap-1">
                                <IconClock size={14} />
                                {lastPulsed}
                              </span>
                            ) : (
                              "Never"
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isLoading || isContacting || !row.canPulse}
                                onClick={() => handleSendPulse(row)}
                                title={
                                  !row.canPulse
                                    ? `Already pulsed within the last ${REENROLLMENT_PULSE_THROTTLE_DAYS} days`
                                    : undefined
                                }
                              >
                                <IconMail size={14} className="mr-1" />
                                {isLoading ? "Sending..." : row.canPulse ? "Send pulse" : "Recently pulsed"}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isLoading || isContacting}
                                onClick={() => handleMarkContacted(row)}
                              >
                                <IconPenLine size={14} className="mr-1" />
                                {isContacting ? "Saving..." : "Mark contacted"}
                              </Button>
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
        </>
      )}
    </div>
  );
}
