import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the family offers list: heading + subtitle, then offer rows
 *  (student info on the left, respond button on the right). */
export default function FamilyOffersLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>

      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-stone/20 bg-white shadow-sm px-6 py-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2 min-w-0 flex-1">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-52" />
                <Skeleton className="h-5 w-32 rounded-full" />
              </div>
              <Skeleton className="h-10 w-24 rounded-lg shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
