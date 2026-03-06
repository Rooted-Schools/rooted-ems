export const runtime = "edge";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const MOCK_WAITLIST = [
  {
    id: "wl-001",
    studentName: "Tyler Brooks",
    grade: "9th Grade",
    campus: "Vancouver WA",
    position: 1,
    addedAt: "2026-03-01",
    promoted: false,
  },
  {
    id: "wl-002",
    studentName: "Hannah Lee",
    grade: "9th Grade",
    campus: "Vancouver WA",
    position: 2,
    addedAt: "2026-03-01",
    promoted: false,
  },
  {
    id: "wl-003",
    studentName: "Carlos Rivera",
    grade: "6th Grade",
    campus: "Columbia SC",
    position: 1,
    addedAt: "2026-02-28",
    promoted: false,
  },
];

export default function StaffWaitlistPage() {
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Vancouver WA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">2</p>
            <p className="text-xs text-gray-400">students waiting</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Columbia SC
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">1</p>
            <p className="text-xs text-gray-400">students waiting</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Cleveland OH
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-300">0</p>
            <p className="text-xs text-gray-400">students waiting</p>
          </CardContent>
        </Card>
      </div>

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
                <TableHead className="w-32">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_WAITLIST.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Badge variant="outline">#{entry.position}</Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {entry.studentName}
                  </TableCell>
                  <TableCell>{entry.grade}</TableCell>
                  <TableCell>{entry.campus}</TableCell>
                  <TableCell className="text-gray-500">
                    {entry.addedAt}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm">
                      Promote
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
