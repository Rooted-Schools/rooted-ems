"use client";

import { useCallback, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  DemographicBreakdowns,
  CampusRow,
} from "@/lib/queries";

interface EquityClientProps {
  data: DemographicBreakdowns;
  campuses: CampusRow[];
  initialCampus: string;
}

export function EquityClient({
  data,
  campuses,
  initialCampus,
}: EquityClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const [campusFilter, setCampusFilter] = useState(initialCampus);

  const pushFilters = useCallback(
    (overrides: { campus?: string }) => {
      const params = new URLSearchParams(currentParams.toString());
      const campus = overrides.campus ?? campusFilter;
      if (campus && campus !== "all") params.set("campus", campus);
      else params.delete("campus");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, currentParams, campusFilter]
  );

  const { summary, equity_funnel, race_ethnicity, grade_distribution, campus_breakdown } = data;

  const showCampusComparison = initialCampus === "all" && campus_breakdown.length > 1;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Equity &amp; Demographics</h1>
          <p className="text-sm text-stone mt-1">
            Demographic breakdowns and equity analysis across the enrollment pipeline
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={campusFilter}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              const v = e.target.value;
              setCampusFilter(v);
              pushFilters({ campus: v });
            }}
            className="w-48"
          >
            <option value="all">All Campuses</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Total Applied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{summary.total_applied}</p>
            <p className="text-xs text-stone mt-1">non-draft applications</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Offered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{summary.total_offered}</p>
            <p className="text-xs text-stone mt-1">
              {summary.total_applied > 0
                ? `${Math.round((summary.total_offered / summary.total_applied) * 100)}% offer rate`
                : "no data"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Accepted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{summary.total_accepted}</p>
            <p className="text-xs text-stone mt-1">
              {summary.total_offered > 0
                ? `${Math.round((summary.total_accepted / summary.total_offered) * 100)}% accept rate`
                : "no data"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-rooted-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Enrolled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">{summary.total_enrolled}</p>
            <p className="text-xs text-stone mt-1">fully enrolled students</p>
          </CardContent>
        </Card>
      </div>

      {/* Equity Funnel Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equity Funnel by Subgroup</CardTitle>
          <p className="text-xs text-stone mt-1">
            Rows highlighted in amber are 10+ points below the overall offer rate.
            ELL and FRL data not yet collected — shown as 0 (placeholder).
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {equity_funnel.length === 0 ? (
            <p className="text-sm text-stone text-center py-8">No data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subgroup</TableHead>
                  <TableHead className="text-right">Applied</TableHead>
                  <TableHead className="text-right">Offered</TableHead>
                  <TableHead className="text-right">Offer Rate</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Accept Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equity_funnel.map((row) => (
                  <TableRow
                    key={row.label}
                    className={row.is_flagged ? "bg-amber-50 border-l-4 border-l-amber-400" : ""}
                  >
                    <TableCell className="font-medium text-ink">{row.label}</TableCell>
                    <TableCell className="text-right text-stone">{row.applied}</TableCell>
                    <TableCell className="text-right text-stone">{row.offered}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          row.is_flagged
                            ? "font-semibold text-amber-700"
                            : "text-stone"
                        }
                      >
                        {row.applied > 0 ? `${row.offer_rate_pct}%` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-stone">{row.accepted}</TableCell>
                    <TableCell className="text-right text-stone">
                      {row.offered > 0 ? `${row.accept_rate_pct}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Race / Ethnicity Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Race / Ethnicity Breakdown</CardTitle>
          <p className="text-xs text-stone mt-1">
            Applicant pool composition and offer equity by race/ethnicity. Students may appear in
            multiple groups if they selected more than one.
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {race_ethnicity.length === 0 ? (
            <p className="text-sm text-stone text-center py-8">No demographic data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Race / Ethnicity</TableHead>
                  <TableHead className="text-right">Applied</TableHead>
                  <TableHead className="text-right">Offered</TableHead>
                  <TableHead className="text-right">Offer Rate</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Accept Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {race_ethnicity.map((row) => (
                  <TableRow
                    key={row.group}
                    className={row.is_flagged ? "bg-amber-50 border-l-4 border-l-amber-400" : ""}
                  >
                    <TableCell className="font-medium text-ink">{row.group}</TableCell>
                    <TableCell className="text-right text-stone">{row.applied}</TableCell>
                    <TableCell className="text-right text-stone">{row.offered}</TableCell>
                    <TableCell className="text-right">
                      <span className={row.is_flagged ? "font-semibold text-amber-700" : "text-stone"}>
                        {row.applied > 0 ? `${row.offer_rate_pct}%` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-stone">{row.accepted}</TableCell>
                    <TableCell className="text-right text-stone">
                      {row.offered > 0 ? `${row.accept_rate_pct}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Grade Distribution Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grade Distribution</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {grade_distribution.length === 0 ? (
            <p className="text-sm text-stone text-center py-8">No grade data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Applied</TableHead>
                  <TableHead className="text-right">Offered</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grade_distribution.map((row) => (
                  <TableRow key={row.grade}>
                    <TableCell className="font-medium text-ink">Grade {row.grade}</TableCell>
                    <TableCell className="text-right text-stone">{row.applied}</TableCell>
                    <TableCell className="text-right text-stone">{row.offered}</TableCell>
                    <TableCell className="text-right text-stone">{row.enrolled}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Campus Comparison — only shown when All Campuses is selected */}
      {showCampusComparison && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campus Comparison</CardTitle>
            <p className="text-xs text-stone mt-1">
              Side-by-side enrollment metrics across all campuses
            </p>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campus</TableHead>
                  <TableHead className="text-right">Applied</TableHead>
                  <TableHead className="text-right">Offered</TableHead>
                  <TableHead className="text-right">Offer Rate</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campus_breakdown.map((row) => (
                  <TableRow key={row.campus_id}>
                    <TableCell className="font-medium text-ink">{row.campus_name}</TableCell>
                    <TableCell className="text-right text-stone">{row.applied}</TableCell>
                    <TableCell className="text-right text-stone">{row.offered}</TableCell>
                    <TableCell className="text-right text-stone">
                      {row.applied > 0 ? `${row.offer_rate_pct}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right text-stone">{row.accepted}</TableCell>
                    <TableCell className="text-right text-stone">{row.enrolled}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
