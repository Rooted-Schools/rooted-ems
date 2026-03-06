export const runtime = "edge";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const MOCK_OFFERS = [
  {
    id: "off-001",
    studentName: "Sofia Ramirez",
    grade: "6th Grade",
    campus: "Columbia SC",
    status: "pending",
    offeredAt: "2026-03-01",
    expiresAt: "2026-03-15",
  },
  {
    id: "off-002",
    studentName: "Devon Thompson",
    grade: "11th Grade",
    campus: "Columbia SC",
    status: "accepted",
    offeredAt: "2026-02-20",
    expiresAt: "2026-03-06",
  },
  {
    id: "off-003",
    studentName: "Aisha Mohammed",
    grade: "8th Grade",
    campus: "Cleveland OH",
    status: "accepted",
    offeredAt: "2026-02-15",
    expiresAt: "2026-03-01",
  },
];

const offerStatusConfig: Record<string, { label: string; variant: "default" | "success" | "destructive" | "warning" | "outline" }> = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "success" },
  declined: { label: "Declined", variant: "destructive" },
  expired: { label: "Expired", variant: "outline" },
  revoked: { label: "Revoked", variant: "destructive" },
};

export default function StaffOffersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage seat offers sent to accepted applicants.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Offers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{MOCK_OFFERS.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Pending Response
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              {MOCK_OFFERS.filter((o) => o.status === "pending").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Accepted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {MOCK_OFFERS.filter((o) => o.status === "accepted").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Declined / Expired
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-400">
              {MOCK_OFFERS.filter((o) => o.status === "declined" || o.status === "expired").length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Offered</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_OFFERS.map((offer) => {
                const cfg = offerStatusConfig[offer.status] ?? offerStatusConfig.pending;
                return (
                  <TableRow key={offer.id} className="cursor-pointer">
                    <TableCell className="font-medium">{offer.studentName}</TableCell>
                    <TableCell>{offer.grade}</TableCell>
                    <TableCell>{offer.campus}</TableCell>
                    <TableCell>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">{offer.offeredAt}</TableCell>
                    <TableCell className="text-gray-500">{offer.expiresAt}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
