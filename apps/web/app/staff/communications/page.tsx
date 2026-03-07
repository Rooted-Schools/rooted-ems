export const runtime = "edge";
export const dynamic = "force-dynamic";

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
import { getStaffCommunications } from "@/lib/queries";

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

export default async function StaffCommunicationsPage() {
  const { messages, stats } = await getStaffCommunications();

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
          <Button variant="outline" disabled>Message Templates</Button>
          <Button disabled>New Message</Button>
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
            <p className="text-2xl font-bold">{stats.total_sent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Delivered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.delivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Queued
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats.queued > 0 ? "text-amber-600" : "text-gray-300"}`}>
              {stats.queued}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${stats.failed > 0 ? "text-red-600" : "text-gray-300"}`}>
              {stats.failed}
            </p>
          </CardContent>
        </Card>
      </div>

      {messages.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon="📧"
              title="No messages sent yet"
              description="Messages sent to families will appear here once the communications system is active."
            />
          </CardContent>
        </Card>
      ) : (
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
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((msg) => {
                  const cfg = statusConfig[msg.status] ?? statusConfig.queued;
                  return (
                    <TableRow key={msg.id}>
                      <TableCell>
                        <span className="text-lg" aria-hidden="true">
                          {channelIcons[msg.channel] ?? "📧"}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{msg.subject ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {msg.sent_at ?? "—"}
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
