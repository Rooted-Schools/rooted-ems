"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  // Handle both date-only strings ("2025-01-15") and full timestamps ("2025-01-15T18:23:00Z")
  const d = dateStr.includes("T") ? new Date(dateStr) : new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ApplicationTableRow({ app }: { app: ApplicationRow }) {
  const router = useRouter();
  const statusConfig = getStatusConfig(app.status);

  return (
    <TableRow
      className="cursor-pointer hover:bg-rooted-gray-light"
      onClick={() => router.push(`/staff/applications/${app.id}`)}
    >
      <TableCell className="font-medium">{app.student_name}</TableCell>
      <TableCell className="text-stone">{app.guardian_name}</TableCell>
      <TableCell>{getGradeLabel(app.grade)}</TableCell>
      <TableCell>{app.campus_name}</TableCell>
      <TableCell>
        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
      </TableCell>
      <TableCell className="text-stone">
        {formatDate(app.submitted_at)}
      </TableCell>
      <TableCell className="text-stone">
        {formatDate(app.updated_at)}
      </TableCell>
    </TableRow>
  );
}

interface StaffApplicationsClientProps {
  applications: ApplicationRow[];
  totalCount: number;
  stats: ApplicationStats;
  campuses: CampusRow[];
  initialStatus?: string;
  initialSearch?: string;
  initialCampus?: string;
}

export function StaffApplicationsClient({
  applications,
  totalCount,
  stats,
  campuses,
  initialStatus = "all",
  initialSearch = "",
  initialCampus = "all",
}: StaffApplicationsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [campusFilter, setCampusFilter] = useState(initialCampus);

  const pushFilters = useCallback(
    (overrides: { status?: string; search?: string; campus?: string }) => {
      const params = new URLSearchParams(currentParams.toString());
      const status = overrides.status ?? statusFilter;
      const q = overrides.search ?? search;
      const campus = overrides.campus ?? campusFilter;

      if (status && status !== "all") params.set("status", status);
      else params.delete("status");
      if (q) params.set("search", q);
      else params.delete("search");
      if (campus && campus !== "all") params.set("campus", campus);
      else params.delete("campus");

      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, currentParams, statusFilter, search, campusFilter]
  );

  // Server already filtered — just display what we got
  const filtered = applications;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Applications</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone">
            <span className="font-medium">{filtered.length}</span>{filtered.length !== totalCount ? ` of ${totalCount}` : ""} application{totalCount !== 1 ? "s" : ""}
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
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Submitted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {stats.submitted}
            </p>
            <p className="text-xs text-stone mt-1">awaiting review</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Needs Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">
              {stats.needs_info}
            </p>
            <p className="text-xs text-stone mt-1">
              {stats.needs_info === 0 ? "none pending" : "action required"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Verified
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">
              {stats.verified}
            </p>
            <p className="text-xs text-stone mt-1">ready for lottery</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-rooted-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Registered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">
              {stats.registered}
            </p>
            <p className="text-xs text-stone mt-1">fully enrolled</p>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") pushFilters({ search });
                }}
                onBlur={() => {
                  if (search !== initialSearch) pushFilters({ search });
                }}
              />
            </div>
            <Select
              value={campusFilter}
              onChange={(e) => {
                const v = e.target.value;
                setCampusFilter(v);
                pushFilters({ campus: v });
              }}
              className="w-full sm:w-48"
            >
              <option value="all">All Campuses</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Status tabs + table */}
      <Tabs defaultValue={initialStatus} onValueChange={(v) => {
        setStatusFilter(v);
        pushFilters({ status: v });
      }}>
        <TabsList>
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value !== "all"
                ? (stats[tab.value as keyof ApplicationStats] as number)
                : undefined;
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {tab.value !== "all" && count != null ? (
                  <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-rooted-gray-dark/30 text-[10px] font-semibold">
                    {count}
                  </span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Filtered results table */}
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
    </div>
  );
}
