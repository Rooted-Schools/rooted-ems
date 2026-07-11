export const dynamic = "force-dynamic";

import Link from "next/link";
import { createServiceRoleClient } from "@rooted-ems/database/server";

export const metadata = { title: "Unsubscribe — Rooted Schools" };

/**
 * One-click unsubscribe landing (LG-0.1). The token in the link is the
 * capability — no login required, matching CAN-SPAM's "functioning,
 * automatically honored opt-out" expectation. Idempotent; always renders
 * a calm bilingual confirmation rather than an error a family must parse.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: { t?: string };
}) {
  let ok = false;
  const token = searchParams?.t;

  if (token && /^[0-9a-f-]{36}$/i.test(token)) {
    const supabase = createServiceRoleClient();
    const { data: lead } = await supabase
      .from("lead")
      .select("id, unsubscribed_at")
      .eq("unsubscribe_token", token)
      .maybeSingle();

    if (lead) {
      ok = true;
      if (!lead.unsubscribed_at) {
        await supabase
          .from("lead")
          .update({ unsubscribed_at: new Date().toISOString(), next_follow_up_at: null })
          .eq("id", lead.id);
        await supabase.from("lead_activity").insert({
          lead_id: lead.id,
          activity_type: "note",
          body: "Family unsubscribed from recruitment emails via the email link.",
        });
        // Exit any active nurture journeys immediately.
        await supabase
          .from("journey_enrollment")
          .update({ status: "exited", exit_reason: "unsubscribed", ended_at: new Date().toISOString() })
          .eq("lead_id", lead.id)
          .eq("status", "active");
      }
    }
  }

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center bg-white border border-stone/20 rounded-xl px-6 py-10 space-y-4">
        <div className="text-4xl">{ok ? "👋" : "🤔"}</div>
        {ok ? (
          <>
            <h1 className="text-xl font-bold text-ink">You&apos;re unsubscribed</h1>
            <p className="text-sm text-ink/70">
              We won&apos;t send you any more recruitment emails. If you applied or enroll, we&apos;ll
              still send the messages your application needs (offers, deadlines, registration).
            </p>
            <hr className="border-stone/20" />
            <h2 className="text-lg font-bold text-ink">Suscripción cancelada</h2>
            <p className="text-sm text-ink/70">
              No le enviaremos más correos de reclutamiento. Si aplicó o se inscribe, aún le
              enviaremos los mensajes que su solicitud necesita (ofertas, fechas límite, registro).
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-ink">This link didn&apos;t work</h1>
            <p className="text-sm text-ink/70">
              The unsubscribe link looks incomplete. Reply to any email from us and a real person
              will remove you right away. / El enlace parece incompleto. Responda a cualquier
              correo nuestro y una persona real le dará de baja de inmediato.
            </p>
          </>
        )}
        <Link href="/" className="text-sm text-rooted-green hover:underline block pt-2">
          rootedschool.org
        </Link>
      </div>
    </div>
  );
}
