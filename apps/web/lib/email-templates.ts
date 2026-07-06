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
        "Our enrollment team will review the application and reach out with next steps. You can check the status anytime in your family portal.",
      ],
      cta: { label: "View your application", url: `${APP_URL}/family/applications` },
      closing: "Warmly, the Rooted Schools Enrollment Team",
    },
    {
      greeting: "Hola,",
      paragraphs: [
        `Hemos recibido su solicitud de inscripción para ${studentEs(studentFirstName)} en ${campusName}. ¡Gracias por elegirnos!`,
        "Nuestro equipo de inscripción revisará la solicitud y se comunicará con usted con los próximos pasos. Puede consultar el estado en cualquier momento en su portal familiar.",
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
  return {
    subject: `Still thinking about ${campusName}? We're here / ¿Aún considerando ${campusName}?`,
    html,
    text,
  };
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
