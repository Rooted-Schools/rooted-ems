import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Mirrors the family registration page: heading, progress card, and
 *  checklist category cards with item rows. */
export default function FamilyRegistrationLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {/* Progress card */}
      <div className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
        <SkeletonText className="w-1/3" />
      </div>

      {/* Checklist category cards */}
      {[0, 1].map((card) => (
        <div
          key={card}
          className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-4"
        >
          <Skeleton className="h-5 w-48" />
          <div className="space-y-3">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="w-6 h-6 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5 min-w-0">
                  <SkeletonText className="w-2/5" />
                  <SkeletonText className="h-3 w-3/5" />
                </div>
                <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
