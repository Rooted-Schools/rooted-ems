import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Mirrors Communications: header, KPI row, tabs, and the message table. */
export default function CommunicationsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-11 w-32 rounded-[6px]" />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-[6px]" />
        <Skeleton className="h-9 w-24 rounded-[6px]" />
      </div>

      {/* Message table */}
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-56 mt-1" />
        </CardHeader>
        <CardContent className="px-0">
          <div className="border-b border-rooted-gray bg-rooted-gray-light px-4 py-2 flex gap-8">
            {["Ch.", "Recipient", "Subject", "Status", "Sent"].map((h) => (
              <Skeleton key={h} className="h-3 w-14" />
            ))}
          </div>
          <div className="divide-y divide-rooted-gray">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-8">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
