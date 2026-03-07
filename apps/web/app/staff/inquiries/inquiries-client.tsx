"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import type { InquiryRow, InquiryStats, CampusRow } from "@/lib/queries";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "applied", label: "Applied" },
  { value: "lost", label: "Lost" },
];

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "success" | "warning" | "secondary" | "outline" }
> = {
  new: { label: "New", variant: "default" },
  contacted: { label: "Contacted", variant: "warning" },
  applied: { label: "Applied", variant: "success" },
  lost: { label: "Lost", variant: "secondary" },
};

const CONTACT_CHANNELS = [
  { value: "phone", label: "Phone Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "text", label: "Text Message" },
  { value: "other", label: "Other" },
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface InquiriesClientProps {
  inquiries: InquiryRow[];
  stats: InquiryStats;
  campuses: CampusRow[];
  staffId: string;
  staffName: string;
}

export function InquiriesClient({
  inquiries,
  stats,
  campuses,
  staffId,
  staffName,
}: InquiriesClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [campusFilter, setCampusFilter] = useState("all");
  const [selectedInquiry, setSelectedInquiry] = useState<InquiryRow | null>(null);
  const [contactLogOpen, setContactLogOpen] = useState(false);
  const [contactChannel, setContactChannel] = useState("phone");
  const [contactNotes, setContactNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = inquiries.filter((inq) => {
    const name = `${inq.student_first_name} ${inq.student_last_name} ${inq.guardian_name}`.toLowerCase();
    const matchesSearch = !search || name.includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || inq.status === statusFilter;
    const matchesCampus = campusFilter === "all" || inq.campus_name === campusFilter;
    return matchesSearch && matchesStatus && matchesCampus;
  });

  async function handleStatusUpdate(inquiryId: string, newStatus: string) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/inquiry/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inquiryId, status: newStatus }),
        });
        if (res.ok) {
          window.location.reload();
        }
      } catch (e) {
        console.error("Failed to update status", e);
      }
    });
  }

  async function handleAssignToMe(inquiryId: string) {
    startTransition(async () => {
      try {
        const res = await fetch("/api/inquiry/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inquiryId, staffId }),
        });
        if (res.ok) {
          window.location.reload();
        }
      } catch (e) {
        console.error("Failed to assign staff", e);
      }
    });
  }

  async function handleContactLog() {
    if (!selectedInquiry) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/inquiry/contact-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            inquiryId: selectedInquiry.id,
            channel: contactChannel,
            notes: contactNotes || null,
            createdBy: staffId,
          }),
        });
        if (res.ok) {
          setContactLogOpen(false);
          setContactNotes("");
          window.location.reload();
        }
      } catch (e) {
        console.error("Failed to log contact", e);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Inquiries</h1>
        <span className="text-sm text-gray-500">
          <span className="font-medium">{stats.total}</span> total inquiries
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              New
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{stats.new}</p>
            <p className="text-xs text-gray-400 mt-1">awaiting follow-up</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Contacted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.contacted}</p>
            <p className="text-xs text-gray-400 mt-1">in follow-up</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-rooted-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Applied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">{stats.applied}</p>
            <p className="text-xs text-gray-400 mt-1">converted</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-gray-400">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Lost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-500">{stats.lost}</p>
            <p className="text-xs text-gray-400 mt-1">did not convert</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by student or guardian name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={campusFilter}
              onChange={(e) => setCampusFilter(e.target.value)}
              className="w-full sm:w-48"
            >
              <option value="all">All Campuses</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Status tabs + table */}
      <Tabs defaultValue="all" onValueChange={setStatusFilter}>
        <TabsList>
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value !== "all"
                ? stats[tab.value as keyof InquiryStats]
                : undefined;
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {tab.value !== "all" && typeof count === "number" && count > 0 ? (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-[10px] font-semibold">
                    {count}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={statusFilter}>
          <Card>
            <CardContent className="pt-6 px-0">
              {filtered.length === 0 ? (
                <EmptyState
                  icon="🔍"
                  title="No inquiries found"
                  description={
                    search || campusFilter !== "all"
                      ? "Try adjusting your search or filters."
                      : "Inquiries will appear here when families express interest."
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Guardian</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Campus</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inq) => {
                      const cfg = STATUS_CONFIG[inq.status] ?? {
                        label: inq.status,
                        variant: "outline" as const,
                      };
                      return (
                        <TableRow key={inq.id}>
                          <TableCell className="font-medium">
                            {inq.student_first_name} {inq.student_last_name}
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {inq.guardian_name}
                          </TableCell>
                          <TableCell>{inq.grade_applying}</TableCell>
                          <TableCell>{inq.campus_name ?? "—"}</TableCell>
                          <TableCell className="text-gray-500 capitalize">
                            {inq.source}
                          </TableCell>
                          <TableCell>
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {inq.assigned_staff_name ?? (
                              <button
                                onClick={() => handleAssignToMe(inq.id)}
                                className="text-xs text-rooted-green hover:underline"
                                disabled={isPending}
                              >
                                Assign to me
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="text-gray-500">
                            {formatDate(inq.created_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {inq.status === "new" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleStatusUpdate(inq.id, "contacted")
                                  }
                                  disabled={isPending}
                                >
                                  Mark Contacted
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedInquiry(inq);
                                  setContactLogOpen(true);
                                }}
                              >
                                Log Contact
                              </Button>
                              {(inq.status === "new" || inq.status === "contacted") && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleStatusUpdate(inq.id, "lost")
                                  }
                                  disabled={isPending}
                                  className="text-gray-400 hover:text-red-600"
                                >
                                  Lost
                                </Button>
                              )}
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
        </TabsContent>
      </Tabs>

      {/* Contact Log Modal */}
      <Dialog open={contactLogOpen} onOpenChange={setContactLogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Log Contact —{" "}
              {selectedInquiry
                ? `${selectedInquiry.student_first_name} ${selectedInquiry.student_last_name}`
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Channel
              </label>
              <Select
                value={contactChannel}
                onChange={(e) => setContactChannel(e.target.value)}
                className="w-full"
              >
                {CONTACT_CHANNELS.map((ch) => (
                  <option key={ch.value} value={ch.value}>
                    {ch.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                placeholder="Summary of the conversation..."
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setContactLogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleContactLog}
                disabled={isPending}
                className="bg-rooted-green hover:bg-rooted-green/90 text-white"
              >
                {isPending ? "Saving..." : "Save Contact Log"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
