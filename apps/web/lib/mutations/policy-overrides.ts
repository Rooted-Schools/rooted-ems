import { createServerClient } from "@rooted-ems/database/server";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import type { MutationResult } from "./applications";

/**
 * Save a campus's own text for one registration policy acknowledgement
 * (migration 00066). Uses the user-scoped client so RLS enforces that only an
 * enrollment_manager on THIS campus can write — the same bar as the
 * welcome-message override. Upserts on (campus_id, item_type): editing the
 * same policy again updates the existing row.
 *
 * Passing both bodies empty clears the override (deletes the row), which
 * returns the family to the built-in default in policy-content.ts.
 */
export async function setCampusPolicyOverride(
  campusId: string,
  itemType: string,
  bodyEn: string,
  bodyEs: string,
  actorId: string
): Promise<MutationResult> {
  try {
    const supabase = await createServerClient();

    // Empty on both languages = remove the override, fall back to built-in.
    if (!bodyEn.trim() && !bodyEs.trim()) {
      const { error } = await supabase
        .from("campus_policy_override")
        .delete()
        .eq("campus_id", campusId)
        .eq("item_type", itemType);
      if (error) return { data: null, error: error.message };
      await logAuditEvent({
        table_name: "campus_policy_override",
        record_id: null,
        action: AuditAction.StatusChange,
        actor_id: actorId,
        campus_id: campusId,
        new_data: { item_type: itemType, cleared: true },
      });
      return { data: null, error: null };
    }

    const { error } = await supabase.from("campus_policy_override").upsert(
      {
        campus_id: campusId,
        item_type: itemType,
        body_en: bodyEn,
        body_es: bodyEs,
        is_active: true,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "campus_id,item_type" }
    );

    if (error) return { data: null, error: error.message };

    await logAuditEvent({
      table_name: "campus_policy_override",
      record_id: null,
      action: AuditAction.StatusChange,
      actor_id: actorId,
      campus_id: campusId,
      new_data: { item_type: itemType },
    });

    return { data: null, error: null };
  } catch (err) {
    console.error("[setCampusPolicyOverride]", err instanceof Error ? err.message : String(err));
    return { data: null, error: "Failed to save the policy." };
  }
}
