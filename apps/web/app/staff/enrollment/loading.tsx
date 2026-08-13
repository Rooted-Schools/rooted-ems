import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Mirrors Enrollment: the re-enrollment panel (stat tiles + queue) above the
 *  registration KPI row and enrollment table. */
export default function EnrollmentLoading() {
  return (
    <div className="space-y-8">
      {/* Re-enrollment panel */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-64 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="border-t-4 border-line rounded-[6px] border border-stone/20 p-3 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-10" />
              </div>
            ))}
          </div>
          <div className="border-t border-rooted-gray pt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-20 rounded-[6px] ml-auto" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Registration */}
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-t-4 border-line">
              <CardHeader className="pb-2">
                <Skeleton className="h-3 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-10" />
                <Skeleton className="h-3 w-16 mt-1" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="border-b border-rooted-gray bg-rooted-gray-light px-4 py-2 flex gap-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-16" />
              ))}
            </div>
            <div className="divide-y divide-rooted-gray">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-8">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
