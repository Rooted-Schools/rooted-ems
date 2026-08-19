import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the campaign detail page: back link, header, stat tiles, preview card, recipients card. */
export default function CampaignDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-40" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Skeleton className="h-16 rounded-[6px]" />
        <Skeleton className="h-16 rounded-[6px]" />
        <Skeleton className="h-16 rounded-[6px]" />
        <Skeleton className="h-16 rounded-[6px]" />
      </div>
      <Skeleton className="h-[620px] rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
