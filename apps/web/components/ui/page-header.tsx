import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent staff page header: an optional Archivo uppercase eyebrow for
 * section context, the page title, and an optional right-hand slot for actions
 * (a campus switcher, a primary button). Presentational only. The eyebrow adds
 * the hierarchy the flat titles were missing without changing the title's own
 * treatment.
 */
export function PageHeader({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Right-aligned actions (campus switcher, primary button, etc.). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 flex-wrap", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-text mb-1">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
      </div>
      {children}
    </div>
  );
}
