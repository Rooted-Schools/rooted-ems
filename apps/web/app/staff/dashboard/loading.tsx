import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Mirrors the staff dashboard: header + actions, four KPI cards,
 *  application flow card, and supporting card grid. */
export default function StaffDashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-stone/20 border-t-4 border-t-stone/30 bg-white shadow-sm p-6 space-y-3"
          >
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Application flow card */}
      <div className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex items-center justify-between gap-2 pb-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 flex-1 rounded-lg" />
          ))}
        </div>
      </div>

      {/* Supporting cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-4"
          >
            <Skeleton className="h-5 w-44" />
            <div className="space-y-3">
              {[0, 1, 2, 3].map((r) => (
                <div key={r} className="flex items-center justify-between gap-3">
                  <SkeletonText className="w-1/2" />
                  <Skeleton className="h-4 w-16 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
