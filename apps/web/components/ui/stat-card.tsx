import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Elevated KPI tile: a white card with a colored left accent bar, an Archivo
 * uppercase label, and a large tabular-numbers value, with an optional
 * sublabel. Presentational only. Reusable across the staff dashboard, seats,
 * lottery, and document queues so "where do things stand" reads at a glance.
 *
 * `accent` is a Tailwind background class for the 3px left bar (e.g.
 * "bg-deep-green", "bg-info", "bg-warn", "bg-campus-neal"); default deep green.
 */
export function StatCard({
  label,
  value,
  sublabel,
  accent = "bg-deep-green",
  valueClassName,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sublabel?: ReactNode;
  accent?: string;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-line bg-white px-4 py-4 shadow-[0_1px_2px_rgba(17,17,17,0.03)]",
        className
      )}
    >
      <span className={cn("absolute left-0 top-0 bottom-0 w-[3px]", accent)} aria-hidden="true" />
      <p className="font-display text-[10.5px] font-semibold uppercase tracking-wider text-stone-text">
        {label}
      </p>
      <p className={cn("font-display text-2xl font-bold tabular-nums text-ink mt-1", valueClassName)}>
        {value}
      </p>
      {sublabel && <p className="text-xs text-stone-text mt-0.5">{sublabel}</p>}
    </div>
  );
}
