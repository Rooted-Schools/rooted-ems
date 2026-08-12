"use client";

/**
 * Global staff search palette (⌘K). Purpose-built overlay rather than the
 * shared <Dialog> — a command palette needs the input to own arrow-key /
 * Enter / Escape handling and an always-mounted-while-open result list,
 * which doesn't fit Dialog's trigger+content model — but it borrows the
 * same visual language (black/50 overlay, white rounded-[6px] surface).
 *
 * As-you-type, debounced ~250ms, against the searchGlobal server action
 * (app/staff/search/actions.ts). DATA HONESTY: every row shown is a real,
 * navigable match — the empty states below are the only text ever shown
 * when there's nothing (or not enough query) to show.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { IconSearch, IconUsers, IconGraduationCap, IconSprout } from "@/components/ui/icons";
import { searchGlobal, type GlobalSearchResult, type SearchResultItem } from "@/app/staff/search/actions";
import { MIN_SEARCH_QUERY_LENGTH } from "@/lib/search-utils";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;

const EMPTY_RESULT: GlobalSearchResult = { leads: [], families: [], students: [] };

type GroupLabel = "Leads" | "Applicants & Families" | "Students";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [result, setResult] = useState<GlobalSearchResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Fresh state every time the palette opens, and autofocus the input —
  // never carry a stale query/result set over from the last time it was used.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebouncedQuery("");
    setResult(EMPTY_RESULT);
    setError(null);
    setActiveIndex(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  // Debounce the query ~250ms before it drives a search.
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [query]);

  // Fetch on the debounced query. requestIdRef guards against a slower
  // earlier request resolving after a faster later one and clobbering it.
  useEffect(() => {
    if (!open) return;
    const term = debouncedQuery.trim();
    if (term.length < MIN_SEARCH_QUERY_LENGTH) {
      setResult(EMPTY_RESULT);
      setLoading(false);
      setError(null);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    searchGlobal(term)
      .then((res) => {
        if (requestIdRef.current !== requestId) return;
        setResult(res);
        setLoading(false);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setError("Search failed — try again.");
        setLoading(false);
      });
  }, [debouncedQuery, open]);

  const flatResults = useMemo(
    () => [
      ...result.leads.map((r) => ({ ...r, group: "Leads" as GroupLabel })),
      ...result.families.map((r) => ({ ...r, group: "Applicants & Families" as GroupLabel })),
      ...result.students.map((r) => ({ ...r, group: "Students" as GroupLabel })),
    ],
    [result]
  );

  // Keep the highlighted row valid whenever the result set changes shape.
  useEffect(() => {
    setActiveIndex(0);
  }, [flatResults.length]);

  // Belt-and-suspenders Escape: the input's onKeyDown covers the common
  // case (it's autofocused), this covers focus ever landing elsewhere.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  function navigateTo(item: SearchResultItem) {
    onOpenChange(false);
    router.push(item.href);
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatResults[activeIndex];
      if (item) navigateTo(item);
    }
  }

  if (!open) return null;

  const trimmed = query.trim();
  const showEmptyPrompt = trimmed.length < MIN_SEARCH_QUERY_LENGTH;
  const showNoMatches = !showEmptyPrompt && !loading && !error && flatResults.length === 0;

  // Assigns each rendered row a stable position in the flat (cross-group)
  // list so arrow-key navigation and highlighting line up with what's on
  // screen, without keeping a second parallel data structure.
  let rowIndex = -1;
  function renderGroup(label: GroupLabel, items: SearchResultItem[], Icon: typeof IconSprout) {
    if (items.length === 0) return null;
    return (
      <div key={label} className="py-1">
        <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-stone uppercase tracking-wider">
          {label}
        </div>
        {items.map((item) => {
          rowIndex += 1;
          const idx = rowIndex;
          const isActive = idx === activeIndex;
          return (
            <button
              key={`${label}-${item.id}`}
              type="button"
              onClick={() => navigateTo(item)}
              onMouseEnter={() => setActiveIndex(idx)}
              className={cn(
                "flex w-full min-h-[44px] items-center gap-3 rounded-[6px] px-3 text-left transition-colors",
                isActive ? "bg-rooted-green/10 text-deep-green" : "text-ink hover:bg-rooted-gray-light"
              )}
            >
              <Icon size={16} className="shrink-0 text-stone" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                {item.subtitle && (
                  <span className="block truncate text-xs text-stone">{item.subtitle}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="fixed inset-0 bg-black/50 animate-in fade-in-0"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search families"
        className="relative z-50 w-full max-w-xl overflow-hidden rounded-[6px] bg-white shadow-lg animate-in fade-in-0 zoom-in-95"
      >
        <div className="flex items-center gap-2 border-b border-stone/20 px-4">
          <IconSearch size={18} className="shrink-0 text-stone" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search families…"
            aria-label="Search leads, applicants and families, and students"
            className="h-12 flex-1 bg-transparent text-sm text-ink placeholder:text-stone focus:outline-none"
          />
          {loading && <span className="shrink-0 text-xs text-stone">Searching…</span>}
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {showEmptyPrompt && (
            <p className="px-3 py-6 text-center text-sm text-stone">Type at least 2 characters</p>
          )}
          {error && <p className="px-3 py-6 text-center text-sm text-error">{error}</p>}
          {showNoMatches && (
            <p className="px-3 py-6 text-center text-sm text-stone">
              No matches for &quot;{trimmed}&quot;
            </p>
          )}
          {renderGroup("Leads", result.leads, IconSprout)}
          {renderGroup("Applicants & Families", result.families, IconUsers)}
          {renderGroup("Students", result.students, IconGraduationCap)}
        </div>
      </div>
    </div>
  );
}
