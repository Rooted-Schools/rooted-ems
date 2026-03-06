export const runtime = "edge";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const MOCK_MESSAGES = [
  {
    id: "msg-001",
    subject: "Application Received — Confirmation",
    channel: "email",
    recipients: 12,
    status: "delivered",
    sentAt: "2026-03-03",
  },
  {
    id: "msg-002",
    subject: "Missing Documents Required",
    channel: "email",
    recipients: 3,
    status: "delivered",
    sentAt: "2026-03-02",
  },
  {
    id: "msg-003",
    subject: "Lottery Results Notification",
    channel: "email",
    recipients: 62,
    status: "queued",
    sentAt: null,
  },
  {
    id: "msg-004",
    subject: "Enrollment Deadline Reminder",
    channel: "sms",
    recipients: 8,
    status: "sent",
    sentAt: "2026-03-01",
  },
];

const channelIcons: Record<string, string> = {
  email: "📧",
  sms: "📱",
  in_app: "🔔",
};

const statusConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "destructive" | "secondary" }> = {
  queued: { label: "Queued", variant: "secondary" },
  sent: { label: "Sent", variant: "default" },
  delivered: { label: "Delivered", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  bounced: { label: "Bounced", variant: "warning" },
};

export default function StaffCommunicationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Communications</h1>
          <p className="text-sm text-gray-500 mt-1">
            Send and track messages to families via email, SMS, or in-app notifications.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Message Templates</Button>
          <Button>New Message</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">85</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Delivered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">79</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Queued
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">1</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-300">0</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Messages</CardTitle>
          <CardDescription>All messages sent from the enrollment system.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOCK_MESSAGES.map((msg) => {
                const cfg = statusConfig[msg.status] ?? statusConfig.queued;
                return (
                  <TableRow key={msg.id} className="cursor-pointer">
                    <TableCell>
                      <span className="text-lg" aria-hidden="true">
                        {channelIcons[msg.channel] ?? "📧"}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{msg.subject}</TableCell>
                    <TableCell>{msg.recipients}</TableCell>
                    <TableCell>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {msg.sentAt ?? "—"}
                    </TableCell>
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
