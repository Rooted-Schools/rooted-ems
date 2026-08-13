import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Mirrors the Audit Trail page: sub-nav tabs, filter bar, and the events table. */
export default function AuditLoading() {
  return (
    <div className="space-y-6">
      {/* SectionTabs row */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-[6px]" />
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-11 w-40 rounded-[6px]" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-11 w-40 rounded-[6px]" />
            </div>
            <Skeleton className="h-11 w-16 rounded-[6px]" />
          </div>
        </CardContent>
      </Card>

      {/* Events table */}
      <Card>
        <CardContent className="p-0">
          <div className="border-b border-rooted-gray bg-rooted-gray-light px-4 py-2 flex gap-6">
            {["Time", "Actor", "Action", "Table", "Campus", "Details"].map((h) => (
              <Skeleton key={h} className="h-3 w-14" />
            ))}
          </div>
          <div className="divide-y divide-rooted-gray">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-6">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-20" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-20 rounded-[6px]" />
          <Skeleton className="h-11 w-16 rounded-[6px]" />
        </div>
      </div>
    </div>
  );
}
