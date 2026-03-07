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
          ["Action", "Table", "Date", "Details"],
          data.auditEvents.map((r) => [
            r.action,
            r.table_name,
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate reports for compliance, analytics, and audit purposes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => (
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

      {/* Preview Panel */}
      {previewId === "pipeline" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Summary Preview</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pipeline.map((row) => {
                  const total = data.pipeline.reduce((s, r) => s + r.count, 0);
                  const pct = total > 0 ? ((row.count / total) * 100).toFixed(1) : "0.0";
                  return (
                    <TableRow key={row.status}>
                      <TableCell className="font-medium capitalize">{row.status.replace(/_/g, " ")}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right text-gray-500">{pct}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {previewId === "demographics" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demographics Preview</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Demographic Group</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.demographics.map((row) => {
                  const total = data.demographics.reduce((s, r) => s + r.count, 0);
                  const pct = total > 0 ? ((row.count / total) * 100).toFixed(1) : "0.0";
                  return (
                    <TableRow key={row.group}>
                      <TableCell className="font-medium">{row.group}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                      <TableCell className="text-right text-gray-500">{pct}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {previewId === "capacity" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capacity Utilization Preview</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campus</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Offered</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Registered</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.capacity.map((row, idx) => {
                  const available = row.total_seats - row.seats_registered;
                  return (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.campus}</TableCell>
                      <TableCell>{row.grade}</TableCell>
                      <TableCell className="text-right">{row.total_seats}</TableCell>
                      <TableCell className="text-right">{row.seats_offered}</TableCell>
                      <TableCell className="text-right">{row.seats_accepted}</TableCell>
                      <TableCell className="text-right">{row.seats_registered}</TableCell>
                      <TableCell className="text-right">
                        <span className={available <= 0 ? "text-red-600 font-semibold" : ""}>
                          {available}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
            <CardTitle className="text-base">Inquiry Sources Preview</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {data.inquirySources.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">No inquiry data yet.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Inquiries</TableHead>
                    <TableHead className="text-right">Converted</TableHead>
                    <TableHead className="text-right">Conversion Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.inquirySources.map((row) => {
                    const rate = row.count > 0 ? ((row.converted / row.count) * 100).toFixed(1) : "0.0";
                    return (
                      <TableRow key={row.source}>
                        <TableCell className="font-medium capitalize">
                          {row.source.replace(/_/g, " ")}
                        </TableCell>
                        <TableCell className="text-right">{row.count}</TableCell>
                        <TableCell className="text-right">{row.converted}</TableCell>
                        <TableCell className="text-right">
                          <span className={Number(rate) >= 20 ? "text-rooted-green font-semibold" : "text-gray-500"}>
                            {rate}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
