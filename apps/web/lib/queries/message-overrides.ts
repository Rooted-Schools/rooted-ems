/**
 * Reads for per-campus message overrides (campus_message_override).
 *
 * An absent row means "use the built-in default" — never "no message". So
 * does an absent table: these reads degrade gracefully when the migration has
 * not been applied to whatever database is being pointed at, returning null
 * rather than throwing, because the caller is a send path that must not fail
 * over a customization the campus never made.
 *
 * body_en / body_es hold paragraphs separated by a blank line. Splitting them
 * belongs to lib/email-templates.ts (splitBodyIntoParagraphs), not here.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";

export interface CampusMessageOverrideRow {
  id: string;
  campus_id: string;
  template_key: string;
  subject_en: string;
  subject_es: string;
  body_en: string;
  body_es: string;
  is_active: boolean;
  updated_at: string;
}

const SELECT_COLUMNS =
  "id, campus_id, template_key, subject_en, subject_es, body_en, body_es, is_active, updated_at";

/**
 * Error codes that mean "the schema does not have this yet":
 *   42P01    undefined_table
 *   PGRST205 PostgREST could not find the table in its schema cache
 *
 * Matched on code alone, and only on these two. A missing column, a failed
 * constraint, or a permission error is a real failure and must not be
 * reported as "this campus has no override".
 */
const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205"]);

function isMissingRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return !!error.code && MISSING_RELATION_CODES.has(error.code);
}

/**
 * The active override for one campus and template, or null when the campus
 * has never customized it (or deactivated the one it had).
 */
export async function getCampusMessageOverride(
  campusId: string,
  templateKey: string
): Promise<CampusMessageOverrideRow | null> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("campus_message_override")
    .select(SELECT_COLUMNS)
    .eq("campus_id", campusId)
    .eq("template_key", templateKey)
    .eq("is_active", true)
    .limit(1);

  if (error) {
    if (isMissingRelation(error)) {
      console.warn(
        "[getCampusMessageOverride] campus_message_override table not present. Using the built-in default."
      );
      return null;
    }
    console.error("[getCampusMessageOverride]", error.message);
    return null;
  }

  return ((data ?? [])[0] as CampusMessageOverrideRow | undefined) ?? null;
}

/**
 * Active overrides across a set of campuses, every template key. Empty when
 * none exist or the table is absent. Callers filter by template_key.
 */
export async function getCampusMessageOverrides(
  campusIds: string[]
): Promise<CampusMessageOverrideRow[]> {
  if (campusIds.length === 0) return [];

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("campus_message_override")
    .select(SELECT_COLUMNS)
    .in("campus_id", campusIds)
    .eq("is_active", true);

  if (error) {
    if (isMissingRelation(error)) {
      console.warn(
        "[getCampusMessageOverrides] campus_message_override table not present. Every campus falls back to the built-in default."
      );
      return [];
    }
    console.error("[getCampusMessageOverrides]", error.message);
    return [];
  }

  return (data ?? []) as CampusMessageOverrideRow[];
}
