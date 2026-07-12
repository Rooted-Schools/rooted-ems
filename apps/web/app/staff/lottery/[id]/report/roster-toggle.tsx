"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface RosterRow {
  finalRank: number;
  studentName: string;
  tierLabel: string;
  randomNumber: number;
  result: "Offered" | "Waitlisted";
}

/**
 * Off by default so the report is name-free (and safely shareable) until
 * a staff member deliberately opts in. The checkbox itself is a control,
 * not report content, so it carries `no-print` — the roster table it
 * reveals is real report content and prints exactly as shown on screen.
 */
export function RosterToggle({ roster }: { roster: RosterRow[] }) {
  const [showNames, setShowNames] = useState(false);

  return (
    <div className="space-y-3">
      <label className="no-print flex items-center gap-2 text-sm font-medium text-ink">
        <input
          type="checkbox"
          checked={showNames}
          onChange={(e) => setShowNames(e.target.checked)}
          className="h-4 w-4 rounded border-stone/40"
        />
        Include full roster with student names
      </label>

      {showNames && (
        <div>
          <p className="text-xs font-medium text-stone uppercase tracking-wider mb-2">
            Full Roster ({roster.length} student{roster.length !== 1 ? "s" : ""})
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Final Rank</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Priority Group</TableHead>
                <TableHead>Random Number</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((r) => (
                <TableRow key={r.finalRank}>
                  <TableCell className="font-mono tabular-nums">{r.finalRank}</TableCell>
                  <TableCell className="font-medium">{r.studentName}</TableCell>
                  <TableCell>{r.tierLabel}</TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {r.randomNumber.toFixed(4)}
                  </TableCell>
                  <TableCell>{r.result}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
