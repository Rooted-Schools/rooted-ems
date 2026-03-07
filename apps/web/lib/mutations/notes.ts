import { createServerClient } from "@rooted-ems/database/server";
import type { MutationResult } from "./applications";

// ─── Create Note ───────────────────────────────────────

/**
 * Create an internal note on an application (or any entity).
 * Staff only.
 */
export async function createNote(input: {
  entity_type: string;
  entity_id: string;
  campus_id?: string;
  content: string;
  is_internal?: boolean;
}): Promise<MutationResult<{ id: string }>> {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: note, error } = await supabase
    .from("note")
    .insert({
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      campus_id: input.campus_id ?? null,
      content: input.content,
      is_internal: input.is_internal ?? true,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !note) {
    console.error("[createNote]", error?.message);
    return { data: null, error: "Failed to create note" };
  }

  return { data: { id: note.id }, error: null };
}

// ─── Update Note ───────────────────────────────────────

/**
 * Update note content. Only the author can update.
 */
export async function updateNote(
  noteId: string,
  content: string
): Promise<MutationResult> {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { error } = await supabase
    .from("note")
    .update({ content })
    .eq("id", noteId)
    .eq("created_by", user.id);

  if (error) {
    console.error("[updateNote]", error.message);
    return { data: null, error: "Failed to update note" };
  }

  return { data: null, error: null };
}

// ─── Delete Note ───────────────────────────────────────

export async function deleteNote(noteId: string): Promise<MutationResult> {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { error } = await supabase
    .from("note")
    .delete()
    .eq("id", noteId)
    .eq("created_by", user.id);

  if (error) {
    console.error("[deleteNote]", error.message);
    return { data: null, error: "Failed to delete note" };
  }

  return { data: null, error: null };
}
