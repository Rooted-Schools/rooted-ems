/**
 * Reusable Supabase query-builder mock for unit-testing server mutations.
 *
 * Design goals:
 *   - Explicit, not magic: each awaited chain on a table consumes ONE queued
 *     result for that table (FIFO). Tests enqueue results in the exact order
 *     the code under test executes its queries.
 *   - Every write (insert / update / upsert / delete) is recorded with its
 *     payload and filter chain, so tests can assert "the write never
 *     happened" — the core of the security contract.
 *
 * Supported chains (the ones the mutation files actually use):
 *   .from(t).select(s).eq(c, v)[.eq()...][.is()][.in()][.order()][.limit()].single()
 *   .from(t).select(s).eq(c, v).maybeSingle()
 *   .from(t).select(s).eq(c, v)            ← awaited directly (thenable)
 *   .from(t).insert(row)[.select(s).single()]
 *   .from(t).update(u).eq(c, v)[.eq()...][.select(s).single()]
 *   .from(t).upsert(rows, opts)
 *
 * The module exports a singleton so the vi.mock factory (which runs in module
 * scope) and the test bodies share the same state.
 */
import { vi } from "vitest";

export interface TableResult {
  data: unknown;
  /** `code` is optional — most callers only check `.message`, but Postgres/PostgREST error codes (e.g. 42P01) matter to relation-missing detection. */
  error: { message: string; code?: string } | null;
}

export interface RecordedOp {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  /** Payload passed to insert/update/upsert. Undefined for selects. */
  payload?: unknown;
  /** Every chained method call (select/eq/is/in/order/limit) with its args. */
  filters: { method: string; args: unknown[] }[];
}

const WRITE_METHODS = ["insert", "update", "upsert", "delete"] as const;
const FILTER_METHODS = ["select", "eq", "neq", "gte", "lte", "like", "is", "in", "order", "limit"] as const;

export class SupabaseMock {
  /** The user returned by auth.getUser(). null = unauthenticated. */
  user: { id: string; email?: string | null; phone?: string | null } | null = null;
  /** Chronological log of every query-builder chain that was started. */
  ops: RecordedOp[] = [];
  private queues = new Map<string, TableResult[]>();

  reset(): void {
    this.user = null;
    this.ops = [];
    this.queues.clear();
  }

  setUser(user: { id: string; email?: string | null; phone?: string | null } | null): void {
    this.user = user;
  }

  /**
   * Enqueue result(s) for the next awaited chain(s) on `table`.
   * Results are consumed FIFO — one per awaited chain (select OR write).
   * When the queue is empty, chains resolve to { data: null, error: null }.
   */
  queueResult(table: string, ...results: TableResult[]): void {
    const q = this.queues.get(table) ?? [];
    q.push(...results);
    this.queues.set(table, q);
  }

  /** All recorded writes (insert/update/upsert/delete), optionally per table. */
  writes(table?: string): RecordedOp[] {
    return this.ops.filter(
      (o) => o.op !== "select" && (table === undefined || o.table === table)
    );
  }

  private nextResult(table: string): TableResult {
    const q = this.queues.get(table);
    return q && q.length > 0 ? (q.shift() as TableResult) : { data: null, error: null };
  }

  private from(table: string) {
    const op: RecordedOp = { table, op: "select", filters: [] };
    let recorded = false;
    const record = () => {
      if (!recorded) {
        this.ops.push(op);
        recorded = true;
      }
    };
    const resolve = (): TableResult => {
      record();
      return this.nextResult(table);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {};
    for (const m of WRITE_METHODS) {
      builder[m] = vi.fn((payload?: unknown) => {
        op.op = m;
        op.payload = payload;
        record();
        return builder;
      });
    }
    for (const m of FILTER_METHODS) {
      builder[m] = vi.fn((...args: unknown[]) => {
        op.filters.push({ method: m, args });
        record();
        return builder;
      });
    }
    builder.single = vi.fn(async () => resolve());
    builder.maybeSingle = vi.fn(async () => resolve());
    // Thenable: `await supabase.from(t).update(u).eq(c, v)` resolves here.
    builder.then = (
      onFulfilled?: (value: TableResult) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(resolve()).then(onFulfilled, onRejected);
    return builder;
  }

  /** Stand-in for createServerClient() — used only for auth.getUser(). */
  authClient() {
    return {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: this.user }, error: null })),
      },
      from: (table: string) => this.from(table),
    };
  }

  /** Stand-in for createServiceRoleClient(). */
  serviceClient() {
    return { from: (table: string) => this.from(table) };
  }
}

/** Shared singleton — imported by both vi.mock factories and test bodies. */
export const supabaseMock = new SupabaseMock();

/** True when the op's chain contains .eq(column, value). */
export function hasEqFilter(op: RecordedOp, column: string, value: unknown): boolean {
  return op.filters.some(
    (f) => f.method === "eq" && f.args[0] === column && f.args[1] === value
  );
}
