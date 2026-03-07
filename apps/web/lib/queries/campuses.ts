import { createServerClient } from "@rooted-ems/database/server";

// ─── Types ─────────────────────────────────────────────

export interface CampusRow {
  id: string;
  name: string;
  region_name: string;
  short_code: string;
}

// ─── Queries ─────────────────────────────────────────────

/**
 * Fetch all campuses the current user has access to.
 * Used for campus selector dropdowns, filters, etc.
 * Scoped by RLS — staff see their assigned campuses.
 */
export async function getCampuses(): Promise<CampusRow[]> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("campus")
    .select(
      `
      id, name, short_code,
      region:region_id (name)
    `
    )
    .order("name", { ascending: true });

  if (error) {
    console.error("[getCampuses]", error.message);
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const region = row.region as Record<string, string> | null;
    return {
      id: row.id as string,
      name: row.name as string,
      region_name: region?.name ?? "",
      short_code: (row.short_code as string) ?? "",
    };
  });
}

/**
 * Fetch a single campus by ID.
 */
export async function getCampusById(
  campusId: string
): Promise<CampusRow | null> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from("campus")
    .select(
      `
      id, name, short_code,
      region:region_id (name)
    `
    )
    .eq("id", campusId)
    .single();

  if (error || !data) {
    console.error("[getCampusById]", error?.message);
    return null;
  }

  const region = (data as Record<string, unknown>).region as Record<string, string> | null;
  return {
    id: (data as Record<string, unknown>).id as string,
    name: (data as Record<string, unknown>).name as string,
    region_name: region?.name ?? "",
    short_code: ((data as Record<string, unknown>).short_code as string) ?? "",
  };
}
