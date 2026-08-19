import { createServerClient, createServiceRoleClient } from "@rooted-ems/database/server";
import { getSession } from "@/lib/auth/get-session";
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
  // Resolve the actor from the request-cached session rather than opening a
  // second Supabase auth client. Every caller of createNote is a staff action
  // that already resolved the session; a second createServerClient().auth
  // .getUser() here returned null in the server-action context (the first
  // client had already rotated the session token), so createNote failed before
  // the insert and no note ever saved, for any feature that used it.
  const session = await getSession();
  if (!session) return { data: null, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data: note, error } = await supabase
    .from("note")
    .insert({
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      campus_id: input.campus_id ?? null,
      content: input.content,
      is_internal: input.is_internal ?? true,
      created_by: session.user_id,
    })
    .select("id")
    .single();

  if (error || !note) {
    console.error("[createNote]", error?.message, {
      entity_type: input.entity_type,
    });
    // Carry the database's own words. "Failed to create note" told a staff
    // member nothing and told whoever they reported it to even less.
    return {
      data: null,
      error: error?.message ? `Could not save the note: ${error.message}` : "Could not save the note.",
    };
  }

  return { data: { id: note.id }, error: null };
}

// ─── Update Note ───────────────────────────────────────

/**
 * Update note content. Only the author can update.
 */
/**
 * Save a family's text response to an info request.
 * Stored as a non-internal note so staff can see it.
 *
 * The application id comes from the client, so ownership is proved before the
 * insert — same guardian check withdrawApplication applies. Without it, any
 * signed-in family account could post a note onto any other family's
 * application, where staff would read it as that family's own words.
 */
export async function createFamilyResponse(
  applicationId: string,
  message: string,
  userId: string
): Promise<MutationResult<{ id: string }>> {
  // The authenticated family user id is passed in by the caller, which already
  // resolved the session and proved ownership. Opening a second auth client
  // and calling getUser again returned null in the server-action context, the
  // same reason createNote never saved a row, so a family responding to a
  // needs-info request always failed before the write.
  if (!userId) return { data: null, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

  const { data: appCheck } = await supabase
    .from("application")
    .select("id, guardian:guardian_id (user_id)")
    .eq("id", applicationId)
    .single();
  const appGuardian = appCheck?.guardian as unknown as { user_id: string } | null;
  if (!appGuardian || appGuardian.user_id !== userId) {
    return { data: null, error: "Not authorized" };
  }

  const { data: note, error } = await supabase
    .from("note")
    .insert({
      entity_type: "application",
      entity_id: applicationId,
      content: message,
      is_internal: false,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !note) {
    console.error("[createFamilyResponse]", error?.message);
    return { data: null, error: "Failed to send response" };
  }

  return { data: { id: note.id }, error: null };
}

export async function updateNote(
  noteId: string,
  content: string
): Promise<MutationResult> {
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

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
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const supabase = createServiceRoleClient();

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
