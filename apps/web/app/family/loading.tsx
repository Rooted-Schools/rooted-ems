import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/** Generic fallback for family routes without their own loading.tsx:
 *  page heading + two content cards. */
export default function FamilyLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-stone/20 bg-white shadow-sm p-6 space-y-3"
        >
          <Skeleton className="h-5 w-40" />
          <SkeletonText className="w-3/4" />
          <SkeletonText className="w-1/2" />
        </div>
      ))}
    </div>
  );
}
