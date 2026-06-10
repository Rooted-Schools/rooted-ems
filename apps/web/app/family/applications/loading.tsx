import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Mirrors the family applications list: header + new-app button,
 *  then a stack of application status cards. */
export default function FamilyApplicationsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-44 rounded-lg" />
      </div>

      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-2 flex-1 min-w-0">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-4 w-56" />
              </div>
              <Skeleton className="h-5 w-24 rounded-full shrink-0" />
            </div>
            <SkeletonText className="w-2/3" />
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-8 w-28 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
