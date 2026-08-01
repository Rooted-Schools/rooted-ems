import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the staff Today page: slim header, greeting, exception rows (with
 *  the 4px left-border shape), and the per-grade seat progress card. */
export default function StaffTodayLoading() {
  return (
    <div className="space-y-6">
      {/* Slim header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-11 w-40 rounded-[6px]" />
      </div>

      {/* Greeting */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {/* Exception rows */}
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-[10px] border border-line border-l-4 border-l-stone/30 bg-white p-4 sm:p-[18px]"
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-3/4 max-w-full" />
              <Skeleton className="h-3 w-1/2 max-w-full" />
            </div>
            <Skeleton className="h-11 w-28 rounded-[6px] shrink-0" />
          </div>
        ))}
      </div>

      {/* Seats by grade */}
      <div className="rounded-[10px] border border-line bg-white p-4 sm:p-[18px] space-y-4">
        <Skeleton className="h-4 w-32" />
        {[0, 1].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-2.5 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
