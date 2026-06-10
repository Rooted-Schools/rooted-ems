"use client";

import { cn } from "@/lib/utils";

type PageItem = number | "ellipsis-start" | "ellipsis-end";

/**
 * Windowed page list: 1 … 4 5 [6] 7 8 … 20
 * Always shows first and last page, plus current ±2.
 */
function getPageItems(current: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const items: PageItem[] = [1];
  const start = Math.max(2, current - 2);
  const end = Math.min(totalPages - 1, current + 2);
  if (start > 2) items.push("ellipsis-start");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < totalPages - 1) items.push("ellipsis-end");
  items.push(totalPages);
  return items;
}

export interface PaginationProps {
  /** Current 1-based page */
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  /** Noun for the summary line, e.g. "applications" */
  itemLabel?: string;
  className?: string;
}

const pageButtonBase =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rooted-green focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export function Pagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  itemLabel = "results",
  className,
}: PaginationProps) {
  if (totalCount <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const rangeStart = (current - 1) * pageSize + 1;
  const rangeEnd = Math.min(current * pageSize, totalCount);
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-3 sm:flex-row",
        className
      )}
    >
      <p className="text-sm text-stone" aria-live="polite">
        Showing {fmt(rangeStart)}–{fmt(rangeEnd)} of {fmt(totalCount)}{" "}
        {itemLabel}
      </p>

      {totalPages > 1 && (
        <nav aria-label="Pagination">
          <ul className="flex items-center gap-1">
            <li>
              <button
                type="button"
                className={cn(pageButtonBase, "text-ink hover:bg-rooted-gray-light")}
                onClick={() => onPageChange(current - 1)}
                disabled={current <= 1}
                aria-label="Go to previous page"
              >
                ‹ Previous
              </button>
            </li>
            {getPageItems(current, totalPages).map((item) =>
              typeof item === "number" ? (
                <li key={item}>
                  <button
                    type="button"
                    className={cn(
                      pageButtonBase,
                      item === current
                        ? "bg-rooted-green text-white"
                        : "text-ink hover:bg-rooted-gray-light"
                    )}
                    onClick={() => onPageChange(item)}
                    aria-label={`Go to page ${item}`}
                    aria-current={item === current ? "page" : undefined}
                  >
                    {fmt(item)}
                  </button>
                </li>
              ) : (
                <li key={item}>
                  <span
                    className="inline-flex h-8 min-w-8 items-center justify-center text-sm text-stone"
                    aria-hidden="true"
                  >
                    …
                  </span>
                </li>
              )
            )}
            <li>
              <button
                type="button"
                className={cn(pageButtonBase, "text-ink hover:bg-rooted-gray-light")}
                onClick={() => onPageChange(current + 1)}
                disabled={current >= totalPages}
                aria-label="Go to next page"
              >
                Next ›
              </button>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
