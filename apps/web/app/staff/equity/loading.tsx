import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Mirrors Equity: sub-nav tabs, a campus filter, and the conversion tables
 *  (one per demographic cut). */
export default function EquityLoading() {
  return (
    <div className="space-y-6">
      {/* SectionTabs row */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-[6px]" />
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      <Skeleton className="h-11 w-48 rounded-[6px]" />

      {Array.from({ length: 3 }).map((_, section) => (
        <Card key={section}>
          <CardContent className="p-0">
            <div className="px-6 py-4 space-y-1">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <div className="border-t border-line bg-sunken px-6 py-2 flex gap-10">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-32" />
            </div>
            <div className="divide-y divide-line">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-6 py-3 flex items-center gap-10">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
