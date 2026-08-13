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
import type {
  ConversionCell,
  ConversionCut,
  ConversionGroupRow,
  EquityFunnelConversion,
} from "@/lib/queries/equity-funnel";
import { displayClass } from "@/lib/utils";

interface EquityClientProps {
  data: DemographicBreakdowns;
  conversion: EquityFunnelConversion;
  campuses: CampusRow[];
  initialCampus: string;
}

/**
 * One conversion cell. Never prints a bare percentage: the denominator is
 * always attached, and a group under the suppression threshold prints the
 * suppression notice instead of a rate.
 */
function RateCell({ cell, threshold }: { cell: ConversionCell; threshold: number }) {
  if (cell.denominator === 0) {
    return <span className="text-stone">no applications</span>;
  }
  if (cell.suppressed) {
    return <span className="text-stone">n &lt; {threshold} — suppressed</span>;
  }
  return (
    <span className="inline-flex items-baseline gap-2">
      <span
        className={
          cell.gap_flagged ? "font-semibold text-warn-text" : "font-medium text-ink"
        }
      >
        {cell.rate_pct}%
      </span>
      <span className="text-xs text-stone">of {cell.denominator}</span>
    </span>
  );
}

function GapTag() {
  return (
    <span
      className={`${displayClass} ml-2 rounded-[6px] border border-warn/50 bg-warn/10 px-1.5 py-0.5 text-[10px] text-warn-text`}
    >
      gap vs campus overall
    </span>
  );
}

function ConversionRow({
  row,
  threshold,
  isBaseline = false,
}: {
  row: ConversionGroupRow;
  threshold: number;
  isBaseline?: boolean;
}) {
  const flagged =
    row.application_to_offer.gap_flagged || row.offer_to_registration.gap_flagged;
  return (
    <TableRow className={flagged ? "bg-warn/5 border-l-2 border-l-warn" : ""}>
      <TableCell className={isBaseline ? "font-semibold text-ink" : "font-medium text-ink"}>
        {row.label}
      </TableCell>
      <TableCell className="text-right">
        <RateCell cell={row.application_to_offer} threshold={threshold} />
        {row.application_to_offer.gap_flagged && <GapTag />}
      </TableCell>
      <TableCell className="text-right">
        <RateCell cell={row.offer_to_registration} threshold={threshold} />
        {row.offer_to_registration.gap_flagged && <GapTag />}
      </TableCell>
    </TableRow>
  );
}

function ConversionCutTable({
  cut,
  overall,
  threshold,
}: {
  cut: ConversionCut;
  overall: ConversionGroupRow;
  threshold: number;
}) {
  return (
    <div className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="px-6">
        <h3 className={`${displayClass} text-xs text-ink`}>{cut.title}</h3>
        <p className="text-xs text-stone mt-1">
          Read from <span className="font-mono">{cut.source_note}</span>
        </p>
      </div>
      {cut.unavailable_reason ? (
        <p className="text-sm text-stone px-6 py-6">{cut.unavailable_reason}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="bg-sunken hover:bg-sunken">
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Application to offer</TableHead>
              <TableHead className="text-right">Offer to registration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <ConversionRow row={overall} threshold={threshold} isBaseline />
            {cut.rows.map((row) => (
              <ConversionRow
                key={`${cut.key}-${row.label}`}
                row={row}
                threshold={threshold}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export function EquityClient({
  data,
  conversion,
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
      // A deliberate All-campuses pick must write the explicit "all"
      // sentinel: an absent param now falls back to the campus lens
      // (lib/campus-lens.ts), which would silently undo the pick.
      else if (overrides.campus === "all") params.set("campus", "all");
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
        {campuses.length > 1 && (
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
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-t-4 border-t-info">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Total Applied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-info">{summary.total_applied}</p>
            <p className="text-xs text-stone mt-1">non-draft applications</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-warn">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Offered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-warn-text">{summary.total_offered}</p>
            <p className="text-xs text-stone mt-1">
              {summary.total_applied > 0
                ? `${Math.round((summary.total_offered / summary.total_applied) * 100)}% offer rate`
                : "no data"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-rooted-green">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-stone uppercase tracking-wider">
              Accepted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-rooted-green">{summary.total_accepted}</p>
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

      {/* Conversion by Group — where the funnel converts differently */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversion by Group</CardTitle>
          <p className="text-xs text-stone mt-1">
            Where conversion differs across groups, not just who applies. Two stage
            pairs, scoped to{" "}
            {conversion.school_year_name
              ? `the ${conversion.school_year_name} school year`
              : "the current school year"}{" "}
            and the campus selection above.
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {conversion.empty_reason ? (
            <p className="text-sm text-stone px-6 py-8">{conversion.empty_reason}</p>
          ) : (
            <div className="space-y-4">
              {conversion.cuts.map((cut) => (
                <ConversionCutTable
                  key={cut.key}
                  cut={cut}
                  overall={conversion.overall}
                  threshold={conversion.suppression_threshold}
                />
              ))}
              <div className="border-t border-line px-6 py-4 space-y-1">
                <p className="text-xs text-stone">
                  Basis: {conversion.total_applications} non-draft applications.
                  Application to offer is the share of non-draft applications that
                  reached offered or a later status. Offer to registration is the
                  share of those that reached registered, placement review, or
                  enrolled. Stage attainment is read from the application status
                  history, so an application that was offered and later withdrew
                  still counts in the offer denominator.
                </p>
                <p className="text-xs text-stone">
                  Any group with fewer than {conversion.suppression_threshold}{" "}
                  applications in the denominator shows &quot;n &lt;{" "}
                  {conversion.suppression_threshold} — suppressed&quot; instead of a
                  rate. Small cells are a privacy risk and are not statistically
                  meaningful.
                </p>
                <p className="text-xs text-stone">
                  A group is tagged &quot;gap vs campus overall&quot; when its rate is
                  more than {conversion.gap_flag_points} percentage points below the
                  campus overall and neither figure is suppressed. The tag describes a
                  difference in rates. It does not establish a cause.
                </p>
                <p className="text-xs text-stone">
                  This suppression rule applies to every table on this page — Conversion
                  by Group, Equity Funnel by Subgroup, and Race / Ethnicity Breakdown all
                  hide rates for groups with fewer than {conversion.suppression_threshold}{" "}
                  applicants. In the tables below, &quot;—&quot; means no applicants in
                  that group, not zero conversion.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Equity Funnel Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Equity Funnel by Subgroup</CardTitle>
          <p className="text-xs text-stone mt-1">
            Rows highlighted in amber are 10+ points below the overall offer rate.
            Groups with fewer than {conversion.suppression_threshold} applicants show
            suppressed rates. ELL and FRL data not yet collected — shown as 0 (placeholder).
            &quot;—&quot; means no applicants in that group.
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
                    className={row.is_flagged ? "bg-warn/5 border-l-4 border-l-warn" : ""}
                  >
                    <TableCell className="font-medium text-ink">{row.label}</TableCell>
                    <TableCell className="text-right text-stone">{row.applied}</TableCell>
                    <TableCell className="text-right text-stone">{row.offered}</TableCell>
                    <TableCell className="text-right">
                      {row.is_suppressed ? (
                        <span className="text-stone">n &lt; {conversion.suppression_threshold} — suppressed</span>
                      ) : (
                        <span
                          className={
                            row.is_flagged
                              ? "font-semibold text-warn-text"
                              : "text-stone"
                          }
                        >
                          {row.applied > 0 ? `${row.offer_rate_pct}%` : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-stone">{row.accepted}</TableCell>
                    <TableCell className="text-right text-stone">
                      {row.is_suppressed ? (
                        <span>n &lt; {conversion.suppression_threshold} — suppressed</span>
                      ) : row.offered > 0 ? (
                        `${row.accept_rate_pct}%`
                      ) : (
                        "—"
                      )}
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
            multiple groups if they selected more than one. Groups with fewer than{" "}
            {conversion.suppression_threshold} applicants show suppressed rates. &quot;—&quot;
            means no applicants in that group.
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
                    className={row.is_flagged ? "bg-warn/5 border-l-4 border-l-warn" : ""}
                  >
                    <TableCell className="font-medium text-ink">{row.group}</TableCell>
                    <TableCell className="text-right text-stone">{row.applied}</TableCell>
                    <TableCell className="text-right text-stone">{row.offered}</TableCell>
                    <TableCell className="text-right">
                      {row.is_suppressed ? (
                        <span className="text-stone">n &lt; {conversion.suppression_threshold} — suppressed</span>
                      ) : (
                        <span className={row.is_flagged ? "font-semibold text-warn-text" : "text-stone"}>
                          {row.applied > 0 ? `${row.offer_rate_pct}%` : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-stone">{row.accepted}</TableCell>
                    <TableCell className="text-right text-stone">
                      {row.is_suppressed ? (
                        <span>n &lt; {conversion.suppression_threshold} — suppressed</span>
                      ) : row.offered > 0 ? (
                        `${row.accept_rate_pct}%`
                      ) : (
                        "—"
                      )}
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
