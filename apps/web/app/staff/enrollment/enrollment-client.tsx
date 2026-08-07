"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { IconGraduationCap } from "@/components/ui/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { staffWithdrawEnrollment, staffSyncSIS, staffActivateEnrollment } from "./actions";

interface EnrollmentRow {
  id: string;
  application_id: string | null;
  status: string;
  student_name: string;
  grade: string;
  campus_name: string;
  enrolled_at: string | null;
  sis_id: string | null;
  packet_status: string | null;
}

const packetStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "warning" | "success" }> = {
  pending: { label: "Not Started", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "warning" },
  submitted: { label: "Submitted", variant: "default" },
  complete: { label: "Complete", variant: "success" },
};

interface EnrollmentStats {
  total: number;
  active: number;
  sis_synced: number;
  withdrawn: number;
}

const enrollmentStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "warning" },
  active: { label: "Active", variant: "success" },
  withdrawn: { label: "Withdrawn", variant: "destructive" },
  transferred: { label: "Transferred", variant: "outline" },
};

export function EnrollmentClient({
  enrollments,
  stats,
}: {
  enrollments: EnrollmentRow[];
  stats: EnrollmentStats;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sisInput, setSisInput] = useState<Record<string, string>>({});
  const [withdrawTarget, setWithdrawTarget] = useState<EnrollmentRow | null>(null);
  const [activateTarget, setActivateTarget] = useState<EnrollmentRow | null>(null);

  // Auto-clear error messages after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  async function handleSyncSIS(enrollmentId: string) {
    const sisId = sisInput[enrollmentId]?.trim();
    if (!sisId) return;
    setLoading(enrollmentId);
    setError(null);
    const result = await staffSyncSIS(enrollmentId, sisId);
    if (result.error) setError(result.error);
    else router.refresh();
    setLoading(null);
  }

  async function doWithdraw() {
    if (!withdrawTarget) return;
    const enrollmentId = withdrawTarget.id;
    setWithdrawTarget(null);
    setLoading(enrollmentId);
    setError(null);
    const result = await staffWithdrawEnrollment(enrollmentId, "Withdrawn by staff.");
    if (result.error) setError(result.error);
    else router.refresh();
    setLoading(null);
  }

  async function doActivate() {
    if (!activateTarget) return;
    const { id: enrollmentId, application_id: applicationId } = activateTarget;
    setActivateTarget(null);
    setLoading(enrollmentId);
    setError(null);
    const result = await staffActivateEnrollment(enrollmentId, applicationId);
    if (result.error) setError(result.error);
    else router.refresh();
    setLoading(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Registration</h1>
          <p className="text-sm text-stone mt-1">
            Students who have accepted an offer and are completing or have completed registration.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-rooted-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Total Enrolled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">{stats.total}</p>
            <p className="text-xs text-stone mt-1">all time</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
            <p className="text-xs text-stone mt-1">currently enrolled</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              SIS Synced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{stats.sis_synced}</p>
            <p className="text-xs text-stone mt-1">
              {stats.active > 0
                ? `${Math.round((stats.sis_synced / stats.active) * 100)}% of active`
                : "synced to SIS"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-stone">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Withdrawn
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats.withdrawn === 0 ? "text-stone/50" : "text-red-600"}`}>
              {stats.withdrawn}
            </p>
            <p className="text-xs text-stone mt-1">
              {stats.withdrawn === 0 ? "none" : "students withdrawn"}
            </p>
          </CardContent>
        </Card>
      </div>

      {enrollments.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<IconGraduationCap size={40} />}
              title="No enrollments yet"
              description="Enrolled students will appear here after they accept an offer and complete registration."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead>SIS ID</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead className="w-48">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrollments.map((enrollment) => {
                  const cfg =
                    enrollmentStatusConfig[enrollment.status] ??
                    enrollmentStatusConfig.pending;
                  const isActive = enrollment.status === "active";
                  const isLoading = loading === enrollment.id;
                  return (
                    <TableRow key={enrollment.id}>
                      <TableCell className="font-medium">
                        {enrollment.student_name}
                      </TableCell>
                      <TableCell>{enrollment.grade}</TableCell>
                      <TableCell>{enrollment.campus_name}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell>
                        {enrollment.packet_status ? (
                          <div className="flex items-center gap-1.5">
                            <Badge variant={(packetStatusConfig[enrollment.packet_status] ?? packetStatusConfig.pending).variant}>
                              {(packetStatusConfig[enrollment.packet_status] ?? packetStatusConfig.pending).label}
                            </Badge>
                            {enrollment.packet_status === "submitted" && (
                              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" title="Awaiting review" />
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-stone">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {enrollment.sis_id ? (
                          <code className="text-xs bg-rooted-gray px-1.5 py-0.5 rounded">
                            {enrollment.sis_id}
                          </code>
                        ) : isActive ? (
                          <div className="flex gap-1 items-center">
                            <Input
                              className="h-7 w-28 text-xs"
                              placeholder="SIS ID"
                              value={sisInput[enrollment.id] ?? ""}
                              onChange={(e) =>
                                setSisInput((prev) => ({
                                  ...prev,
                                  [enrollment.id]: e.target.value,
                                }))
                              }
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={isLoading || !sisInput[enrollment.id]?.trim()}
                              onClick={() => handleSyncSIS(enrollment.id)}
                            >
                              Sync
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-stone">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-stone">
                        {enrollment.enrolled_at ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {enrollment.application_id && enrollment.packet_status && (
                            <Link
                              href={`/staff/applications/${enrollment.application_id}?tab=registration`}
                              className="no-underline"
                            >
                              <Button variant="outline" size="sm">
                                Review
                              </Button>
                            </Link>
                          )}
                          {enrollment.status === "pending" && enrollment.packet_status === "complete" && (
                            <Button
                              size="sm"
                              className="bg-rooted-green text-white hover:bg-rooted-green/90"
                              disabled={isLoading}
                              onClick={() => setActivateTarget(enrollment)}
                            >
                              Activate
                            </Button>
                          )}
                          {isActive && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isLoading}
                              onClick={() => setWithdrawTarget(enrollment)}
                            >
                              Withdraw
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ─── Withdraw Enrollment Confirmation ─── */}
      <Dialog open={!!withdrawTarget} onOpenChange={(open) => !open && setWithdrawTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Withdraw Enrollment</DialogTitle>
            <DialogDescription>
              This removes {withdrawTarget?.student_name ?? "this student"} from active enrollment. The family will not be
              notified automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doWithdraw}>
              Withdraw Enrollment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Activate Enrollment Confirmation ─── */}
      <Dialog open={!!activateTarget} onOpenChange={(open) => !open && setActivateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activate Enrollment</DialogTitle>
            <DialogDescription>
              This will also notify the family that {activateTarget?.student_name ?? "this student"}&apos;s enrollment is
              active.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActivateTarget(null)}>
              Cancel
            </Button>
            <Button onClick={doActivate} className="bg-rooted-green hover:bg-rooted-green/90 text-white">
              Activate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
