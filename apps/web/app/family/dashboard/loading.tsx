import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Mirrors the family dashboard: welcome header, per-child journey cards,
 *  school logo grid, and the two-column info section. */
export default function FamilyDashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header: welcome line + new-application button */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-10 w-44 rounded-lg" />
      </div>

      {/* Per-child journey cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-2 min-w-0 flex-1">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-52" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full shrink-0" />
              </div>
              {/* Journey timeline strip */}
              <div className="flex items-center gap-1">
                {[0, 1, 2, 3, 4].map((s) => (
                  <Skeleton key={s} className="h-2 flex-1 rounded-full" />
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-8 w-28 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Our Schools logo cards */}
      <div>
        <Skeleton className="h-5 w-28 mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border-2 border-t-4 border-stone/20 bg-white shadow-sm py-6 px-4 flex flex-col items-center"
            >
              <Skeleton className="h-24 w-24 rounded-full mb-3" />
              <Skeleton className="h-3 w-24 mt-1" />
              <Skeleton className="h-5 w-32 rounded-full mt-2" />
            </div>
          ))}
        </div>
      </div>

      {/* How it works + Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-4"
          >
            <div className="space-y-2">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-60" />
            </div>
            <div className="space-y-3">
              {[0, 1, 2, 3].map((r) => (
                <div key={r} className="flex gap-3">
                  <Skeleton className="w-6 h-6 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <SkeletonText className="w-3/4" />
                    <SkeletonText className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
