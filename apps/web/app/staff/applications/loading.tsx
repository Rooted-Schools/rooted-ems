import { Skeleton } from "@/components/ui/skeleton";

const COLUMN_WIDTHS = ["w-32", "w-28", "w-16", "w-28", "w-20", "w-24", "w-24"];

/** Mirrors the staff applications page: header, filter bar with tabs,
 *  and a table-shaped block (header row + 8 data rows). */
export default function StaffApplicationsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-60" />
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* Filters: search + selects + status tabs */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-64 max-w-full rounded-lg" />
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>
        <div className="flex flex-wrap gap-1">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-md" />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-stone/20 bg-white shadow-sm overflow-hidden">
        {/* Header row */}
        <div className="flex items-center gap-4 px-4 py-3 border-b border-stone/20 bg-rooted-gray-light/50">
          {COLUMN_WIDTHS.map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
        {/* Data rows */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
          <div
            key={row}
            className="flex items-center gap-4 px-4 py-4 border-b border-stone/10 last:border-0"
          >
            {COLUMN_WIDTHS.map((w, i) => (
              <Skeleton
                key={i}
                className={`h-4 ${w} ${i === 4 ? "rounded-full" : ""}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
