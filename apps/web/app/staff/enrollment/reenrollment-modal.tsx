"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { staffInitiateReenrollment } from "./re-enrollment-actions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SchoolYear {
  id: string;
  name: string;
}

interface GradeLevel {
  id: string;
  grade: string;
}

interface ReenrollmentModalProps {
  /** The enrollment ID being re-enrolled */
  enrollmentId: string;
  /** Display name shown in the modal heading */
  studentName: string;
  /** Current grade (e.g. "8") — used to pre-populate next grade */
  currentGrade: string;
  /** Available school years for the select */
  schoolYears: SchoolYear[];
  /** Available grade levels for the target campus/year */
  gradeLevels: GradeLevel[];
}

// ─── Grade progression ────────────────────────────────────────────────────────

const NEXT_GRADE: Record<string, string> = {
  "6": "7",
  "7": "8",
  "8": "9",
  "9": "10",
  "10": "11",
  "11": "12",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ReenrollmentModal({
  enrollmentId,
  studentName,
  currentGrade,
  schoolYears,
  gradeLevels,
}: ReenrollmentModalProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const defaultNextGrade = NEXT_GRADE[currentGrade] ?? currentGrade;
  const defaultGradeLevel =
    gradeLevels.find((gl) => gl.grade === defaultNextGrade) ?? gradeLevels[0];
  const defaultSchoolYear = schoolYears[0];

  const [selectedSchoolYearId, setSelectedSchoolYearId] = React.useState(
    defaultSchoolYear?.id ?? ""
  );
  const [selectedGradeLevelId, setSelectedGradeLevelId] = React.useState(
    defaultGradeLevel?.id ?? ""
  );

  function handleOpenChange(nextOpen: boolean) {
    // Reset state when closing
    if (!nextOpen) {
      setError(null);
      setSuccess(false);
      setPending(false);
    }
    setOpen(nextOpen);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedSchoolYearId || !selectedGradeLevelId) {
      setError("Please select a school year and grade level.");
      return;
    }

    setPending(true);
    setError(null);

    const result = await staffInitiateReenrollment(
      enrollmentId,
      selectedSchoolYearId,
      selectedGradeLevelId
    );

    setPending(false);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Re-enroll
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-enroll {studentName}</DialogTitle>
          <DialogDescription>
            This will create a new enrollment offer for the selected school year
            and grade. The family will be notified and must accept or decline.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-4 text-center space-y-3">
            <p className="text-sm font-medium text-rooted-green">
              Re-enrollment offer sent to the family.
            </p>
            <p className="text-xs text-stone">
              The family will see the offer at{" "}
              <span className="font-mono">/family/reenrollment</span>.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenChange(false)}
            >
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            {/* School Year */}
            <div className="space-y-1.5">
              <label
                htmlFor="reenroll-school-year"
                className="text-sm font-medium text-ink"
              >
                School Year
              </label>
              <Select
                id="reenroll-school-year"
                value={selectedSchoolYearId}
                onChange={(e) => setSelectedSchoolYearId(e.target.value)}
                required
              >
                {schoolYears.map((sy) => (
                  <option key={sy.id} value={sy.id}>
                    {sy.name}
                  </option>
                ))}
              </Select>
            </div>

            {/* Grade Level */}
            <div className="space-y-1.5">
              <label
                htmlFor="reenroll-grade"
                className="text-sm font-medium text-ink"
              >
                New Grade Level
              </label>
              <Select
                id="reenroll-grade"
                value={selectedGradeLevelId}
                onChange={(e) => setSelectedGradeLevelId(e.target.value)}
                required
              >
                {gradeLevels.map((gl) => (
                  <option key={gl.id} value={gl.id}>
                    Grade {gl.grade}
                  </option>
                ))}
              </Select>
              {defaultNextGrade && (
                <p className="text-xs text-stone">
                  Pre-filled with Grade {defaultNextGrade} (next grade up from
                  current Grade {currentGrade}).
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Sending offer..." : "Send Re-enrollment Offer"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
