import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the lead detail page: back link, header, profile + timeline cards. */
export default function LeadDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-40" />
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}
