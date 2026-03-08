"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  async function handlePromote(positionId: string) {
    setLoading(positionId);
    setError(null);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = await staffPromoteFromWaitlist(positionId, staffUserId, expiresAt);
    if (result.error) setError(result.error);
    else router.refresh();
    setLoading(null);
  }

  async function handleRemove(positionId: string) {
    setLoading(positionId);
    setError(null);
    const result = await staffRemoveFromWaitlist(positionId, "Removed by staff.");
    if (result.error) setError(result.error);
    else router.refresh();
    setLoading(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Waitlist</h1>
          <p className="text-sm text-gray-500 mt-1">
            Students waiting for available seats, ordered by lottery rank.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {campusCounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {campusCounts.map((cc) => (
            <Card key={cc.campus_name}>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {cc.campus_name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${cc.count === 0 ? "text-gray-300" : ""}`}>
                  {cc.count}
                </p>
                <p className="text-xs text-gray-400">students waiting</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon="📋"
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
                      <TableCell className="text-gray-500">
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
