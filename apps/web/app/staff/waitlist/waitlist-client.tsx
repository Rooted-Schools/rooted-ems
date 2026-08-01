"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconClipboardList } from "@/components/ui/icons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { staffPromoteFromWaitlist, staffRemoveFromWaitlist } from "./actions";

interface WaitlistEntry {
  id: string;
  position: number;
  student_name: string;
  grade: string;
  campus_name: string;
  added_at: string;
}

interface CampusCount {
  campus_name: string;
  count: number;
}

export function WaitlistClient({
  entries,
  campusCounts,
  staffUserId,
}: {
  entries: WaitlistEntry[];
  campusCounts: CampusCount[];
  staffUserId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-clear success/error messages after 5 seconds
  useEffect(() => {
    if (!success && !error) return;
    const timer = setTimeout(() => { setSuccess(null); setError(null); }, 5000);
    return () => clearTimeout(timer);
  }, [success, error]);

  async function handlePromote(positionId: string) {
    setLoading(positionId);
    setError(null);
    setSuccess(null);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = await staffPromoteFromWaitlist(positionId, staffUserId, expiresAt);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("Student promoted from waitlist — offer sent.");
      router.refresh();
    }
    setLoading(null);
  }

  async function handleRemove(positionId: string) {
    if (!confirm("Are you sure you want to remove this student from the waitlist?")) return;
    setLoading(positionId);
    setError(null);
    setSuccess(null);
    const result = await staffRemoveFromWaitlist(positionId, "Removed by staff.");
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("Student removed from waitlist.");
      router.refresh();
    }
    setLoading(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Waitlist</h1>
          <p className="text-sm text-stone mt-1">
            Students waiting for available seats, ordered by lottery rank.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">{success}</div>
      )}

      {campusCounts.length > 0 && (() => {
        const total = campusCounts.reduce((sum, c) => sum + c.count, 0);
        const borderColors = ["border-t-rooted-green", "border-t-blue-500", "border-t-amber-500"];
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <p className="text-sm text-stone">
                <span className="font-semibold text-ink">{total}</span> student{total !== 1 ? "s" : ""} waitlisted across all campuses
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {campusCounts.map((cc, idx) => (
                <Card key={cc.campus_name} className={`border-t-4 ${borderColors[idx % borderColors.length]}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
                      {cc.campus_name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-2xl font-bold ${cc.count === 0 ? "text-stone/50" : ""}`}>
                      {cc.count}
                    </p>
                    <p className="text-xs text-stone">
                      {cc.count === 0 ? "no students waiting" : `student${cc.count !== 1 ? "s" : ""} waiting`}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })()}

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={<IconClipboardList size={40} />}
              title="No students on waitlist"
              description="Students will be added to the waitlist after a lottery when there are more applicants than seats."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Waitlisted Students</CardTitle>
            <CardDescription>
              When a seat opens, promote the next student from the waitlist.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Position</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="w-40">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const isLoading = loading === entry.id;
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge variant="outline">#{entry.position}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {entry.student_name}
                      </TableCell>
                      <TableCell>{entry.grade}</TableCell>
                      <TableCell>{entry.campus_name}</TableCell>
                      <TableCell className="text-stone">
                        {entry.added_at}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="default"
                            size="sm"
                            disabled={isLoading}
                            onClick={() => handlePromote(entry.id)}
                          >
                            {isLoading ? "..." : "Promote"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isLoading}
                            onClick={() => handleRemove(entry.id)}
                          >
                            Remove
                          </Button>
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
    </div>
  );
}
