/**
 * Bilingual (English + Spanish) email templates for enrollment events.
 *
 * Both languages are included in the same email — English first, a divider,
 * then Spanish — which is common practice for school communications and
 * avoids needing a stored locale preference per family.
 *
 * Each template returns { subject, html, text }. HTML is simple and clean:
 * inline styles only, no external assets, max-width 600px.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://enroll.rootedschool.org";

const BRAND_GREEN = "#81A780";
const TEXT_COLOR = "#2d2d2d";
const MUTED_COLOR = "#6b6b6b";

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Render a deadline for an email.
 *
 * A deadline stored as UTC must be shown in the campus timezone or a family on
 * a UTC server (Vercel) can be told a different calendar day than the SMS and
 * in-app screen show. Pass `timeZone` (the campus IANA zone) to fix the day;
 * pass `withTime` to also show the wall-clock cutoff and zone (for example
 * "4:00 PM PST"), which is what the family is actually held to.
 */
function formatDateEn(iso: string, timeZone?: string | null, withTime?: boolean): string {
  try {
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    };
    if (timeZone) options.timeZone = timeZone;
    if (withTime) {
      options.hour = "numeric";
      options.minute = "2-digit";
      options.timeZoneName = "short";
    }
    return new Intl.DateTimeFormat("en-US", options).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDateEs(iso: string, timeZone?: string | null, withTime?: boolean): string {
  try {
    const options: Intl.DateTimeFormatOptions = {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    };
    if (timeZone) options.timeZone = timeZone;
    if (withTime) {
      options.hour = "numeric";
      options.minute = "2-digit";
      options.timeZoneName = "short";
    }
    return new Intl.DateTimeFormat("es-US", options).format(new Date(iso));
  } catch {
    return iso;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Section {
  greeting: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  closing: string;
}

/**
 * Campus mark for the email header. Optional — most callers have no campus
 * logo on file (unknown short_code, or no campusId at all), and the header
 * stays exactly as it was: just the green top rule, no image. `campusName`
 * is required alongside `campusLogoUrl` because an <img> with no accessible
 * text next to it is a worse header than none at all.
 */
interface EmailHeaderOptions {
  campusLogoUrl?: string;
  campusName?: string;
}

/**
 * Render the shared bilingual layout: English block, divider, Spanish block.
 */
function renderEmail(
  en: Section,
  es: Section,
  header?: EmailHeaderOptions
): { html: string; text: string } {
  const renderSection = (s: Section) => `
    <p style="margin:0 0 16px 0;">${escapeHtml(s.greeting)}</p>
    ${s.paragraphs.map((p) => `<p style="margin:0 0 16px 0;">${escapeHtml(p)}</p>`).join("\n")}
    ${
      s.cta
        ? `<p style="margin:24px 0;">
            <a href="${s.cta.url}" style="background-color:${BRAND_GREEN};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block;">${escapeHtml(s.cta.label)}</a>
          </p>
          <p style="margin:0 0 16px 0;font-size:13px;color:${MUTED_COLOR};">${escapeHtml(s.cta.label)}: <a href="${s.cta.url}" style="color:${BRAND_GREEN};">${s.cta.url}</a></p>`
        : ""
    }
    <p style="margin:0;">${escapeHtml(s.closing)}</p>`;

  // Campus mark, shown only when a logo URL was resolved (see resolveCampus
  // in lib/notify.ts) — a campus with no known logo gets the plain rule,
  // same as before this option existed.
  const headerMarkHtml = header?.campusLogoUrl
    ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
        <img src="${header.campusLogoUrl}" alt="${escapeHtml(header.campusName ?? "")}" height="40" style="height:40px;width:auto;display:block;border:0;" />
        ${
          header.campusName
            ? `<span style="font-size:15px;font-weight:bold;color:${TEXT_COLOR};">${escapeHtml(header.campusName)}</span>`
            : ""
        }
      </div>`
    : "";

  const html = `
<div style="margin:0 auto;max-width:600px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${TEXT_COLOR};padding:24px;">
  <div style="border-top:4px solid ${BRAND_GREEN};padding-top:24px;">
    ${headerMarkHtml}
    ${renderSection(en)}
  </div>
  <hr style="border:none;border-top:1px solid #dddddd;margin:32px 0;" />
  <div>
    ${renderSection(es)}
  </div>
  <p style="margin:32px 0 0 0;font-size:12px;color:${MUTED_COLOR};">
    Rooted Schools Enrollment · <a href="${APP_URL}" style="color:${BRAND_GREEN};">${APP_URL.replace(/^https?:\/\//, "")}</a>
  </p>
</div>`.trim();

  const renderTextSection = (s: Section) =>
    [s.greeting, ...s.paragraphs, s.cta ? `${s.cta.label}: ${s.cta.url}` : null, s.closing]
      .filter(Boolean)
      .join("\n\n");

  const text = `${renderTextSection(en)}\n\n----------\n\n${renderTextSection(es)}`;

  return { html, text };
}

/**
 * A single staff-composed message, wrapped in the same branded shell as the
 * rest of the system's mail. English-only (staff type the message once, in
 * whatever language they're writing to the family in) and no opt-out
 * language — this is a direct 1:1 reply to a specific family, not a bulk
 * campaign send, so it's exempt from the marketing-suppression footer the
 * same way transactional enrollment mail is (see lib/email-compliance.ts).
 */
export function staffComposedEmail({
  subject,
  message,
  campusName,
  senderName,
  campusLogoUrl,
}: {
  subject: string;
  message: string;
  campusName: string;
  senderName?: string;
  /** Absolute campus logo URL. Omitted, the mark degrades to the campus name. */
  campusLogoUrl?: string;
}): EmailTemplate {
  const paragraphs = message
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const closing = senderName ? `${senderName}, ${campusName}` : `The ${campusName} Team`;

  const bodyHtml = paragraphs
    .map((p) => `<p style="margin:0 0 16px 0;">${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
    .join("\n");

  // This template keeps its own shell rather than calling renderEmail, because
  // a staff member writes one language and renderEmail lays out two. It still
  // has to carry the campus mark, or a message from a school arrives looking
  // like it came from nowhere.
  const mark = campusLogoUrl
    ? `<img src="${campusLogoUrl}" alt="${escapeHtml(campusName)}" width="120" style="display:block;margin:0 0 20px 0;max-width:120px;height:auto;" />`
    : `<p style="margin:0 0 20px 0;font-size:14px;font-weight:bold;color:${TEXT_COLOR};">${escapeHtml(campusName)}</p>`;

  const html = `
<div style="margin:0 auto;max-width:600px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${TEXT_COLOR};padding:24px;">
  <div style="border-top:4px solid ${BRAND_GREEN};padding-top:24px;">
    ${mark}
    ${bodyHtml}
    <p style="margin:24px 0 0 0;">${escapeHtml(closing)}</p>
  </div>
  <p style="margin:32px 0 0 0;font-size:12px;color:${MUTED_COLOR};">
    Rooted Schools Enrollment &middot; <a href="${APP_URL}" style="color:${BRAND_GREEN};">${APP_URL.replace(/^https?:\/\//, "")}</a>
  </p>
</div>`.trim();

  const text = `${paragraphs.join("\n\n")}\n\n${closing}`;

  return { subject, html, text };
}

function studentEn(studentFirstName?: string): string {
  return studentFirstName ?? "your student";
}

function studentEs(studentFirstName?: string): string {
  return studentFirstName ?? "su estudiante";
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function applicationReceived({
  studentFirstName,
  campusName,
  campusLogoUrl,
}: {
  studentFirstName?: string;
  campusName: string;
  campusLogoUrl?: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: "Hello,",
      paragraphs: [
        `We've received your enrollment application for ${studentEn(studentFirstName)} at ${campusName}. Thank you for choosing us!`,
        `Our enrollment team will review the application and reach out with next steps. You can check the status anytime in your family portal.`,
        `If more families apply than we have seats, a fair random lottery decides placement. You can read exactly how it works at ${APP_URL}/how-the-lottery-works.`,
      ],
      cta: { label: "View your application", url: `${APP_URL}/family/applications` },
      closing: "Warmly, the Rooted Schools Enrollment Team",
    },
    {
      greeting: "Hola,",
      paragraphs: [
        `Hemos recibido su solicitud de inscripción para ${studentEs(studentFirstName)} en ${campusName}. ¡Gracias por elegirnos!`,
        `Nuestro equipo de inscripción revisará la solicitud y se comunicará con usted con los próximos pasos. Puede consultar el estado en cualquier momento en su portal familiar.`,
        `Si aplican más familias que los cupos disponibles, una lotería aleatoria y justa decide los lugares. Puede leer exactamente cómo funciona en ${APP_URL}/how-the-lottery-works.`,
      ],
      cta: { label: "Ver su solicitud", url: `${APP_URL}/family/applications` },
      closing: "Cordialmente, el Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: `Application received for ${studentEn(studentFirstName)} / Solicitud recibida`,
    html,
    text,
  };
}

export function offerExtended({
  studentFirstName,
  campusName,
  expiresAt,
  campusLogoUrl,
  offerId,
  timeZone,
}: {
  studentFirstName?: string;
  campusName: string;
  expiresAt: string;
  campusLogoUrl?: string;
  /** Deep-links the CTA to the specific offer so it renders even after expiry. */
  offerId?: string;
  /** Campus IANA timezone — renders the deadline in the family's own zone. */
  timeZone?: string | null;
}): EmailTemplate {
  const deadlineEn = formatDateEn(expiresAt, timeZone, !!timeZone);
  const deadlineEs = formatDateEs(expiresAt, timeZone, !!timeZone);
  const offerUrl = offerId ? `${APP_URL}/family/offers/${offerId}` : `${APP_URL}/family/offers`;
  const { html, text } = renderEmail(
    {
      greeting: "Congratulations!",
      paragraphs: [
        `A seat has been offered for ${studentEn(studentFirstName)} at ${campusName}.`,
        `Please respond by ${deadlineEn} to secure the spot. If we don't hear from you by then, the seat may be offered to another family.`,
      ],
      cta: { label: "Respond to your offer", url: offerUrl },
      closing: "We hope to welcome you soon, the Rooted Schools Enrollment Team",
    },
    {
      greeting: "¡Felicidades!",
      paragraphs: [
        `Se ha ofrecido un cupo para ${studentEs(studentFirstName)} en ${campusName}.`,
        `Por favor responda antes del ${deadlineEs} para asegurar el cupo. Si no recibimos su respuesta para esa fecha, el cupo podría ofrecerse a otra familia.`,
      ],
      cta: { label: "Responder a su oferta", url: offerUrl },
      closing: "Esperamos darle la bienvenida pronto, el Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: "You have an enrollment offer / Tiene una oferta de inscripción",
    html,
    text,
  };
}

export function offerExpiringSoon({
  studentFirstName,
  campusName,
  expiresAt,
  campusLogoUrl,
  offerId,
  timeZone,
}: {
  studentFirstName?: string;
  campusName: string;
  expiresAt: string;
  campusLogoUrl?: string;
  /** Deep-links the CTA to the specific offer so it renders even after expiry. */
  offerId?: string;
  /** Campus IANA timezone — renders the deadline in the family's own zone. */
  timeZone?: string | null;
}): EmailTemplate {
  const deadlineEn = formatDateEn(expiresAt, timeZone, !!timeZone);
  const deadlineEs = formatDateEs(expiresAt, timeZone, !!timeZone);
  const offerUrl = offerId ? `${APP_URL}/family/offers/${offerId}` : `${APP_URL}/family/offers`;
  const { html, text } = renderEmail(
    {
      greeting: "Hello,",
      paragraphs: [
        `A friendly reminder: the seat offer for ${studentEn(studentFirstName)} at ${campusName} expires on ${deadlineEn}.`,
        "We'd love to save this spot for your family, but we need your response before the deadline. It only takes a minute to accept or decline online.",
      ],
      cta: { label: "Respond to your offer", url: offerUrl },
      closing: "We're here if you have questions, the Rooted Schools Enrollment Team",
    },
    {
      greeting: "Hola,",
      paragraphs: [
        `Un recordatorio amistoso: la oferta de cupo para ${studentEs(studentFirstName)} en ${campusName} vence el ${deadlineEs}.`,
        "Nos encantaría guardar este cupo para su familia, pero necesitamos su respuesta antes de la fecha límite. Solo toma un minuto aceptar o rechazar en línea.",
      ],
      cta: { label: "Responder a su oferta", url: offerUrl },
      closing: "Estamos aquí si tiene preguntas, el Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: "Your enrollment offer expires soon / Su oferta de inscripción vence pronto",
    html,
    text,
  };
}

export function offerAccepted({
  studentFirstName,
  campusName,
  campusLogoUrl,
}: {
  studentFirstName?: string;
  campusName: string;
  campusLogoUrl?: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: "Congratulations!",
      paragraphs: [
        `You've accepted the seat offer for ${studentEn(studentFirstName)} at ${campusName}. We're thrilled to have your family join us!`,
        "The next step is registration: please log in to complete the enrollment packet so everything is ready for the first day of school.",
      ],
      cta: { label: "Start registration", url: `${APP_URL}/family/registration` },
      closing: "Welcome to the Rooted Schools family, the Enrollment Team",
    },
    {
      greeting: "¡Felicidades!",
      paragraphs: [
        `Ha aceptado la oferta de cupo para ${studentEs(studentFirstName)} en ${campusName}. ¡Estamos encantados de que su familia se una a nosotros!`,
        "El siguiente paso es la inscripción: por favor inicie sesión para completar el paquete de inscripción y así tener todo listo para el primer día de clases.",
      ],
      cta: { label: "Comenzar la inscripción", url: `${APP_URL}/family/registration` },
      closing: "Bienvenidos a la familia de Rooted Schools, el Equipo de Inscripción",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: "Next step: complete registration / Próximo paso: complete la inscripción",
    html,
    text,
  };
}

export function registrationComplete({
  studentFirstName,
  campusName,
  campusLogoUrl,
}: {
  studentFirstName?: string;
  campusName: string;
  campusLogoUrl?: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: "Wonderful news!",
      paragraphs: [
        `All of ${studentEn(studentFirstName)}'s registration items for ${campusName} have been submitted and verified.`,
        "Our team is now finishing a final placement review. There is nothing more you need to do right now, and we'll follow up as soon as that review is complete. Keep an eye on your portal for updates.",
      ],
      cta: { label: "Check your status", url: `${APP_URL}/family/registration` },
      closing: "Thank you for your patience, the Rooted Schools Enrollment Team",
    },
    {
      greeting: "¡Excelentes noticias!",
      paragraphs: [
        `Todos los requisitos de inscripción de ${studentEs(studentFirstName)} en ${campusName} han sido enviados y verificados.`,
        "Nuestro equipo está terminando ahora una revisión final de colocación. No necesita hacer nada más por el momento, y nos pondremos en contacto tan pronto como esa revisión esté completa. Esté atento(a) a su portal para más información.",
      ],
      cta: { label: "Ver el estado de su inscripción", url: `${APP_URL}/family/registration` },
      closing: "Gracias por su paciencia, el Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: "Registration complete! / ¡Inscripción completa!",
    html,
    text,
  };
}

export function waitlistPromoted({
  studentFirstName,
  campusName,
  campusLogoUrl,
  expiresAt,
  offerId,
  timeZone,
}: {
  studentFirstName?: string;
  campusName: string;
  campusLogoUrl?: string;
  /** When present, the email states the real response deadline. */
  expiresAt?: string;
  /** Deep-links the CTA to the specific offer so it renders even after expiry. */
  offerId?: string;
  /** Campus IANA timezone — renders the deadline in the family's own zone. */
  timeZone?: string | null;
}): EmailTemplate {
  const offerUrl = offerId ? `${APP_URL}/family/offers/${offerId}` : `${APP_URL}/family/offers`;
  const deadlineEn = expiresAt ? formatDateEn(expiresAt, timeZone, !!timeZone) : null;
  const deadlineEs = expiresAt ? formatDateEs(expiresAt, timeZone, !!timeZone) : null;
  const respondLineEn = deadlineEn
    ? `Please log in to review your offer and respond by ${deadlineEn}. Seats from the waitlist move quickly.`
    : "Please log in to review your offer and respond before the deadline. Seats from the waitlist move quickly.";
  const respondLineEs = deadlineEs
    ? `Por favor inicie sesión para revisar su oferta y responder antes del ${deadlineEs}. Los cupos de la lista de espera se asignan rápidamente.`
    : "Por favor inicie sesión para revisar su oferta y responder antes de la fecha límite. Los cupos de la lista de espera se asignan rápidamente.";
  const { html, text } = renderEmail(
    {
      greeting: "Great news!",
      paragraphs: [
        `A seat has opened at ${campusName}, and ${studentEn(studentFirstName)} has been offered a spot from the waitlist.`,
        respondLineEn,
      ],
      cta: { label: "Check your offers", url: offerUrl },
      closing: "We hope to welcome you soon, the Rooted Schools Enrollment Team",
    },
    {
      greeting: "¡Buenas noticias!",
      paragraphs: [
        `Se ha abierto un cupo en ${campusName}, y a ${studentEs(studentFirstName)} se le ha ofrecido un lugar desde la lista de espera.`,
        respondLineEs,
      ],
      cta: { label: "Ver sus ofertas", url: offerUrl },
      closing: "Esperamos darle la bienvenida pronto, el Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: "A seat has opened! / ¡Se ha abierto un cupo!",
    html,
    text,
  };
}

/**
 * Sent when staff complete lottery results: every non-selected family gets
 * their honest result plus a real, ranked place on the waitlist.
 * `position` is optional so the message still reads well when a caller
 * doesn't have a rank on hand (falls back to "on the waitlist").
 */
export function lotteryResultWaitlisted({
  studentFirstName,
  campusName,
  position,
  campusLogoUrl,
}: {
  studentFirstName?: string;
  campusName: string;
  position?: number;
  campusLogoUrl?: string;
}): EmailTemplate {
  const positionEn = position != null ? `currently #${position} on the waitlist` : "on the waitlist";
  const positionEs =
    position != null ? `actualmente en el puesto #${position} de la lista de espera` : "en la lista de espera";
  const { html, text } = renderEmail(
    {
      greeting: "The lottery results are in.",
      paragraphs: [
        `The lottery for ${campusName} has been held. ${studentEn(studentFirstName)} wasn't selected for an initial seat, but has a real place on the waitlist: ${positionEn}.`,
        `Seats often open in the first weeks. If a seat opens and ${studentEn(studentFirstName)} is next, we'll email and text you with time to accept. You can see the live position anytime in your family portal.`,
      ],
      cta: { label: "See your dashboard", url: `${APP_URL}/family/dashboard` },
      closing: "We know waiting is hard, and we're rooting for a seat to open. The Rooted Schools Enrollment Team",
    },
    {
      greeting: "Ya tenemos los resultados del sorteo.",
      paragraphs: [
        `Se ha realizado el sorteo para ${campusName}. ${studentEs(studentFirstName)} no fue seleccionado(a) para un cupo inicial, pero tiene un lugar real en la lista de espera: ${positionEs}.`,
        `Los cupos suelen abrirse en las primeras semanas. Si se abre un cupo y ${studentEs(studentFirstName)} es el/la siguiente, le enviaremos un correo electrónico y un mensaje de texto con tiempo para aceptar. Puede ver la posición en vivo en cualquier momento en su portal familiar.`,
      ],
      cta: { label: "Ver su panel", url: `${APP_URL}/family/dashboard` },
      closing:
        "Sabemos que esperar es difícil, y esperamos que se abra un cupo pronto. El Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: `Lottery result for ${studentEn(studentFirstName)} / Resultado del sorteo`,
    html,
    text,
  };
}

// ─── Campaign templates ───────────────────────────────────────────────────────
// Staff-launched batch emails to leads (see /staff/recruitment → Email
// Families). Every template is bilingual, carries the Rooted-branded wrapper,
// and closes with a soft opt-out line. `renderCampaignEmail` is the single
// entry point the send cron uses, so payloads are validated in one place.

const OPT_OUT_EN = "If you'd rather not hear from us, just reply and let us know.";
const OPT_OUT_ES = "Si prefiere no recibir estos mensajes, simplemente responda y háganoslo saber.";

/**
 * Per-recipient unsubscribe URL placeholder. Bulk senders (campaign cron,
 * re-engagement, journeys) replace this with the lead's tokenized link at
 * send time — one render per campaign, one cheap string swap per recipient.
 */
export const UNSUB_PLACEHOLDER = "%%UNSUB_URL%%";

/** One-click unsubscribe footer appended to every BULK template. */
function withCampaignFooter(t: EmailTemplate): EmailTemplate {
  const footerHtml = `
  <p style="margin:16px 0 0 0;font-size:12px;color:${MUTED_COLOR};text-align:center;">
    <a href="${UNSUB_PLACEHOLDER}" style="color:${MUTED_COLOR};text-decoration:underline;">Unsubscribe / Cancelar suscripción</a>
  </p>`;
  return {
    subject: t.subject,
    html: t.html.replace(/<\/div>\s*$/, `${footerHtml}\n</div>`),
    text: `${t.text}\n\nUnsubscribe / Cancelar suscripción: ${UNSUB_PLACEHOLDER}`,
  };
}

export type CampaignTemplateKey = "reintroduction" | "event_invite" | "deadline" | "custom";

export interface CampaignPayload {
  // event_invite
  eventName?: string;
  eventDate?: string;
  eventLocation?: string;
  // deadline
  deadline?: string;
  // custom
  subject?: string;
  bodyEn?: string;
  bodyEs?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export const CAMPAIGN_TEMPLATES: Record<CampaignTemplateKey, { label: string; description: string }> = {
  reintroduction: {
    label: "Reintroduction / Apply Now",
    description: "Warm re-welcome for families who expressed interest before: applications are open, apply in five minutes.",
  },
  event_invite: {
    label: "Event Invitation",
    description: "Invite families to an info session, open house, or tour. You set the event name, date, and location.",
  },
  deadline: {
    label: "Deadline Reminder",
    description: "A friendly nudge that the application window is closing. You set the deadline.",
  },
  custom: {
    label: "Custom Message",
    description: "Write your own message. It's delivered inside the Rooted-branded bilingual wrapper.",
  },
};

export function renderCampaignEmail(
  templateKey: CampaignTemplateKey,
  payload: CampaignPayload,
  campusName: string,
  /**
   * Absolute URL of the campus logo. Optional only so an old call site cannot
   * break at compile time; every real send path should pass it. Without it a
   * campaign or journey email arrives with no campus mark, while every
   * transactional email carries one, which is why campaign sends looked
   * unbranded next to the rest of the system.
   */
  campusLogoUrl?: string
): EmailTemplate {
  const header = { campusLogoUrl, campusName };
  switch (templateKey) {
    case "reintroduction": {
      const { html, text } = renderEmail(
        {
          greeting: "Hello,",
          paragraphs: [
            `You reached out about ${campusName}, and we have news worth sharing: applications are open, and seats are filling now.`,
            `${campusName} is a tuition-free public school where students earn real credentials of value and build career experience with local employers while they work toward college. Our goal for every graduate: a job offer in one hand and a college acceptance in the other.`,
            `Applying takes about five minutes on your phone. There is no fee, and applying does not commit you to anything. If you have questions first, just reply to this email and a real person from our team will answer. ${OPT_OUT_EN}`,
          ],
          cta: { label: "Start your application", url: `${APP_URL}/login` },
          closing: `We would be honored to welcome your family. The ${campusName} Enrollment Team`,
        },
        {
          greeting: "Hola,",
          paragraphs: [
            `Usted nos contactó sobre ${campusName}, y tenemos noticias que vale la pena compartir: las solicitudes están abiertas, y los cupos se están llenando ahora.`,
            `${campusName} es una escuela pública gratuita donde los estudiantes obtienen credenciales de valor y adquieren experiencia profesional con empleadores locales mientras se preparan para la universidad. Nuestra meta para cada graduado: una oferta de trabajo en una mano y una aceptación universitaria en la otra.`,
            `La solicitud toma unos cinco minutos desde su teléfono. No tiene costo, y aplicar no le compromete a nada. Si primero tiene preguntas, simplemente responda a este correo y una persona real de nuestro equipo le contestará. ${OPT_OUT_ES}`,
          ],
          cta: { label: "Iniciar su solicitud", url: `${APP_URL}/login` },
          closing: `Sería un honor darle la bienvenida a su familia. El Equipo de Inscripción de ${campusName}`,
        },
        header
      );
      return withCampaignFooter({
        subject: `Your seat at ${campusName} is waiting / Su cupo en ${campusName} le espera`,
        html,
        text,
      });
    }

    case "event_invite": {
      const eventName = payload.eventName ?? "an upcoming event";
      const eventDate = payload.eventDate ?? "";
      const eventLocation = payload.eventLocation ?? "";
      const whenWhere = [eventDate, eventLocation].filter(Boolean).join(" · ");
      const { html, text } = renderEmail(
        {
          greeting: "Hello,",
          paragraphs: [
            `You're invited! ${campusName} is hosting ${eventName}${whenWhere ? ` (${whenWhere})` : ""}, and we'd love for your family to join us.`,
            `Come meet our team, see what career-connected learning looks like, and get every question answered in person. Families and students are both welcome.`,
            `Just reply to this email to let us know you're coming, or come as you are. ${OPT_OUT_EN}`,
          ],
          cta: { label: "Learn more and apply", url: `${APP_URL}` },
          closing: `Hope to see you there! The ${campusName} Team`,
        },
        {
          greeting: "Hola,",
          paragraphs: [
            `¡Está invitado/a! ${campusName} tendrá ${eventName}${whenWhere ? ` (${whenWhere})` : ""}, y nos encantaría que su familia nos acompañe.`,
            `Venga a conocer a nuestro equipo, vea cómo es el aprendizaje conectado con carreras y obtenga respuestas a todas sus preguntas en persona. Las familias y los estudiantes son bienvenidos.`,
            `Simplemente responda a este correo para avisarnos que vendrá, o venga sin avisar. ${OPT_OUT_ES}`,
          ],
          cta: { label: "Conozca más y aplique", url: `${APP_URL}` },
          closing: `¡Esperamos verle allí! El Equipo de ${campusName}`,
        },
        header
      );
      return withCampaignFooter({
        subject: `You're invited: ${eventName} at ${campusName} / Está invitado/a`,
        html,
        text,
      });
    }

    case "deadline": {
      const deadline = payload.deadline ?? "soon";
      const { html, text } = renderEmail(
        {
          greeting: "Hello,",
          paragraphs: [
            `A quick, friendly reminder: the application window at ${campusName} closes ${deadline}.`,
            `Applying takes about five minutes on your phone, there is no fee, and applying does not commit you to anything. It simply keeps your family's options open.`,
            `If anything is standing in your way, whether it's questions, documents, or language, reply to this email and a real person will help. ${OPT_OUT_EN}`,
          ],
          cta: { label: "Apply before the deadline", url: `${APP_URL}/login` },
          closing: `We're here to help. The ${campusName} Enrollment Team`,
        },
        {
          greeting: "Hola,",
          paragraphs: [
            `Un recordatorio rápido y amistoso: el período de solicitudes en ${campusName} cierra ${deadline}.`,
            `La solicitud toma unos cinco minutos desde su teléfono, no tiene costo, y aplicar no le compromete a nada. Simplemente mantiene abiertas las opciones de su familia.`,
            `Si algo se lo impide, ya sean preguntas, documentos o idioma, responda a este correo y una persona real le ayudará. ${OPT_OUT_ES}`,
          ],
          cta: { label: "Aplique antes de la fecha límite", url: `${APP_URL}/login` },
          closing: `Estamos para ayudarle. El Equipo de Inscripción de ${campusName}`,
        },
        header
      );
      return withCampaignFooter({
        subject: `Applications close ${deadline} at ${campusName} / Las solicitudes cierran pronto`,
        html,
        text,
      });
    }

    case "custom": {
      const paragraphsEn = (payload.bodyEn ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      const paragraphsEs = (payload.bodyEs ?? "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      const cta =
        payload.ctaLabel && payload.ctaUrl
          ? { label: payload.ctaLabel, url: payload.ctaUrl }
          : undefined;
      const { html, text } = renderEmail(
        {
          greeting: "Hello,",
          paragraphs: [...paragraphsEn, OPT_OUT_EN],
          cta,
          closing: `Warmly, the ${campusName} Team`,
        },
        {
          greeting: "Hola,",
          paragraphs: [...(paragraphsEs.length > 0 ? paragraphsEs : paragraphsEn), OPT_OUT_ES],
          cta,
          closing: `Cordialmente, el Equipo de ${campusName}`,
        },
        header
      );
      return withCampaignFooter({
        subject: payload.subject || `A note from ${campusName}`,
        html,
        text,
      });
    }
  }
}

export function eventRsvpConfirmation({
  guardianFirstName,
  campusName,
  eventTitle,
  whenText,
  location,
}: {
  guardianFirstName?: string;
  campusName: string;
  eventTitle: string;
  whenText: string;
  location?: string;
}): EmailTemplate {
  const whereEn = location ? ` at ${location}` : "";
  const { html, text } = renderEmail(
    {
      greeting: guardianFirstName ? `Hi ${guardianFirstName},` : "Hello,",
      paragraphs: [
        `You're registered for ${eventTitle} at ${campusName}. We're looking forward to meeting you!`,
        `When: ${whenText}${location ? `\nWhere: ${location}` : ""}`,
        "If your plans change or you have any questions, just reply to this email. See you soon!",
      ],
      closing: `Warmly, the ${campusName} Team`,
    },
    {
      greeting: guardianFirstName ? `Hola ${guardianFirstName},` : "Hola,",
      paragraphs: [
        `Está registrado/a para ${eventTitle} en ${campusName}. ¡Esperamos conocerle!`,
        `Cuándo: ${whenText}${location ? `\nDónde: ${location}` : ""}`,
        "Si sus planes cambian o tiene preguntas, simplemente responda a este correo. ¡Nos vemos pronto!",
      ],
      closing: `Cordialmente, el Equipo de ${campusName}`,
    }
  );
  return {
    subject: `You're registered: ${eventTitle}${whereEn} / Está registrado/a`,
    html,
    text,
  };
}

/**
 * Pre-event reminder — sent twice per RSVP by app/api/cron/event-followups:
 * once around 24h before starts_at ("day_before"), once around 2h before
 * ("starting_soon"). Urgency is derived from actual hours-until-event at
 * send time, not from which cron pass fired it, so a "day_before" reminder
 * that fires late (say, 10 hours out because the cron only runs daily)
 * never falsely claims "tomorrow" — it falls back to the neutral
 * "coming_soon" copy, which just states the real date/time.
 */
export function eventReminder({
  guardianFirstName,
  campusName,
  eventTitle,
  whenText,
  location,
  urgency,
}: {
  guardianFirstName?: string;
  campusName: string;
  eventTitle: string;
  whenText: string;
  location?: string;
  urgency: "day_before" | "starting_soon" | "coming_soon";
}): EmailTemplate {
  const openingEn =
    urgency === "day_before"
      ? `A friendly reminder: ${eventTitle} at ${campusName} is tomorrow!`
      : urgency === "starting_soon"
        ? `${eventTitle} at ${campusName} is starting soon!`
        : `A friendly reminder: ${eventTitle} at ${campusName} is coming up soon, on ${whenText}!`;
  const openingEs =
    urgency === "day_before"
      ? `Un recordatorio amistoso: ¡${eventTitle} en ${campusName} es mañana!`
      : urgency === "starting_soon"
        ? `${eventTitle} en ${campusName} está por comenzar!`
        : `Un recordatorio amistoso: ¡${eventTitle} en ${campusName} se acerca pronto, el ${whenText}!`;
  const { html, text } = renderEmail(
    {
      greeting: guardianFirstName ? `Hi ${guardianFirstName},` : "Hello,",
      paragraphs: [
        openingEn,
        `When: ${whenText}${location ? `\nWhere: ${location}` : ""}`,
        "We're looking forward to meeting you. If your plans change, just reply to this email.",
      ],
      closing: `See you soon! The ${campusName} Team`,
    },
    {
      greeting: guardianFirstName ? `Hola ${guardianFirstName},` : "Hola,",
      paragraphs: [
        openingEs,
        `Cuándo: ${whenText}${location ? `\nDónde: ${location}` : ""}`,
        "Esperamos conocerle. Si sus planes cambian, simplemente responda a este correo.",
      ],
      closing: `¡Nos vemos pronto! El Equipo de ${campusName}`,
    }
  );
  const subject =
    urgency === "day_before"
      ? `Tomorrow: ${eventTitle} / Mañana`
      : urgency === "starting_soon"
        ? `Starting soon: ${eventTitle} / Comienza pronto`
        : `Coming up soon: ${eventTitle} / Se acerca pronto`;
  return { subject, html, text };
}

/**
 * Post-event follow-up for a family who checked in. Sent once, the morning
 * after the event, by app/api/cron/event-followups. Leads with the apply
 * link since attendance is exactly the moment a warm lead is most ready to
 * apply.
 */
export function eventFollowupAttended({
  guardianFirstName,
  campusName,
  eventTitle,
}: {
  guardianFirstName?: string;
  campusName: string;
  eventTitle: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: guardianFirstName ? `Hi ${guardianFirstName},` : "Hello,",
      paragraphs: [
        `It was great to meet you at ${eventTitle}! Thank you for taking the time to visit ${campusName}.`,
        "If you're ready to take the next step, applying takes about five minutes on your phone. There's no fee, and it doesn't commit you to anything.",
      ],
      cta: { label: "Start your application", url: `${APP_URL}/login` },
      closing: `We'd love to welcome your family. The ${campusName} Team`,
    },
    {
      greeting: guardianFirstName ? `Hola ${guardianFirstName},` : "Hola,",
      paragraphs: [
        `¡Fue un gusto conocerle en ${eventTitle}! Gracias por tomarse el tiempo de visitar ${campusName}.`,
        "Si está listo(a) para el siguiente paso, la solicitud toma unos cinco minutos desde su teléfono. No tiene costo y no le compromete a nada.",
      ],
      cta: { label: "Iniciar su solicitud", url: `${APP_URL}/login` },
      closing: `Nos encantaría darle la bienvenida a su familia. El Equipo de ${campusName}`,
    }
  );
  return {
    subject: `Great to meet you at ${eventTitle}! / ¡Un gusto conocerle!`,
    html,
    text,
  };
}

/**
 * Post-event follow-up for a family who RSVP'd but never checked in. Sent
 * once, the morning after the event. Mentions the campus's next scheduled
 * upcoming event only when one genuinely exists (data-honesty rule — never
 * promise an event that isn't on the calendar); otherwise a general,
 * honest invite to /inquire.
 */
export function eventFollowupNoShow({
  guardianFirstName,
  campusName,
  eventTitle,
  nextEvent,
}: {
  guardianFirstName?: string;
  campusName: string;
  eventTitle: string;
  nextEvent?: { title: string; whenText: string; url: string };
}): EmailTemplate {
  const nextParagraphEn = nextEvent
    ? `We'd love to see you at our next one: ${nextEvent.title} on ${nextEvent.whenText}. Registering takes less than a minute.`
    : "We'd still love to connect. Reach out anytime and we'll find a time that works, or start an application whenever you're ready.";
  const nextParagraphEs = nextEvent
    ? `Nos encantaría verle en nuestro próximo evento: ${nextEvent.title}, el ${nextEvent.whenText}. Es fácil registrarse y toma menos de un minuto.`
    : "Nos encantaría conectar con usted. Contáctenos cuando guste y buscaremos un horario que funcione, o puede iniciar una solicitud cuando esté listo(a).";
  const cta = nextEvent
    ? { label: "Register for the next event", url: nextEvent.url }
    : { label: "Get in touch", url: `${APP_URL}/inquire` };
  const ctaEs = nextEvent
    ? { label: "Regístrese para el próximo evento", url: nextEvent.url }
    : { label: "Póngase en contacto", url: `${APP_URL}/inquire` };
  const { html, text } = renderEmail(
    {
      greeting: guardianFirstName ? `Hi ${guardianFirstName},` : "Hello,",
      paragraphs: [
        `We missed you at ${eventTitle}! We know plans change, and we didn't want that to be the end of the conversation.`,
        nextParagraphEn,
      ],
      cta,
      closing: `Hope to see you soon. The ${campusName} Team`,
    },
    {
      greeting: guardianFirstName ? `Hola ${guardianFirstName},` : "Hola,",
      paragraphs: [
        `¡Le extrañamos en ${eventTitle}! Sabemos que los planes cambian, y no queríamos que eso fuera el final de la conversación.`,
        nextParagraphEs,
      ],
      cta: ctaEs,
      closing: `Esperamos verle pronto. El Equipo de ${campusName}`,
    }
  );
  return {
    subject: `We missed you at ${eventTitle} / Le extrañamos`,
    html,
    text,
  };
}

// ─── Inquiry welcome (the one campus-editable message) ───────────────────────

/** Campus-authored replacement for the inquiry welcome's subject and body. */
export interface InquiryWelcomeOverride {
  subjectEn: string;
  subjectEs: string;
  bodyEn: string;
  bodyEs: string;
}

/**
 * Merge fields substituted in an edited subject or body. Anything else in
 * double braces is left as typed rather than blanked, so a misspelled token
 * shows up as itself instead of vanishing from the family's email.
 * Exported so the settings editor names exactly the tokens that work.
 */
export const INQUIRY_WELCOME_MERGE_FIELDS = [
  { token: "{{first_name}}", label: "the family's first name" },
  { token: "{{campus_name}}", label: "the campus name" },
] as const;

/** Stand-in used to build INQUIRY_WELCOME_DEFAULT_TEXT below. */
const CAMPUS_NAME_TOKEN = "{{campus_name}}";

/**
 * The built-in copy, written once as a function of the campus name. The email
 * that sends and the default text the settings editor pre-fills both come
 * from these literals — the send passes the real campus name, the editor
 * default passes the {{campus_name}} token — so the two cannot drift.
 */
function inquiryWelcomeSubjects(campusName: string): { en: string; es: string } {
  return {
    en: `Great to meet you at ${campusName}!`,
    es: `¡Un gusto conocerle en ${campusName}!`,
  };
}

function inquiryWelcomeParagraphs(campusName: string): { en: string[]; es: string[] } {
  return {
    en: [
      `Thank you for your interest in ${campusName}! We're excited to tell you more about what makes our school special: career-connected learning, real industry partnerships, and a personalized pathway for every student.`,
      "Someone from our enrollment team will reach out personally soon. In the meantime, you can start an application anytime. It takes just a few minutes on your phone.",
    ],
    es: [
      `¡Gracias por su interés en ${campusName}! Nos encantaría contarle más sobre lo que hace especial a nuestra escuela: aprendizaje conectado con carreras, alianzas reales con la industria y un camino personalizado para cada estudiante.`,
      "Alguien de nuestro equipo de inscripción se comunicará con usted personalmente pronto. Mientras tanto, puede iniciar una solicitud en cualquier momento. Toma solo unos minutos desde su teléfono.",
    ],
  };
}

/**
 * The built-in copy in storage shape: paragraphs separated by a blank line,
 * matching campus_message_override.body_en / body_es. This is what the editor
 * shows a campus that has never overridden the message.
 */
export const INQUIRY_WELCOME_DEFAULT_TEXT: InquiryWelcomeOverride = {
  subjectEn: inquiryWelcomeSubjects(CAMPUS_NAME_TOKEN).en,
  subjectEs: inquiryWelcomeSubjects(CAMPUS_NAME_TOKEN).es,
  bodyEn: inquiryWelcomeParagraphs(CAMPUS_NAME_TOKEN).en.join("\n\n"),
  bodyEs: inquiryWelcomeParagraphs(CAMPUS_NAME_TOKEN).es.join("\n\n"),
};

/**
 * A stored body is plain text whose paragraphs are separated by a blank line.
 * CRLF is normalized first: a textarea posted from a Windows browser sends
 * \r\n, and "\r\n\r\n" has to split the same way "\n\n" does.
 */
export function splitBodyIntoParagraphs(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export function applyInquiryMergeFields(
  value: string,
  values: { firstName?: string; campusName: string }
): string {
  return value.replace(/\{\{\s*(first_name|campus_name)\s*\}\}/g, (_match, field: string) =>
    field === "first_name" ? values.firstName ?? "" : values.campusName
  );
}

export function inquiryWelcome({
  guardianFirstName,
  campusName,
  campusLogoUrl,
  override,
}: {
  guardianFirstName?: string;
  campusName: string;
  campusLogoUrl?: string;
  /**
   * Campus-authored subject and body. The greeting, the button, and the
   * closing are never taken from an override: the call-to-action link and the
   * branding around it cannot be broken by an edit. With no override the
   * output is byte-identical to the built-in message.
   */
  override?: InquiryWelcomeOverride;
}): EmailTemplate {
  const subjects = inquiryWelcomeSubjects(campusName);
  const defaults = inquiryWelcomeParagraphs(campusName);
  const merge = (value: string) =>
    applyInquiryMergeFields(value, { firstName: guardianFirstName, campusName });

  // An override that trims down to nothing falls back to the built-in copy.
  // Validation in lib/mutations/message-overrides.ts already refuses to store
  // one, but a send is not the place to discover a bad row.
  const overrideEn = override ? splitBodyIntoParagraphs(merge(override.bodyEn)) : [];
  const overrideEs = override ? splitBodyIntoParagraphs(merge(override.bodyEs)) : [];
  const subjectEn = (override && merge(override.subjectEn).trim()) || subjects.en;
  const subjectEs = (override && merge(override.subjectEs).trim()) || subjects.es;

  const { html, text } = renderEmail(
    {
      greeting: guardianFirstName ? `Hello ${guardianFirstName},` : "Hello,",
      paragraphs: overrideEn.length > 0 ? overrideEn : defaults.en,
      cta: { label: "Start an application", url: `${APP_URL}/login` },
      closing: "Warmly, the Rooted Schools Enrollment Team",
    },
    {
      greeting: guardianFirstName ? `Hola ${guardianFirstName},` : "Hola,",
      paragraphs: overrideEs.length > 0 ? overrideEs : defaults.es,
      cta: { label: "Iniciar una solicitud", url: `${APP_URL}/login` },
      closing: "Cordialmente, el Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: `${subjectEn} / ${subjectEs}`,
    html,
    text,
  };
}

export function leadReengagement({
  guardianFirstName,
  campusName,
  campusLogoUrl,
}: {
  guardianFirstName?: string;
  campusName: string;
  campusLogoUrl?: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: guardianFirstName ? `Hello ${guardianFirstName},` : "Hello,",
      paragraphs: [
        `We haven't heard from you in a little while, and we wanted to check in. Seats at ${campusName} are filled on a rolling basis, and we'd hate for your family to miss out.`,
        "If you have questions about our career pathways, transportation, the lottery, or anything at all, just reply to this email and a real person from our team will answer.",
      ],
      cta: { label: "Start an application", url: `${APP_URL}/login` },
      closing: "Warmly, the Rooted Schools Enrollment Team",
    },
    {
      greeting: guardianFirstName ? `Hola ${guardianFirstName},` : "Hola,",
      paragraphs: [
        `No hemos sabido de usted en un tiempo y queríamos saludarle. Los cupos en ${campusName} se asignan de forma continua, y no quisiéramos que su familia se quede sin el suyo.`,
        "Si tiene preguntas sobre nuestros caminos de carrera, transporte, la lotería, o lo que sea, simplemente responda a este correo y una persona real de nuestro equipo le contestará.",
      ],
      cta: { label: "Iniciar una solicitud", url: `${APP_URL}/login` },
      closing: "Cordialmente, el Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return withCampaignFooter({
    subject: `Still thinking about ${campusName}? We're here / ¿Aún considerando ${campusName}?`,
    html,
    text,
  });
}

export function registrationNudge({
  studentFirstName,
  campusName,
  missingNames,
  campusLogoUrl,
}: {
  studentFirstName?: string;
  campusName: string;
  /** Names of required items still incomplete (shown as-is in both languages). */
  missingNames: string[];
  campusLogoUrl?: string;
}): EmailTemplate {
  const shown = missingNames.slice(0, 4);
  const more = missingNames.length - shown.length;
  const listEn = shown.join(", ") + (more > 0 ? ` and ${more} more` : "");
  const listEs = shown.join(", ") + (more > 0 ? ` y ${more} más` : "");
  const { html, text } = renderEmail(
    {
      greeting: "Hello,",
      paragraphs: [
        `You're almost done! ${studentEn(studentFirstName)}'s registration at ${campusName} is still waiting on: ${listEn}.`,
        "Completing these items secures your student's seat. Most can be finished right from your phone in a few minutes, and we're happy to help if anything is confusing.",
      ],
      cta: { label: "Finish registration", url: `${APP_URL}/family/registration` },
      closing: "Warmly, the Rooted Schools Enrollment Team",
    },
    {
      greeting: "Hola,",
      paragraphs: [
        `¡Ya casi termina! La inscripción de ${studentEs(studentFirstName)} en ${campusName} todavía está pendiente de: ${listEs}.`,
        "Completar estos pasos asegura el cupo de su estudiante. La mayoría se pueden terminar desde su teléfono en pocos minutos, y con gusto le ayudamos si algo no está claro.",
      ],
      cta: { label: "Terminar la inscripción", url: `${APP_URL}/family/registration` },
      closing: "Cordialmente, el Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: `Almost done: a few registration items remain / Faltan algunos pasos de inscripción`,
    html,
    text,
  };
}

/**
 * "Keep the seat" — one warm touch during the summer melt window: sent once,
 * 2+ days after registration is fully verified, before the school year
 * starts. The point isn't another task for the family; it's a congratulations
 * plus a preview of what's coming so a fully-registered family doesn't go
 * quiet and drift away before the first day. See app/api/cron/keep-the-seat.
 */
export function keepTheSeat({
  studentFirstName,
  campusName,
  startDate,
  campusLogoUrl,
}: {
  studentFirstName?: string;
  campusName: string;
  /** ISO date string for the school year's first day, when known. */
  startDate?: string;
  campusLogoUrl?: string;
}): EmailTemplate {
  const startEn = startDate ? formatDateEn(startDate) : undefined;
  const startEs = startDate ? formatDateEs(startDate) : undefined;
  const { html, text } = renderEmail(
    {
      greeting: "Congratulations, registration is done!",
      paragraphs: [
        `${studentEn(studentFirstName)}'s registration at ${campusName} is complete and verified for the coming school year. Thank you for completing every step. That was the hardest part, and it's behind you. Our team is now finishing a final placement review, and there is nothing more you need to do right now.`,
        `Here's what's next: over the summer, watch your email and phone for orientation dates, schedule details, and a few "what to bring" reminders${
          startEn ? ` before the first day of school on ${startEn}` : ""
        }. Just keep an eye out for our updates.`,
      ],
      cta: { label: "View your enrollment", url: `${APP_URL}/family/registration` },
      closing: "We can't wait to welcome you this fall. The Rooted Schools Enrollment Team",
    },
    {
      greeting: "Felicidades, ¡la inscripción está completa!",
      paragraphs: [
        `La inscripción de ${studentEs(studentFirstName)} en ${campusName} está completa y verificada para el próximo año escolar. Gracias por completar cada paso. Esa era la parte más difícil, y ya quedó atrás. Nuestro equipo está terminando ahora una revisión final de colocación, y no necesita hacer nada más por el momento.`,
        `Esto es lo que sigue: durante el verano, esté atento(a) a su correo y teléfono para las fechas de orientación, los detalles del horario y algunos recordatorios de "qué traer"${
          startEs ? ` antes del primer día de clases el ${startEs}` : ""
        }. Solo esté pendiente de nuestras actualizaciones.`,
      ],
      cta: { label: "Ver su inscripción", url: `${APP_URL}/family/registration` },
      closing: "Esperamos darle la bienvenida este otoño. El Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: `You're all set at ${campusName}, here's what's next / Ya está todo listo`,
    html,
    text,
  };
}

/**
 * Spring re-enrollment intent pulse — asks a family with a currently active
 * enrollment a one-tap question: is your student coming back next year?
 * Sent only when staff trigger it (no automated cron — spring timing is a
 * human decision). Links to the one-tap response page at /family/reenrollment.
 */
export function reenrollmentPulse({
  studentFirstName,
  campusName,
  nextSchoolYearName,
  campusLogoUrl,
}: {
  studentFirstName?: string;
  campusName: string;
  /** Name of the upcoming school year, when a next-year window already exists. */
  nextSchoolYearName?: string;
  campusLogoUrl?: string;
}): EmailTemplate {
  const yearEn = nextSchoolYearName ? ` for ${nextSchoolYearName}` : " next year";
  const yearEs = nextSchoolYearName ? ` para ${nextSchoolYearName}` : " el próximo año";
  const { html, text } = renderEmail(
    {
      greeting: "Is your student coming back next year?",
      paragraphs: [
        `We're planning seats${yearEn} and want to hold ${studentEn(studentFirstName)}'s spot at ${campusName}. It only takes one tap to let us know.`,
        `Log in to your family portal and tap "Yes, returning," "Still deciding," or "Not returning," whichever fits right now. You can change your answer anytime before we send a formal seat offer.`,
      ],
      cta: { label: "Answer now", url: `${APP_URL}/family/reenrollment` },
      closing: "Thank you for helping us plan ahead. The Rooted Schools Enrollment Team",
    },
    {
      greeting: "¿Su estudiante regresará el próximo año?",
      paragraphs: [
        `Estamos planificando los cupos${yearEs} y queremos reservar el lugar de ${studentEs(studentFirstName)} en ${campusName}. Solo toma un toque para avisarnos.`,
        `Inicie sesión en su portal familiar y toque "Sí, regresa", "Aún decidiendo" o "No regresa", lo que corresponda en este momento. Puede cambiar su respuesta en cualquier momento antes de que enviemos una oferta formal de cupo.`,
      ],
      cta: { label: "Responder ahora", url: `${APP_URL}/family/reenrollment` },
      closing: "Gracias por ayudarnos a planificar con anticipación. El Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: `Is ${studentFirstName ?? "your student"} returning to ${campusName}? / ¿Regresa el próximo año?`,
    html,
    text,
  };
}

export function waitlistPositionImproved({
  studentFirstName,
  campusName,
  position,
  campusLogoUrl,
}: {
  studentFirstName?: string;
  campusName: string;
  position: number;
  campusLogoUrl?: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: "Good news!",
      paragraphs: [
        `${studentEn(studentFirstName)} has moved up the waitlist at ${campusName} and is now #${position} in line.`,
        "Seats can open at any time, and families near the front of the list are contacted first. You can check your position anytime in your family portal. No action is needed right now.",
      ],
      cta: { label: "View your dashboard", url: `${APP_URL}/family/dashboard` },
      closing: "Warmly, the Rooted Schools Enrollment Team",
    },
    {
      greeting: "¡Buenas noticias!",
      paragraphs: [
        `${studentEs(studentFirstName)} ha avanzado en la lista de espera en ${campusName} y ahora está en el puesto #${position}.`,
        "Los cupos pueden abrirse en cualquier momento, y las familias al frente de la lista son contactadas primero. Puede consultar su posición en cualquier momento en su portal familiar. No se requiere ninguna acción por ahora.",
      ],
      cta: { label: "Ver su panel", url: `${APP_URL}/family/dashboard` },
      closing: "Cordialmente, el Equipo de Inscripción de Rooted Schools",
    },
    { campusLogoUrl, campusName }
  );
  return {
    subject: `Waitlist update: now #${position} in line / Actualización de la lista de espera`,
    html,
    text,
  };
}
