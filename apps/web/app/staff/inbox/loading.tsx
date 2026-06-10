import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Mirrors the staff inbox: heading, five queue summary cards, and
 *  queue section cards with work-item rows. */
export default function StaffInboxLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>

      {/* Queue summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-stone/20 border-l-4 border-l-stone/30 bg-white shadow-sm p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="w-6 h-6 rounded" />
              <Skeleton className="h-7 w-8" />
            </div>
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Queue sections */}
      {[0, 1, 2].map((section) => (
        <div
          key={section}
          className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="space-y-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center justify-between gap-3 py-1">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <SkeletonText className="w-1/3" />
                    <SkeletonText className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-3 w-14 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
