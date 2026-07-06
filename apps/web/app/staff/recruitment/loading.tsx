import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the recruitment page: header, stage stat cards, filter bar, table. */
export default function StaffRecruitmentLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-64 rounded-lg" />
          <Skeleton className="h-10 w-44 rounded-lg" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
