import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/**
 * Public route loading boundary. Every route in this group does a live
 * Supabase read with no loading.tsx above it previously, so navigation felt
 * like a dead click until the response came back. Kept neutral (no locale,
 * no branded copy) since it renders before the locale can be known.
 */
export default function PublicLoading() {
  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <Skeleton className="h-8 w-40 mx-auto" />
        <div className="rounded-xl border border-line bg-white p-6 space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <SkeletonText className="w-full" />
          <SkeletonText className="w-5/6" />
        </div>
      </div>
    </div>
  );
}
