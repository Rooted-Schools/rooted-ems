"use client";

import Link from "next/link";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useLocale } from "@/lib/i18n/locale-context";

/**
 * Public privacy policy. Two jobs: tell families plainly what happens to
 * their information, and satisfy Google's requirement that an OAuth app in
 * production link to a privacy policy.
 *
 * The copy is bilingual and lives here as a structured array rather than in
 * translations.ts: it is long, section-shaped, and edited as a document, the
 * same reasoning behind app/family/registration/policy-content.ts. Every
 * statement is written to match what the system actually does. It should have
 * a legal review before it is treated as final.
 */

interface Section {
  heading: { en: string; es: string };
  body: { en: string[]; es: string[] };
}

const UPDATED = { en: "Last updated: August 2026", es: "Última actualización: agosto de 2026" };

const INTRO = {
  en: "Rooted School Foundation and its schools (Rooted School Vancouver, C.R. Neal Academy, and Rooted Schools Cleveland) use this enrollment system to manage the path from a family's first inquiry through a student's enrollment. This policy explains what information we collect through it, how we use that information, who we share it with, and the choices you have. It applies to families and prospective students who use enroll.rootedschool.org.",
  es: "Rooted School Foundation y sus escuelas (Rooted School Vancouver, C.R. Neal Academy y Rooted Schools Cleveland) usan este sistema de inscripción para gestionar el proceso desde la primera consulta de una familia hasta la inscripción de un estudiante. Esta política explica qué información recopilamos, cómo la usamos, con quién la compartimos y las opciones que usted tiene. Se aplica a las familias y a los estudiantes que usan enroll.rootedschool.org.",
};

const SECTIONS: Section[] = [
  {
    heading: { en: "Information we collect", es: "Información que recopilamos" },
    body: {
      en: [
        "Family and guardian information: names, email addresses, phone numbers, home address, preferred language, and your relationship to the student.",
        "Student information: name, date of birth, grade, and, where you choose to provide them, details relevant to enrollment such as prior school, sibling relationships, and special-services or accommodation status.",
        "Documents you upload: records such as proof of residency, birth certificate, immunization records, and other files a school requires to complete registration.",
        "Account information: the email address or Google account you sign in with, so we can keep your application secure and let you return to it.",
        "Basic usage information: the system records actions taken on an application (for example when it was submitted or a document was verified) so staff can support you and keep an accurate record.",
      ],
      es: [
        "Información de la familia y del tutor: nombres, correos electrónicos, números de teléfono, domicilio, idioma preferido y su relación con el estudiante.",
        "Información del estudiante: nombre, fecha de nacimiento, grado y, cuando usted decide proporcionarlos, datos relevantes para la inscripción, como la escuela anterior, hermanos y estado de servicios especiales o adaptaciones.",
        "Documentos que usted sube: registros como comprobante de domicilio, acta de nacimiento, registros de vacunación y otros archivos que la escuela requiere para completar la inscripción.",
        "Información de la cuenta: el correo o la cuenta de Google con la que inicia sesión, para mantener su solicitud segura y permitirle regresar a ella.",
        "Información básica de uso: el sistema registra las acciones tomadas en una solicitud (por ejemplo, cuándo se envió o cuándo se verificó un documento) para que el personal pueda apoyarle y mantener un registro exacto.",
      ],
    },
  },
  {
    heading: { en: "How we use your information", es: "Cómo usamos su información" },
    body: {
      en: [
        "To process an inquiry, application, lottery entry, seat offer, and registration.",
        "To communicate with you about your application by email, text message (only if you consent), and messages inside the family portal.",
        "To run an enrollment lottery fairly and to keep the records that show it was run according to the school board's adopted policy.",
        "To meet the school's legal and reporting obligations as a public charter school.",
      ],
      es: [
        "Para procesar una consulta, una solicitud, la participación en el sorteo, una oferta de cupo y la inscripción.",
        "Para comunicarnos con usted sobre su solicitud por correo, mensaje de texto (solo si usted da su consentimiento) y mensajes dentro del portal familiar.",
        "Para realizar un sorteo de inscripción de manera justa y conservar los registros que demuestran que se realizó conforme a la política adoptada por la junta escolar.",
        "Para cumplir con las obligaciones legales y de reporte de la escuela como escuela pública chárter.",
      ],
    },
  },
  {
    heading: { en: "Student education records and FERPA", es: "Registros educativos del estudiante y FERPA" },
    body: {
      en: [
        "Once a student enrolls, the information about that student becomes part of their education record, protected under the Family Educational Rights and Privacy Act (FERPA) and applicable state law. We do not sell student information, and we do not use it for advertising.",
        "We collect only the information a school needs for enrollment and, where a question is not required, you may leave it blank.",
      ],
      es: [
        "Una vez que un estudiante se inscribe, la información sobre ese estudiante pasa a formar parte de su registro educativo, protegido por la Ley de Derechos Educativos y Privacidad Familiar (FERPA) y la ley estatal aplicable. No vendemos la información del estudiante ni la usamos para publicidad.",
        "Recopilamos solo la información que la escuela necesita para la inscripción y, cuando una pregunta no es obligatoria, usted puede dejarla en blanco.",
      ],
    },
  },
  {
    heading: { en: "Service providers we use", es: "Proveedores de servicios que usamos" },
    body: {
      en: [
        "We use a small number of trusted companies to operate this system. They process information only to provide their service to us, under their own security and privacy commitments:",
        "Supabase hosts the database, sign-in, and document storage for this system.",
        "Resend delivers our email, including confirmation codes and messages about your application.",
        "Twilio delivers text messages, and only to families who have given consent to be texted.",
        "Google provides the optional sign-in with a Google account.",
        "Sentry helps us find and fix technical errors and is configured not to receive personal information.",
      ],
      es: [
        "Usamos un pequeño número de empresas de confianza para operar este sistema. Ellas procesan la información únicamente para brindarnos su servicio, bajo sus propios compromisos de seguridad y privacidad:",
        "Supabase aloja la base de datos, el inicio de sesión y el almacenamiento de documentos de este sistema.",
        "Resend entrega nuestro correo, incluidos los códigos de confirmación y los mensajes sobre su solicitud.",
        "Twilio entrega los mensajes de texto, y solo a las familias que han dado su consentimiento para recibirlos.",
        "Google proporciona el inicio de sesión opcional con una cuenta de Google.",
        "Sentry nos ayuda a encontrar y corregir errores técnicos y está configurado para no recibir información personal.",
      ],
    },
  },
  {
    heading: { en: "How long we keep your information", es: "Cuánto tiempo conservamos su información" },
    body: {
      en: [
        "We keep your information for as long as it is needed to process your application and, if a student enrolls, to maintain their education record as required by law.",
        "For families who inquire but do not apply, and for applications that do not lead to enrollment, we keep the information only for the enrollment cycle and a limited period afterward, and then remove it. Records that show a lottery was run fairly are kept longer as required for accountability.",
      ],
      es: [
        "Conservamos su información durante el tiempo necesario para procesar su solicitud y, si un estudiante se inscribe, para mantener su registro educativo conforme lo exige la ley.",
        "Para las familias que consultan pero no solicitan, y para las solicitudes que no llevan a la inscripción, conservamos la información solo durante el ciclo de inscripción y un periodo limitado después, y luego la eliminamos. Los registros que demuestran que un sorteo se realizó de manera justa se conservan por más tiempo, según lo exige la rendición de cuentas.",
      ],
    },
  },
  {
    heading: { en: "Your choices and rights", es: "Sus opciones y derechos" },
    body: {
      en: [
        "You can view and update your application information by signing in to the family portal.",
        "You can choose whether to receive text messages, and you can unsubscribe from recruitment emails at any time using the link in those emails.",
        "You may ask us to review, correct, or remove your information. To do so, contact your school using the details below. If your student is enrolled, some records must be kept as required by law.",
      ],
      es: [
        "Usted puede ver y actualizar la información de su solicitud iniciando sesión en el portal familiar.",
        "Usted puede elegir si recibe mensajes de texto y puede cancelar la suscripción a los correos de reclutamiento en cualquier momento usando el enlace en esos correos.",
        "Usted puede pedirnos revisar, corregir o eliminar su información. Para hacerlo, comuníquese con su escuela usando los datos a continuación. Si su estudiante está inscrito, algunos registros deben conservarse según lo exige la ley.",
      ],
    },
  },
  {
    heading: { en: "Security", es: "Seguridad" },
    body: {
      en: [
        "Access to family and student information is limited to authorized school staff. Documents you upload are stored privately and are not publicly accessible. We use encryption in transit and access controls to protect your information.",
      ],
      es: [
        "El acceso a la información de la familia y del estudiante está limitado al personal escolar autorizado. Los documentos que usted sube se almacenan de forma privada y no son de acceso público. Usamos cifrado en tránsito y controles de acceso para proteger su información.",
      ],
    },
  },
  {
    heading: { en: "Children's privacy", es: "Privacidad de los menores" },
    body: {
      en: [
        "This system is used by parents and guardians to enroll their children. Information about a student is provided by the family and used only for enrollment and, once enrolled, as part of the student's education record.",
      ],
      es: [
        "Este sistema es usado por padres y tutores para inscribir a sus hijos. La información sobre un estudiante es proporcionada por la familia y se usa únicamente para la inscripción y, una vez inscrito, como parte del registro educativo del estudiante.",
      ],
    },
  },
  {
    heading: { en: "Changes to this policy", es: "Cambios a esta política" },
    body: {
      en: [
        "If we make a meaningful change to this policy, we will update the date at the top of this page. Please check back from time to time.",
      ],
      es: [
        "Si hacemos un cambio importante a esta política, actualizaremos la fecha en la parte superior de esta página. Le pedimos que la revise de vez en cuando.",
      ],
    },
  },
  {
    heading: { en: "Contact us", es: "Comuníquese con nosotros" },
    body: {
      en: [
        "For questions about this policy or about your information, contact the school your family is applying to. Each campus's email and address are listed on that campus's page, reachable from the home page.",
      ],
      es: [
        "Para preguntas sobre esta política o sobre su información, comuníquese con la escuela a la que su familia está solicitando. El correo y la dirección de cada campus aparecen en la página de ese campus, accesible desde la página principal.",
      ],
    },
  },
];

export function PrivacyClient() {
  const { locale } = useLocale();
  const es = locale === "es";
  const pick = (v: { en: string; es: string }) => (es ? v.es : v.en);

  return (
    <div className="min-h-screen bg-warm-white">
      <header className="bg-white border-b border-line">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="text-sm font-medium text-rooted-green hover:underline">
            &larr; {es ? "Volver al inicio" : "Back to home"}
          </Link>
          <LanguageToggle />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-ink tracking-tight" style={{ textWrap: "balance" }}>
          {es ? "Aviso de Privacidad" : "Privacy Policy"}
        </h1>
        <p className="text-sm text-stone-text mt-2">{pick(UPDATED)}</p>

        <p className="text-ink/80 leading-relaxed mt-8">{pick(INTRO)}</p>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.heading.en}>
              <h2 className="text-lg font-semibold text-ink border-b border-line pb-2">
                {pick(section.heading)}
              </h2>
              <div className="mt-4 space-y-3">
                {(es ? section.body.es : section.body.en).map((para, i) => (
                  <p key={i} className="text-ink/80 leading-relaxed">
                    {para}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-16 pt-6 border-t border-line text-sm text-stone-text">
          <span className="font-bold text-rooted-green">rooted</span>
          <span>schools</span>
          <span> &middot; {es ? "Aviso de Privacidad" : "Privacy Policy"}</span>
        </footer>
      </main>
    </div>
  );
}
