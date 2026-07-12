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

function formatDateEn(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDateEs(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
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
 * Render the shared bilingual layout: English block, divider, Spanish block.
 */
function renderEmail(en: Section, es: Section): { html: string; text: string } {
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

  const html = `
<div style="margin:0 auto;max-width:600px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${TEXT_COLOR};padding:24px;">
  <div style="border-top:4px solid ${BRAND_GREEN};padding-top:24px;">
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
}: {
  studentFirstName?: string;
  campusName: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: "Hello,",
      paragraphs: [
        `We've received your enrollment application for ${studentEn(studentFirstName)} at ${campusName}. Thank you for choosing us!`,
        `Our enrollment team will review the application and reach out with next steps. You can check the status anytime in your family portal. If more families apply than we have seats, a fair random lottery decides placement — you can read exactly how it works at ${APP_URL}/how-the-lottery-works.`,
      ],
      cta: { label: "View your application", url: `${APP_URL}/family/applications` },
      closing: "Warmly, the Rooted Schools Enrollment Team",
    },
    {
      greeting: "Hola,",
      paragraphs: [
        `Hemos recibido su solicitud de inscripción para ${studentEs(studentFirstName)} en ${campusName}. ¡Gracias por elegirnos!`,
        `Nuestro equipo de inscripción revisará la solicitud y se comunicará con usted con los próximos pasos. Puede consultar el estado en cualquier momento en su portal familiar. Si aplican más familias que los cupos disponibles, una lotería aleatoria y justa decide los lugares — puede leer exactamente cómo funciona en ${APP_URL}/how-the-lottery-works.`,
      ],
      cta: { label: "Ver su solicitud", url: `${APP_URL}/family/applications` },
      closing: "Cordialmente, el Equipo de Inscripción de Rooted Schools",
    }
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
}: {
  studentFirstName?: string;
  campusName: string;
  expiresAt: string;
}): EmailTemplate {
  const deadlineEn = formatDateEn(expiresAt);
  const deadlineEs = formatDateEs(expiresAt);
  const { html, text } = renderEmail(
    {
      greeting: "Congratulations!",
      paragraphs: [
        `A seat has been offered for ${studentEn(studentFirstName)} at ${campusName}.`,
        `Please respond by ${deadlineEn} to secure the spot. If we don't hear from you by then, the seat may be offered to another family.`,
      ],
      cta: { label: "Respond to your offer", url: `${APP_URL}/family/offers` },
      closing: "We hope to welcome you soon! — the Rooted Schools Enrollment Team",
    },
    {
      greeting: "¡Felicidades!",
      paragraphs: [
        `Se ha ofrecido un cupo para ${studentEs(studentFirstName)} en ${campusName}.`,
        `Por favor responda antes del ${deadlineEs} para asegurar el cupo. Si no recibimos su respuesta para esa fecha, el cupo podría ofrecerse a otra familia.`,
      ],
      cta: { label: "Responder a su oferta", url: `${APP_URL}/family/offers` },
      closing: "¡Esperamos darle la bienvenida pronto! — el Equipo de Inscripción de Rooted Schools",
    }
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
}: {
  studentFirstName?: string;
  campusName: string;
  expiresAt: string;
}): EmailTemplate {
  const deadlineEn = formatDateEn(expiresAt);
  const deadlineEs = formatDateEs(expiresAt);
  const { html, text } = renderEmail(
    {
      greeting: "Hello,",
      paragraphs: [
        `A friendly reminder: the seat offer for ${studentEn(studentFirstName)} at ${campusName} expires on ${deadlineEn}.`,
        "We'd love to save this spot for your family, but we need your response before the deadline. It only takes a minute to accept or decline online.",
      ],
      cta: { label: "Respond to your offer", url: `${APP_URL}/family/offers` },
      closing: "We're here if you have questions. — the Rooted Schools Enrollment Team",
    },
    {
      greeting: "Hola,",
      paragraphs: [
        `Un recordatorio amistoso: la oferta de cupo para ${studentEs(studentFirstName)} en ${campusName} vence el ${deadlineEs}.`,
        "Nos encantaría guardar este cupo para su familia, pero necesitamos su respuesta antes de la fecha límite. Solo toma un minuto aceptar o rechazar en línea.",
      ],
      cta: { label: "Responder a su oferta", url: `${APP_URL}/family/offers` },
      closing: "Estamos aquí si tiene preguntas. — el Equipo de Inscripción de Rooted Schools",
    }
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
}: {
  studentFirstName?: string;
  campusName: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: "Congratulations!",
      paragraphs: [
        `You've accepted the seat offer for ${studentEn(studentFirstName)} at ${campusName}. We're thrilled to have your family join us!`,
        "The next step is registration: please log in to complete the enrollment packet so everything is ready for the first day of school.",
      ],
      cta: { label: "Start registration", url: `${APP_URL}/family/registration` },
      closing: "Welcome to the Rooted Schools family! — the Enrollment Team",
    },
    {
      greeting: "¡Felicidades!",
      paragraphs: [
        `Ha aceptado la oferta de cupo para ${studentEs(studentFirstName)} en ${campusName}. ¡Estamos encantados de que su familia se una a nosotros!`,
        "El siguiente paso es la inscripción: por favor inicie sesión para completar el paquete de inscripción y así tener todo listo para el primer día de clases.",
      ],
      cta: { label: "Comenzar la inscripción", url: `${APP_URL}/family/registration` },
      closing: "¡Bienvenidos a la familia de Rooted Schools! — el Equipo de Inscripción",
    }
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
}: {
  studentFirstName?: string;
  campusName: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: "Wonderful news!",
      paragraphs: [
        `All registration items have been verified, and ${studentEn(studentFirstName)} is officially enrolled at ${campusName}.`,
        "Welcome to the Rooted Schools family — we're proud to have you with us. Keep an eye on your portal for orientation details and next steps.",
      ],
      cta: { label: "View enrollment details", url: `${APP_URL}/family/registration` },
      closing: "See you soon! — the Rooted Schools Enrollment Team",
    },
    {
      greeting: "¡Excelentes noticias!",
      paragraphs: [
        `Todos los requisitos de inscripción han sido verificados, y ${studentEs(studentFirstName)} está oficialmente inscrito(a) en ${campusName}.`,
        "Bienvenidos a la familia de Rooted Schools — estamos orgullosos de tenerlos con nosotros. Esté atento(a) a su portal para detalles de orientación y próximos pasos.",
      ],
      cta: { label: "Ver detalles de inscripción", url: `${APP_URL}/family/registration` },
      closing: "¡Nos vemos pronto! — el Equipo de Inscripción de Rooted Schools",
    }
  );
  return {
    subject: "Enrollment complete! / ¡Inscripción completa!",
    html,
    text,
  };
}

export function waitlistPromoted({
  studentFirstName,
  campusName,
}: {
  studentFirstName?: string;
  campusName: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: "Great news!",
      paragraphs: [
        `A seat has opened at ${campusName}, and ${studentEn(studentFirstName)} has been offered a spot from the waitlist.`,
        "Please log in to review your offer and respond before the deadline — seats from the waitlist move quickly.",
      ],
      cta: { label: "Check your offers", url: `${APP_URL}/family/offers` },
      closing: "We hope to welcome you soon! — the Rooted Schools Enrollment Team",
    },
    {
      greeting: "¡Buenas noticias!",
      paragraphs: [
        `Se ha abierto un cupo en ${campusName}, y a ${studentEs(studentFirstName)} se le ha ofrecido un lugar desde la lista de espera.`,
        "Por favor inicie sesión para revisar su oferta y responder antes de la fecha límite — los cupos de la lista de espera se asignan rápidamente.",
      ],
      cta: { label: "Ver sus ofertas", url: `${APP_URL}/family/offers` },
      closing: "¡Esperamos darle la bienvenida pronto! — el Equipo de Inscripción de Rooted Schools",
    }
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
}: {
  studentFirstName?: string;
  campusName: string;
  position?: number;
}): EmailTemplate {
  const positionEn = position != null ? `currently #${position} on the waitlist` : "on the waitlist";
  const positionEs =
    position != null ? `actualmente en el puesto #${position} de la lista de espera` : "en la lista de espera";
  const { html, text } = renderEmail(
    {
      greeting: "The lottery results are in.",
      paragraphs: [
        `The lottery for ${campusName} has been held. ${studentEn(studentFirstName)} wasn't selected for an initial seat, but has a real place on the waitlist: ${positionEn}.`,
        `Seats often open in the first weeks — if a seat opens and ${studentEn(studentFirstName)} is next, we'll email and text you with time to accept. You can see the live position anytime in your family portal.`,
      ],
      cta: { label: "See your dashboard", url: `${APP_URL}/family/dashboard` },
      closing: "We know waiting is hard, and we're rooting for a seat to open. — the Rooted Schools Enrollment Team",
    },
    {
      greeting: "Ya tenemos los resultados del sorteo.",
      paragraphs: [
        `Se ha realizado el sorteo para ${campusName}. ${studentEs(studentFirstName)} no fue seleccionado(a) para un cupo inicial, pero tiene un lugar real en la lista de espera: ${positionEs}.`,
        `Los cupos suelen abrirse en las primeras semanas — si se abre un cupo y ${studentEs(studentFirstName)} es el/la siguiente, le enviaremos un correo electrónico y un mensaje de texto con tiempo para aceptar. Puede ver la posición en vivo en cualquier momento en su portal familiar.`,
      ],
      cta: { label: "Ver su panel", url: `${APP_URL}/family/dashboard` },
      closing:
        "Sabemos que esperar es difícil, y esperamos que se abra un cupo pronto. — el Equipo de Inscripción de Rooted Schools",
    }
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
    description: "Warm re-welcome for families who expressed interest before — applications are open, apply in five minutes.",
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
    description: "Write your own message — it's delivered inside the Rooted-branded bilingual wrapper.",
  },
};

export function renderCampaignEmail(
  templateKey: CampaignTemplateKey,
  payload: CampaignPayload,
  campusName: string
): EmailTemplate {
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
          closing: `We would be honored to welcome your family. — The ${campusName} Enrollment Team`,
        },
        {
          greeting: "Hola,",
          paragraphs: [
            `Usted nos contactó sobre ${campusName}, y tenemos noticias que vale la pena compartir: las solicitudes están abiertas, y los cupos se están llenando ahora.`,
            `${campusName} es una escuela pública gratuita donde los estudiantes obtienen credenciales de valor y adquieren experiencia profesional con empleadores locales mientras se preparan para la universidad. Nuestra meta para cada graduado: una oferta de trabajo en una mano y una aceptación universitaria en la otra.`,
            `La solicitud toma unos cinco minutos desde su teléfono. No tiene costo, y aplicar no le compromete a nada. Si primero tiene preguntas, simplemente responda a este correo y una persona real de nuestro equipo le contestará. ${OPT_OUT_ES}`,
          ],
          cta: { label: "Iniciar su solicitud", url: `${APP_URL}/login` },
          closing: `Sería un honor darle la bienvenida a su familia. — El Equipo de Inscripción de ${campusName}`,
        }
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
          closing: `Hope to see you there! — The ${campusName} Team`,
        },
        {
          greeting: "Hola,",
          paragraphs: [
            `¡Está invitado/a! ${campusName} tendrá ${eventName}${whenWhere ? ` (${whenWhere})` : ""}, y nos encantaría que su familia nos acompañe.`,
            `Venga a conocer a nuestro equipo, vea cómo es el aprendizaje conectado con carreras y obtenga respuestas a todas sus preguntas en persona. Las familias y los estudiantes son bienvenidos.`,
            `Simplemente responda a este correo para avisarnos que vendrá, o venga sin avisar. ${OPT_OUT_ES}`,
          ],
          cta: { label: "Conozca más y aplique", url: `${APP_URL}` },
          closing: `¡Esperamos verle allí! — El Equipo de ${campusName}`,
        }
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
            `Applying takes about five minutes on your phone, there is no fee, and applying does not commit you to anything — it simply keeps your family's options open.`,
            `If anything is standing in your way — questions, documents, language — reply to this email and a real person will help. ${OPT_OUT_EN}`,
          ],
          cta: { label: "Apply before the deadline", url: `${APP_URL}/login` },
          closing: `We're here to help. — The ${campusName} Enrollment Team`,
        },
        {
          greeting: "Hola,",
          paragraphs: [
            `Un recordatorio rápido y amistoso: el período de solicitudes en ${campusName} cierra ${deadline}.`,
            `La solicitud toma unos cinco minutos desde su teléfono, no tiene costo, y aplicar no le compromete a nada — simplemente mantiene abiertas las opciones de su familia.`,
            `Si algo se lo impide — preguntas, documentos, idioma — responda a este correo y una persona real le ayudará. ${OPT_OUT_ES}`,
          ],
          cta: { label: "Aplique antes de la fecha límite", url: `${APP_URL}/login` },
          closing: `Estamos para ayudarle. — El Equipo de Inscripción de ${campusName}`,
        }
      );
      return withCampaignFooter({
        subject: `Applications close ${deadline} — ${campusName} / Las solicitudes cierran pronto`,
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
        }
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

export function inquiryWelcome({
  guardianFirstName,
  campusName,
}: {
  guardianFirstName?: string;
  campusName: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: guardianFirstName ? `Hello ${guardianFirstName},` : "Hello,",
      paragraphs: [
        `Thank you for your interest in ${campusName}! We're excited to tell you more about what makes our school special — career-connected learning, real industry partnerships, and a personalized pathway for every student.`,
        "Someone from our enrollment team will reach out personally within a day. In the meantime, you can start an application anytime — it takes just a few minutes on your phone.",
      ],
      cta: { label: "Start an application", url: `${APP_URL}/login` },
      closing: "Warmly, the Rooted Schools Enrollment Team",
    },
    {
      greeting: guardianFirstName ? `Hola ${guardianFirstName},` : "Hola,",
      paragraphs: [
        `¡Gracias por su interés en ${campusName}! Nos encantaría contarle más sobre lo que hace especial a nuestra escuela — aprendizaje conectado con carreras, alianzas reales con la industria y un camino personalizado para cada estudiante.`,
        "Alguien de nuestro equipo de inscripción se comunicará con usted personalmente dentro de un día. Mientras tanto, puede iniciar una solicitud en cualquier momento — toma solo unos minutos desde su teléfono.",
      ],
      cta: { label: "Iniciar una solicitud", url: `${APP_URL}/login` },
      closing: "Cordialmente, el Equipo de Inscripción de Rooted Schools",
    }
  );
  return {
    subject: `Great to meet you! / ¡Un gusto conocerle! — ${campusName}`,
    html,
    text,
  };
}

export function leadReengagement({
  guardianFirstName,
  campusName,
}: {
  guardianFirstName?: string;
  campusName: string;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: guardianFirstName ? `Hello ${guardianFirstName},` : "Hello,",
      paragraphs: [
        `We haven't heard from you in a little while, and we wanted to check in. Seats at ${campusName} are filled on a rolling basis, and we'd hate for your family to miss out.`,
        "If you have questions — about our career pathways, transportation, the lottery, anything at all — just reply to this email and a real person from our team will answer.",
      ],
      cta: { label: "Start an application", url: `${APP_URL}/login` },
      closing: "Warmly, the Rooted Schools Enrollment Team",
    },
    {
      greeting: guardianFirstName ? `Hola ${guardianFirstName},` : "Hola,",
      paragraphs: [
        `No hemos sabido de usted en un tiempo y queríamos saludarle. Los cupos en ${campusName} se asignan de forma continua, y no quisiéramos que su familia se quede sin el suyo.`,
        "Si tiene preguntas — sobre nuestros caminos de carrera, transporte, la lotería, lo que sea — simplemente responda a este correo y una persona real de nuestro equipo le contestará.",
      ],
      cta: { label: "Iniciar una solicitud", url: `${APP_URL}/login` },
      closing: "Cordialmente, el Equipo de Inscripción de Rooted Schools",
    }
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
}: {
  studentFirstName?: string;
  campusName: string;
  /** Names of required items still incomplete (shown as-is in both languages). */
  missingNames: string[];
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
        "Completing these items secures your student's seat. Most can be finished right from your phone in a few minutes — and we're happy to help if anything is confusing.",
      ],
      cta: { label: "Finish registration", url: `${APP_URL}/family/registration` },
      closing: "Warmly, the Rooted Schools Enrollment Team",
    },
    {
      greeting: "Hola,",
      paragraphs: [
        `¡Ya casi termina! La inscripción de ${studentEs(studentFirstName)} en ${campusName} todavía está pendiente de: ${listEs}.`,
        "Completar estos pasos asegura el cupo de su estudiante. La mayoría se pueden terminar desde su teléfono en pocos minutos — y con gusto le ayudamos si algo no está claro.",
      ],
      cta: { label: "Terminar la inscripción", url: `${APP_URL}/family/registration` },
      closing: "Cordialmente, el Equipo de Inscripción de Rooted Schools",
    }
  );
  return {
    subject: `Almost done — a few registration items remain / Faltan algunos pasos de inscripción`,
    html,
    text,
  };
}

export function waitlistPositionImproved({
  studentFirstName,
  campusName,
  position,
}: {
  studentFirstName?: string;
  campusName: string;
  position: number;
}): EmailTemplate {
  const { html, text } = renderEmail(
    {
      greeting: "Good news!",
      paragraphs: [
        `${studentEn(studentFirstName)} has moved up the waitlist at ${campusName} and is now #${position} in line.`,
        "Seats can open at any time, and families near the front of the list are contacted first. You can check your position anytime in your family portal — no action is needed right now.",
      ],
      cta: { label: "View your dashboard", url: `${APP_URL}/family/dashboard` },
      closing: "Warmly, the Rooted Schools Enrollment Team",
    },
    {
      greeting: "¡Buenas noticias!",
      paragraphs: [
        `${studentEs(studentFirstName)} ha avanzado en la lista de espera en ${campusName} y ahora está en el puesto #${position}.`,
        "Los cupos pueden abrirse en cualquier momento, y las familias al frente de la lista son contactadas primero. Puede consultar su posición en cualquier momento en su portal familiar — no se requiere ninguna acción por ahora.",
      ],
      cta: { label: "Ver su panel", url: `${APP_URL}/family/dashboard` },
      closing: "Cordialmente, el Equipo de Inscripción de Rooted Schools",
    }
  );
  return {
    subject: `Waitlist update: now #${position} in line / Actualización de la lista de espera`,
    html,
    text,
  };
}
