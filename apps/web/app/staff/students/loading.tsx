import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Mirrors Students: header, the search + filter bar, and the student table. */
export default function StudentsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-56 max-w-full" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-11 flex-1 min-w-[200px] rounded-[6px]" />
        <Skeleton className="h-11 w-32 rounded-[6px]" />
        <Skeleton className="h-11 w-32 rounded-[6px]" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="border-b border-stone/20 flex gap-8 pb-2">
            {["Student", "Campus", "Grade", "Guardian", "Demographics", "Status"].map((h) => (
              <Skeleton key={h} className="h-3 w-16" />
            ))}
          </div>
          <div className="divide-y divide-rooted-gray">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="py-3 flex items-center gap-8">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
