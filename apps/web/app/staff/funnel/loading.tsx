import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors Funnel: sub-nav tabs, then the five-stage funnel cards row and
 *  the pace/decline/channel cards beneath it. */
export default function FunnelLoading() {
  return (
    <div className="space-y-6">
      {/* SectionTabs row */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-[6px]" />
        ))}
      </div>

      {/* Five funnel stage cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px] space-y-3">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Pace / decline / channel cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-[10px] border border-line bg-white p-4 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
