"use client";

import { useState } from "react";
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
import type { ReportData } from "./page";

interface ReportConfig {
  id: string;
  title: string;
  description: string;
  icon: string;
  recordCount: number;
}

function toCsv(headers: string[], rows: string[][]): string {
  const escape = (v: string) =>
    v.includes(",") || v.includes('"') || v.includes("\n")
      ? `"${v.replace(/"/g, '""')}"`
      : v;
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  return lines.join("\n");
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/* ─── Inline bar component ─── */
function Bar({ value, max, color = "bg-rooted-green", className = "" }: { value: number; max: number; color?: string; className?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className={`w-full bg-gray-100 rounded-full h-2 ${className}`}>
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

/* ─── Status color map for pipeline bars ─── */
const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-400",
  needs_info: "bg-amber-400",
  verified: "bg-green-400",
  lottery_assigned: "bg-purple-400",
  offered: "bg-indigo-400",
  accepted: "bg-emerald-500",
  registered: "bg-rooted-green",
  waitlisted: "bg-orange-400",
  withdrawn: "bg-gray-300",
  declined: "bg-red-300",
};

export function ReportsClient({ data }: { data: ReportData }) {
  const [previewId, setPreviewId] = useState<string | null>(null);

  const reports: ReportConfig[] = [
    {
      id: "pipeline",
      title: "Pipeline Summary",
      description: "Application counts by status with conversion rates.",
      icon: "📊",
      recordCount: data.pipeline.reduce((sum, r) => sum + r.count, 0),
    },
    {
      id: "demographics",
      title: "Demographics Report",
      description: "Applicant demographics by race/ethnicity.",
      icon: "👥",
      recordCount: data.demographics.reduce((sum, r) => sum + r.count, 0),
    },
    {
      id: "capacity",
      title: "Capacity Utilization",
      description: "Seats offered, accepted, and registered vs. total capacity.",
      icon: "📈",
      recordCount: data.capacity.length,
    },
    {
      id: "compliance",
      title: "Compliance Export",
      description: "Enrollment data for state reporting.",
      icon: "📋",
      recordCount: data.enrollments.length,
    },
    {
      id: "audit",
      title: "Audit Trail",
      description: "System actions with timestamps and change details.",
      icon: "🔍",
      recordCount: data.auditEvents.length,
    },
    {
      id: "inquiry-sources",
      title: "Inquiry Sources",
      description: "Where families learn about the school and conversion rates.",
      icon: "📣",
      recordCount: data.inquirySources.reduce((s, r) => s + r.count, 0),
    },
  ];

  // Compute summary stats for the header
  const totalApps = data.pipeline.reduce((s, r) => s + r.count, 0);
  const registeredCount = data.pipeline.find(r => r.status === "registered")?.count ?? 0;
  const totalSeats = data.capacity.reduce((s, r) => s + r.total_seats, 0);
  const totalRegistered = data.capacity.reduce((s, r) => s + r.seats_registered, 0);
  const conversionRate = totalApps > 0 ? ((registeredCount / totalApps) * 100).toFixed(1) : "0.0";
  const utilizationRate = totalSeats > 0 ? ((totalRegistered / totalSeats) * 100).toFixed(1) : "0.0";

  function handleExport(reportId: string) {
    let csv = "";
    const date = new Date().toISOString().slice(0, 10);

    switch (reportId) {
      case "pipeline":
        csv = toCsv(
          ["Status", "Count"],
          data.pipeline.map((r) => [r.status, String(r.count)])
        );
        break;
      case "demographics":
        csv = toCsv(
          ["Demographic Group", "Count"],
          data.demographics.map((r) => [r.group, String(r.count)])
        );
        break;
      case "capacity":
        csv = toCsv(
          ["Campus", "Grade", "Total Seats", "Offered", "Accepted", "Registered", "Available"],
          data.capacity.map((r) => [
            r.campus,
            r.grade,
            String(r.total_seats),
            String(r.seats_offered),
            String(r.seats_accepted),
            String(r.seats_registered),
            String(r.total_seats - r.seats_registered),
          ])
        );
        break;
      case "compliance":
        csv = toCsv(
          ["Student", "Grade", "Campus", "Status", "Enrolled Date", "SIS ID"],
          data.enrollments.map((r) => [
            r.student_name,
            r.grade,
            r.campus,
            r.status,
            r.enrolled_at ?? "",
            r.sis_id ?? "",
          ])
        );
        break;
      case "audit":
        csv = toCsv(
          ["Action", "Table", "Actor", "Date", "Details"],
          data.auditEvents.map((r) => [
            r.action,
            r.table_name,
            r.actor_name,
            r.created_at,
            r.details,
          ])
        );
        break;
      case "inquiry-sources":
        csv = toCsv(
          ["Source", "Total Inquiries", "Converted to Application", "Conversion Rate"],
          data.inquirySources.map((r) => [
            r.source,
            String(r.count),
            String(r.converted),
            r.count > 0 ? `${((r.converted / r.count) * 100).toFixed(1)}%` : "0%",
          ])
        );
        break;
    }

    downloadCsv(`rooted-${reportId}-${date}.csv`, csv);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">
            Analytics, compliance exports, and audit trail.
          </p>
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-rooted-green">
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Total Applications</p>
            <p className="text-2xl font-bold mt-1">{totalApps}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500">
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Registered</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{registeredCount}</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-blue-500">
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Conversion Rate</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{conversionRate}%</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-purple-500">
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Seat Utilization</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{utilizationRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Visual — always visible */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Pipeline Summary</CardTitle>
              <CardDescription>Application distribution across enrollment stages</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => handleExport("pipeline")} disabled={totalApps === 0}>
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {data.pipeline.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No application data yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.pipeline
                .sort((a, b) => b.count - a.count)
                .map((row) => {
                  const pct = totalApps > 0 ? ((row.count / totalApps) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={row.status} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600 w-28 text-right capitalize">
                        {row.status.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1">
                        <Bar value={row.count} max={totalApps} color={STATUS_COLORS[row.status] ?? "bg-gray-300"} />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-10 text-right">{row.count}</span>
                      <span className="text-[10px] text-gray-400 w-12 text-right">{pct}%</span>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Capacity Visual — always visible */}
      {data.capacity.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Capacity Utilization</CardTitle>
                <CardDescription>Seat fill rates by campus and grade</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleExport("capacity")}>
                Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.capacity.map((row, idx) => {
                const available = row.total_seats - row.seats_registered;
                const fillPct = row.total_seats > 0 ? ((row.seats_registered / row.total_seats) * 100) : 0;
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-40 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{row.campus}</p>
                      <p className="text-[10px] text-gray-400">{row.grade}</p>
                    </div>
                    <div className="flex-1">
                      <div className="w-full bg-gray-100 rounded-full h-3 relative overflow-hidden">
                        {/* Registered (solid green) */}
                        <div
                          className="absolute left-0 top-0 h-3 bg-rooted-green rounded-l-full"
                          style={{ width: `${row.total_seats > 0 ? (row.seats_registered / row.total_seats) * 100 : 0}%` }}
                        />
                        {/* Accepted (lighter green, stacked) */}
                        <div
                          className="absolute left-0 top-0 h-3 bg-emerald-300 rounded-l-full"
                          style={{ width: `${row.total_seats > 0 ? ((row.seats_registered + row.seats_accepted) / row.total_seats) * 100 : 0}%` }}
                        />
                        {/* Registered on top */}
                        <div
                          className="absolute left-0 top-0 h-3 bg-rooted-green rounded-l-full"
                          style={{ width: `${row.total_seats > 0 ? (row.seats_registered / row.total_seats) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right w-20 shrink-0">
                      <span className="text-xs font-bold">{row.seats_registered}/{row.total_seats}</span>
                      <span className={`text-[10px] ml-1 ${fillPct >= 90 ? "text-red-500" : fillPct >= 70 ? "text-amber-500" : "text-gray-400"}`}>
                        ({fillPct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-rooted-green" />
                <span className="text-[10px] text-gray-500">Registered</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-emerald-300" />
                <span className="text-[10px] text-gray-500">Accepted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-gray-100" />
                <span className="text-[10px] text-gray-500">Available</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Other report cards in a grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.filter(r => r.id !== "pipeline" && r.id !== "capacity").map((report) => (
          <Card
            key={report.id}
            className={`hover:border-gray-300 transition-colors ${
              previewId === report.id ? "ring-2 ring-rooted-green/30 border-rooted-green/50" : ""
            }`}
          >
            <CardHeader>
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">
                  {report.icon}
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{report.title}</CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {report.recordCount} records
                    </Badge>
                  </div>
                  <CardDescription className="mt-1">
                    {report.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPreviewId(previewId === report.id ? null : report.id)
                  }
                  disabled={report.recordCount === 0}
                >
                  {previewId === report.id ? "Hide" : "Preview"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport(report.id)}
                  disabled={report.recordCount === 0}
                >
                  Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Preview Panels for sub-reports */}
      {previewId === "demographics" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demographics Breakdown</CardTitle>
            <CardDescription>
              Applicant demographics by race/ethnicity ({data.demographics.reduce((s, r) => s + r.count, 0)} total)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.demographics.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No demographic data.</p>
            ) : (
              <div className="space-y-2.5">
                {data.demographics.map((row) => {
                  const total = data.demographics.reduce((s, r) => s + r.count, 0);
                  const pct = total > 0 ? ((row.count / total) * 100).toFixed(1) : "0.0";
                  const maxCount = Math.max(...data.demographics.map(r => r.count));
                  return (
                    <div key={row.group} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-gray-600 w-36 text-right truncate">
                        {row.group}
                      </span>
                      <div className="flex-1">
                        <Bar value={row.count} max={maxCount} color="bg-purple-400" />
                      </div>
                      <span className="text-xs font-bold text-gray-700 w-10 text-right">{row.count}</span>
                      <span className="text-[10px] text-gray-400 w-12 text-right">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {previewId === "compliance" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compliance Export Preview</CardTitle>
            <CardDescription>Showing first 20 records</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Enrolled</TableHead>
                  <TableHead>SIS ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.enrollments.slice(0, 20).map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{row.student_name}</TableCell>
                    <TableCell>{row.grade}</TableCell>
                    <TableCell>{row.campus}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "active" ? "success" : "outline"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-gray-500">{row.enrolled_at ?? "\u2014"}</TableCell>
                    <TableCell>
                      {row.sis_id ? (
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                          {row.sis_id}
                        </code>
                      ) : (
                        <span className="text-gray-400">\u2014</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {previewId === "audit" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit Trail Preview</CardTitle>
            <CardDescription>Showing most recent 20 events</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {data.auditEvents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">No audit events recorded yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.auditEvents.slice(0, 20).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {row.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.table_name}</TableCell>
                      <TableCell className="text-xs text-gray-700">{row.actor_name || "\u2014"}</TableCell>
                      <TableCell className="text-gray-500 text-xs">{row.created_at}</TableCell>
                      <TableCell className="text-xs text-gray-500 max-w-48 truncate">
                        {row.details || "\u2014"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {previewId === "inquiry-sources" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inquiry Sources & Conversion</CardTitle>
            <CardDescription>
              Where families learn about your school and how many convert to applications
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.inquirySources.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">No inquiry data yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.inquirySources.map((row) => {
                  const rate = row.count > 0 ? ((row.converted / row.count) * 100) : 0;
                  const maxCount = Math.max(...data.inquirySources.map(r => r.count));
                  return (
                    <div key={row.source}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700 capitalize">
                          {row.source.replace(/_/g, " ")}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">{row.count} inquiries</span>
                          <span className={`text-xs font-bold ${rate >= 20 ? "text-rooted-green" : "text-gray-400"}`}>
                            {rate.toFixed(0)}% converted
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5 relative overflow-hidden">
                        {/* Total inquiries bar */}
                        <div
                          className="absolute left-0 top-0 h-2.5 bg-blue-200 rounded-full"
                          style={{ width: `${maxCount > 0 ? (row.count / maxCount) * 100 : 0}%` }}
                        />
                        {/* Converted overlay */}
                        <div
                          className="absolute left-0 top-0 h-2.5 bg-rooted-green rounded-full"
                          style={{ width: `${maxCount > 0 ? (row.converted / maxCount) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-4 mt-2 pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-blue-200" />
                    <span className="text-[10px] text-gray-500">Total Inquiries</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-rooted-green" />
                    <span className="text-[10px] text-gray-500">Converted to Application</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
