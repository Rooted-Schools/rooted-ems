"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconClipboardList } from "@/components/ui/icons";
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

  // Promote dialog state — mirrors the pattern in app/staff/offers/offers-client.tsx
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [promotePositionId, setPromotePositionId] = useState<string | null>(null);
  const [promoteExpiresIn, setPromoteExpiresIn] = useState("14");

  // Remove confirmation dialog state
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removePositionId, setRemovePositionId] = useState<string | null>(null);

  // Auto-clear success/error messages after 5 seconds
  useEffect(() => {
    if (!success && !error) return;
    const timer = setTimeout(() => { setSuccess(null); setError(null); }, 5000);
    return () => clearTimeout(timer);
  }, [success, error]);

  function handlePromote(positionId: string) {
    setPromotePositionId(positionId);
    setPromoteExpiresIn("14");
    setPromoteDialogOpen(true);
  }

  async function doPromote() {
    if (!promotePositionId) return;
    setPromoteDialogOpen(false);
    setLoading(promotePositionId);
    setError(null);
    setSuccess(null);
    const expiresAt = new Date(Date.now() + parseInt(promoteExpiresIn, 10) * 24 * 60 * 60 * 1000).toISOString();
    const result = await staffPromoteFromWaitlist(promotePositionId, staffUserId, expiresAt);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("Student promoted from waitlist — offer sent.");
      router.refresh();
    }
    setLoading(null);
    setPromotePositionId(null);
  }

  function handleRemove(positionId: string) {
    setRemovePositionId(positionId);
    setRemoveDialogOpen(true);
  }

  async function doRemove() {
    if (!removePositionId) return;
    setRemoveDialogOpen(false);
    setLoading(removePositionId);
    setError(null);
    setSuccess(null);
    const result = await staffRemoveFromWaitlist(removePositionId, "Removed by staff.");
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess("Student removed from waitlist.");
      router.refresh();
    }
    setLoading(null);
    setRemovePositionId(null);
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

      {/* ─── Promote from Waitlist Dialog ─── */}
      <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Promote from Waitlist</DialogTitle>
            <DialogDescription>
              This will send a seat offer to this student. Choose how long the family has to respond. Other students&apos; waitlist positions are unaffected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {promotePositionId && (() => {
              const entry = entries.find((e) => e.id === promotePositionId);
              if (!entry) return null;
              const expDate = new Date();
              expDate.setDate(expDate.getDate() + parseInt(promoteExpiresIn, 10));
              return (
                <>
                  <div className="rounded-lg bg-rooted-gray-light p-3 text-sm">
                    <p className="font-medium text-ink">{entry.student_name}</p>
                    <p className="text-stone">
                      {entry.campus_name} · Grade {entry.grade} · Waitlist #{entry.position}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-ink/70 mb-1">
                      Response Deadline
                    </label>
                    <select
                      value={promoteExpiresIn}
                      onChange={(e) => setPromoteExpiresIn(e.target.value)}
                      className="w-full px-3 py-2 border border-stone/30 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                    >
                      <option value="7">7 days</option>
                      <option value="10">10 days</option>
                      <option value="14">14 days</option>
                      <option value="21">21 days</option>
                      <option value="30">30 days</option>
                    </select>
                    <p className="text-xs text-stone mt-1">
                      Offer will expire on {expDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doPromote} className="bg-rooted-green hover:bg-rooted-green/90 text-white">
              Send Offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Remove from Waitlist Confirmation ─── */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from Waitlist</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this student from the waitlist? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {removePositionId && (() => {
            const entry = entries.find((e) => e.id === removePositionId);
            if (!entry) return null;
            return (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm">
                <p className="font-medium text-ink">{entry.student_name}</p>
                <p className="text-stone">
                  {entry.campus_name} · Grade {entry.grade} · Waitlist #{entry.position}
                </p>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={doRemove}>
              Remove Student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
