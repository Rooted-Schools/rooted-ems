"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { staffCreateLotteryRun } from "./actions";

/* ─── Types ─── */
interface CampusOption {
  id: string;
  name: string;
}

interface GradeLevelOption {
  id: string;
  grade: string;
  campus_id: string;
}

interface WindowOption {
  id: string;
  name: string;
  campus_id: string;
}

/* ─── Component ─── */
export function NewLotteryRunDialog({
  campuses,
  gradeLevels,
  windows,
}: {
  campuses: CampusOption[];
  gradeLevels: GradeLevelOption[];
  windows: WindowOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [campusId, setCampusId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [windowId, setWindowId] = useState("");
  const [totalSeats, setTotalSeats] = useState("");

  // Filter grade levels and windows by selected campus
  const filteredGrades = campusId
    ? gradeLevels.filter((g) => g.campus_id === campusId)
    : [];
  const filteredWindows = campusId
    ? windows.filter((w) => w.campus_id === campusId)
    : [];

  // Reset dependent fields when campus changes
  function handleCampusChange(newCampusId: string) {
    setCampusId(newCampusId);
    setGradeId("");
    setWindowId("");
    setError(null);
  }

  function handleSubmit() {
    setError(null);

    if (!campusId || !gradeId || !windowId || !totalSeats) {
      setError("All fields are required.");
      return;
    }

    const seats = parseInt(totalSeats, 10);
    if (isNaN(seats) || seats < 1) {
      setError("Total seats must be at least 1.");
      return;
    }

    startTransition(async () => {
      const result = await staffCreateLotteryRun({
        enrollment_window_id: windowId,
        campus_id: campusId,
        grade_level_id: gradeId,
        total_seats: seats,
      });

      if (result.error) {
        setError(result.error);
      } else if (result.data?.id) {
        setOpen(false);
        // Reset form
        setCampusId("");
        setGradeId("");
        setWindowId("");
        setTotalSeats("");
        // Navigate to the new run
        router.push(`/staff/lottery/${result.data.id}`);
        router.refresh();
      }
    });
  }

  const selectClasses =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-rooted-green focus:outline-none focus:ring-1 focus:ring-rooted-green";
  const labelClasses = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New Lottery Run</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Lottery Run</DialogTitle>
          <DialogDescription>
            Set up a new enrollment lottery for a specific campus and grade level.
            Eligible verified applications will be automatically included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Campus */}
          <div>
            <label className={labelClasses}>Campus</label>
            <select
              className={selectClasses}
              value={campusId}
              onChange={(e) => handleCampusChange(e.target.value)}
              disabled={isPending}
            >
              <option value="">Select a campus...</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Grade Level */}
          <div>
            <label className={labelClasses}>Grade Level</label>
            <select
              className={selectClasses}
              value={gradeId}
              onChange={(e) => { setGradeId(e.target.value); setError(null); }}
              disabled={isPending || !campusId}
            >
              <option value="">
                {campusId ? "Select a grade..." : "Select a campus first"}
              </option>
              {filteredGrades.map((g) => (
                <option key={g.id} value={g.id}>
                  Grade {g.grade}
                </option>
              ))}
            </select>
          </div>

          {/* Enrollment Window */}
          <div>
            <label className={labelClasses}>Enrollment Window</label>
            <select
              className={selectClasses}
              value={windowId}
              onChange={(e) => { setWindowId(e.target.value); setError(null); }}
              disabled={isPending || !campusId}
            >
              <option value="">
                {campusId ? "Select a window..." : "Select a campus first"}
              </option>
              {filteredWindows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* Total Seats */}
          <div>
            <label className={labelClasses}>Total Seats Available</label>
            <input
              type="number"
              min="1"
              className={selectClasses}
              placeholder="e.g. 30"
              value={totalSeats}
              onChange={(e) => { setTotalSeats(e.target.value); setError(null); }}
              disabled={isPending}
            />
            <p className="text-xs text-gray-500 mt-1">
              Number of seats available for this grade level
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 text-red-800 border border-red-200 text-sm">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Creating..." : "Create Lottery Run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
