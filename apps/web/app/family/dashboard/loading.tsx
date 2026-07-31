import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Mirrors the rewritten family dashboard: eyebrow + headline, primary
 *  active-child card, "Where {name} is" timeline, other-children lines. */
export default function FamilyDashboardLoading() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex justify-end -mb-4">
        <Skeleton className="h-3 w-32" />
      </div>

      {/* Eyebrow + headline */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-8 w-72" />
      </div>

      {/* Primary card */}
      <div className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-4">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-3 w-40 mx-auto" />
      </div>

      {/* Where {name} is */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-1">
          {[0, 1, 2, 3].map((s) => (
            <Skeleton key={s} className="h-2 flex-1 rounded-full" />
          ))}
        </div>
      </div>

      {/* Other children one-liners */}
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3 py-2 border-b border-stone/10">
            <SkeletonText className="w-2/3" />
            <Skeleton className="h-3 w-8" />
          </div>
        ))}
      </div>

      <Skeleton className="h-4 w-44" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}
