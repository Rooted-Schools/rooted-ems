"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { getStatusConfig, getGradeLabel } from "@/lib/application-helpers";
import type { ApplicationRow, ApplicationStats, CampusRow } from "@/lib/queries";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "needs_info", label: "Needs Info" },
  { value: "verified", label: "Verified" },
  { value: "offered", label: "Offered" },
  { value: "accepted", label: "Accepted" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "registered", label: "Registered" },
];

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ApplicationTableRow({ app }: { app: ApplicationRow }) {
  const statusConfig = getStatusConfig(app.status);

  return (
    <Link href={`/staff/applications/${app.id}`} className="contents">
      <TableRow className="cursor-pointer hover:bg-gray-50">
        <TableCell className="font-medium">{app.student_name}</TableCell>
        <TableCell className="text-gray-500">{app.guardian_name}</TableCell>
        <TableCell>{getGradeLabel(app.grade)}</TableCell>
        <TableCell>{app.campus_name}</TableCell>
        <TableCell>
          <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
        </TableCell>
        <TableCell className="text-gray-500">
          {formatDate(app.submitted_at)}
        </TableCell>
        <TableCell className="text-gray-500">
          {formatDate(app.updated_at)}
        </TableCell>
      </TableRow>
    </Link>
  );
}

interface StaffApplicationsClientProps {
  applications: ApplicationRow[];
  totalCount: number;
  stats: ApplicationStats;
  campuses: CampusRow[];
}

export function StaffApplicationsClient({
  applications,
  totalCount,
  stats,
  campuses,
}: StaffApplicationsClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [campusFilter, setCampusFilter] = useState("all");

  const filtered = applications.filter((app) => {
    const matchesSearch =
      !search ||
      app.student_name.toLowerCase().includes(search.toLowerCase()) ||
      app.guardian_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || app.status === statusFilter;
    const matchesCampus =
      campusFilter === "all" || app.campus_name === campusFilter;
    return matchesSearch && matchesStatus && matchesCampus;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            <span className="font-medium">{totalCount}</span> total
          </span>
          <Link href="/staff/applications/new">
            <Button className="bg-rooted-green hover:bg-rooted-green/90 text-white">
              + Create Application
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Submitted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-gray-900">
              {stats.submitted}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Needs Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              {stats.needs_info}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Verified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {stats.verified}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Registered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">
              {stats.registered}
            </p>
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
                ? (stats[tab.value as keyof ApplicationStats] as number)
                : undefined;
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {tab.value !== "all" && count ? (
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
                  icon="📋"
                  title="No applications found"
                  description={
                    search || campusFilter !== "all"
                      ? "Try adjusting your search or filters."
                      : "Applications will appear here once families submit them."
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
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((app) => (
                      <ApplicationTableRow key={app.id} app={app} />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
