/**
 * Writes for per-campus message overrides (campus_message_override).
 *
 * Deleting the row is how a campus goes back to the built-in message, so
 * "reset" is a delete rather than a flag: there is then exactly one way for
 * the send path to read "no override", and no stale copy sitting behind an
 * is_active = false that someone can flip back on months later.
 *
 * Every write is gated on enrollment_manager for the campus the row belongs
 * to, checked here rather than in the caller — this text goes to families the
 * moment it saves, and a manager at one campus must not be able to rewrite
 * another campus's welcome.
 */

import { createServiceRoleClient } from "@rooted-ems/database/server";
import { requireRoleOnCampus } from "@/lib/auth/get-session";
import { AuditAction, logAuditEvent } from "@/lib/audit";
import type { MutationResult } from "./applications";

/** Roughly one inbox-preview line; longer subjects get truncated by clients. */
export const MESSAGE_OVERRIDE_SUBJECT_MAX = 200;
/** Long enough for a genuinely warm welcome, short enough to stay readable. */
export const MESSAGE_OVERRIDE_BODY_MAX = 4000;

export interface SaveCampusMessageOverrideInput {
  campusId: string;
  templateKey: string;
  subjectEn: string;
  subjectEs: string;
  bodyEn: string;
  bodyEs: string;
}

export interface ValidatedMessageOverride {
  subject_en: string;
  subject_es: string;
  body_en: string;
  body_es: string;
}

interface FieldSpec {
  key: keyof Omit<SaveCampusMessageOverrideInput, "campusId" | "templateKey">;
  column: keyof ValidatedMessageOverride;
  label: string;
  max: number;
}

/**
 * Spanish is validated exactly as strictly as English. Families who chose
 * Spanish receive the Spanish version, so an empty Spanish field is not an
 * omission the send path can paper over — it would silently mail them
 * English.
 */
const FIELDS: FieldSpec[] = [
  { key: "subjectEn", column: "subject_en", label: "Subject (English)", max: MESSAGE_OVERRIDE_SUBJECT_MAX },
  { key: "subjectEs", column: "subject_es", label: "Subject (Spanish)", max: MESSAGE_OVERRIDE_SUBJECT_MAX },
  { key: "bodyEn", column: "body_en", label: "Body (English)", max: MESSAGE_OVERRIDE_BODY_MAX },
  { key: "bodyEs", column: "body_es", label: "Body (Spanish)", max: MESSAGE_OVERRIDE_BODY_MAX },
];

/**
 * Server-side validation, kept pure so it can be exercised without a
 * database. The client disables Save on the same rules, but that is a
 * courtesy: this is the check that actually holds.
 */
export function validateMessageOverride(
  input: Pick<SaveCampusMessageOverrideInput, "subjectEn" | "subjectEs" | "bodyEn" | "bodyEs">
): { values: ValidatedMessageOverride | null; error: string | null } {
  const values: Partial<ValidatedMessageOverride> = {};

  for (const field of FIELDS) {
    const raw = input[field.key];
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed) {
      return { values: null, error: `${field.label} is required. Add text before saving.` };
    }
    if (trimmed.length > field.max) {
      return {
        values: null,
        error: `${field.label} is ${trimmed.length} characters. Shorten it to ${field.max} or fewer.`,
      };
    }
    values[field.column] = trimmed;
  }

  return { values: values as ValidatedMessageOverride, error: null };
}

/**
 * Create or replace a campus's override for one template. Upserts on the
 * (campus_id, template_key) unique constraint, so saving twice edits the same
 * row rather than racing a second one into existence.
 */
export async function saveCampusMessageOverride(
  input: SaveCampusMessageOverrideInput
): Promise<MutationResult<{ id: string }>> {
  const session = await requireRoleOnCampus(input.campusId, "enrollment_manager");
  try {
    const templateKey = input.templateKey.trim();
    if (!templateKey) return { data: null, error: "Template key is required." };

    const { values, error: validationError } = validateMessageOverride(input);
    if (!values) return { data: null, error: validationError };

    const supabase = createServiceRoleClient();

    const { data: before } = await supabase
      .from("campus_message_override")
      .select("id, subject_en, subject_es, body_en, body_es")
      .eq("campus_id", input.campusId)
      .eq("template_key", templateKey)
      .maybeSingle();

    const { data, error } = await supabase
      .from("campus_message_override")
      .upsert(
        {
          campus_id: input.campusId,
          template_key: templateKey,
          ...values,
          is_active: true,
          updated_by: session.user_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "campus_id,template_key" }
      )
      .select("id")
      .single();

    if (error) return { data: null, error: error.message };

    await logAuditEvent({
      table_name: "campus_message_override",
      record_id: data.id,
      action: before ? AuditAction.Update : AuditAction.Create,
      actor_id: session.user_id,
      campus_id: input.campusId,
      old_data: before
        ? {
            subject_en: before.subject_en,
            subject_es: before.subject_es,
            body_en: before.body_en,
            body_es: before.body_es,
          }
        : undefined,
      new_data: { template_key: templateKey, ...values },
    });

    return { data: { id: data.id }, error: null };
  } catch (err) {
    return { data: null, error: "Failed to save the message" };
  }
}

/**
 * Drop a campus's override so the built-in message resumes. A campus with no
 * override to begin with is already in the requested state, so that is a
 * success with nothing written and nothing audited.
 */
export async function resetCampusMessageOverride(
  campusId: string,
  templateKey: string
): Promise<MutationResult> {
  const session = await requireRoleOnCampus(campusId, "enrollment_manager");
  try {
    const key = templateKey.trim();
    if (!key) return { data: null, error: "Template key is required." };

    const supabase = createServiceRoleClient();

    const { data: before } = await supabase
      .from("campus_message_override")
      .select("id, subject_en, subject_es, body_en, body_es")
      .eq("campus_id", campusId)
      .eq("template_key", key)
      .maybeSingle();

    if (!before) return { data: null, error: null };

    const { error } = await supabase
      .from("campus_message_override")
      .delete()
      .eq("id", before.id);

    if (error) return { data: null, error: error.message };

    await logAuditEvent({
      table_name: "campus_message_override",
      record_id: before.id,
      action: AuditAction.Delete,
      actor_id: session.user_id,
      campus_id: campusId,
      old_data: {
        template_key: key,
        subject_en: before.subject_en,
        subject_es: before.subject_es,
        body_en: before.body_en,
        body_es: before.body_es,
      },
      new_data: undefined,
    });

    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: "Failed to reset the message" };
  }
}
