import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Mirrors the family documents page: heading, upload card, and the
 *  document list card with file rows. */
export default function FamilyDocumentsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {/* Upload card */}
      <div className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>

      {/* Document list card */}
      <div className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-4">
        <Skeleton className="h-5 w-48" />
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="w-8 h-8 rounded shrink-0" />
              <div className="flex-1 space-y-1.5 min-w-0">
                <SkeletonText className="w-1/2" />
                <SkeletonText className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
