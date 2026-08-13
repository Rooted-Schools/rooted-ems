import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Mirrors Seat Management: sub-nav tabs, header, the five-tile KPI row, and
 *  campus-grouped seat rows. */
export default function SeatsLoading() {
  return (
    <div className="space-y-6">
      {/* SectionTabs row */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-[6px]" />
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="border-t-4 border-line">
            <CardContent className="pt-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Campus-grouped seat rows */}
      {Array.from({ length: 2 }).map((_, group) => (
        <Card key={group}>
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-6 py-2 border-b border-stone/10 last:border-0">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-2 flex-1 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
