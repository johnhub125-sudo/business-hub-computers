import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="container-page py-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-4 h-4 w-48" />
      <Skeleton className="mb-6 h-8 w-72" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-line p-3">
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="mt-3 h-3 w-16" />
            <Skeleton className="mt-2 h-4 w-full" />
            <Skeleton className="mt-2 h-5 w-24" />
            <Skeleton className="mt-3 h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
