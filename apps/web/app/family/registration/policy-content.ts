/**
 * School-specific policy text for registration packet acknowledgment items.
 *
 * Sourced from RSV Student & Family Handbook 2025-2026 and adapted for each campus.
 * Keys match campus_id values in the database.
 *
 * Every policy carries an English and a Spanish body. Families e-sign a
 * legally binding acknowledgement here, so the Spanish text is a faithful,
 * complete translation of the English: same headings, same numbered clauses,
 * same obligations. Do not shorten or soften one side without the other.
 *
 * To update a policy: edit BOTH language bodies below and redeploy.
 * Future: migrate to packet_requirement.policy_text column for admin-editable policies.
 */

import type { Locale } from "@/lib/i18n/translations";

// Campus IDs
const RSV  = "33333333-0000-0000-0000-000000000001"; // Rooted School Vancouver
const RSSC = "33333333-0000-0000-0000-000000000002"; // C.R. Neal Academy (Columbia, SC)
const RSOH = "33333333-0000-0000-0000-000000000003"; // Rooted School Cleveland

/** One policy document, in both family-facing languages. */
export interface PolicyText {
  en: string;
  es: string;
}

export type PolicyMap = Record<string, PolicyText>; // item_type → bilingual policy text

// ─── RSV — Rooted School Vancouver ─────────────────────────────────────────

const RSV_POLICIES: PolicyMap = {

  tech_policy: {
    en: `TECHNOLOGY ACCEPTABLE USE POLICY
Rooted School Vancouver

Technology supports our mission to prepare students for high-demand careers while maintaining safety and appropriate use.

PERMITTED ACTIVITIES
• Academic research and coursework completion
• Educational software and approved applications
• Digital portfolio and project development
• Communication with teachers and classmates about schoolwork

PROHIBITED ACTIVITIES
• Social media during instructional time
• Gaming or entertainment content during school hours
• Accessing inappropriate content (violence, pornography, hate speech)
• Cyberbullying, harassment, or threatening communications
• Bypassing school internet filters or security measures
• Unauthorized sharing of personal information

1:1 DEVICE RESPONSIBILITIES
• Charge device nightly and bring fully charged daily
• Keep device in protective case when provided
• Report technical issues immediately to IT support
• Use technology for educational purposes only during school hours

CONSEQUENCES FOR MISUSE
1. Warning: Redirection and policy review
2. Restricted Access: Loss of privileges for remainder of day
3. Parent Conference: Technology use plan development
4. Extended Restriction: Loss of privileges 1–5 days
5. Major Violations: Possible suspension and loss of technology privileges

DATA PRIVACY & SECURITY
• Student data is protected under FERPA requirements
• Family consent is required for tools that collect personal information
• Privacy violations are reported immediately to administration

By signing below, I confirm that my student and I have read, understand, and agree to abide by this Acceptable Use Policy.`,
    es: `POLÍTICA DE USO ACEPTABLE DE LA TECNOLOGÍA
Rooted School Vancouver

La tecnología apoya nuestra misión de preparar a los estudiantes para carreras de alta demanda, manteniendo siempre la seguridad y el uso apropiado.

ACTIVIDADES PERMITIDAS
• Investigación académica y realización de los trabajos del curso
• Programas educativos y aplicaciones aprobadas
• Desarrollo de portafolios digitales y de proyectos
• Comunicación con maestros y compañeros sobre el trabajo escolar

ACTIVIDADES PROHIBIDAS
• Redes sociales durante el tiempo de instrucción
• Juegos o contenido de entretenimiento durante el horario escolar
• Acceder a contenido inapropiado (violencia, pornografía, discurso de odio)
• Ciberacoso, hostigamiento o comunicaciones amenazantes
• Evadir los filtros de internet o las medidas de seguridad de la escuela
• Compartir información personal sin autorización

RESPONSABILIDADES DEL DISPOSITIVO 1:1
• Cargar el dispositivo cada noche y traerlo con la batería completa todos los días
• Mantener el dispositivo en su funda protectora cuando se proporcione una
• Reportar de inmediato cualquier problema técnico al soporte de tecnología
• Usar la tecnología solo con fines educativos durante el horario escolar

CONSECUENCIAS POR EL MAL USO
1. Advertencia: redirección y repaso de la política
2. Acceso restringido: pérdida de privilegios por el resto del día
3. Conferencia con los padres: desarrollo de un plan de uso de la tecnología
4. Restricción extendida: pérdida de privilegios de 1 a 5 días
5. Faltas graves: posible suspensión y pérdida de los privilegios de tecnología

PRIVACIDAD Y SEGURIDAD DE LOS DATOS
• Los datos de los estudiantes están protegidos bajo los requisitos de FERPA (Ley de Derechos Educativos y Privacidad Familiar)
• Se requiere el consentimiento de la familia para las herramientas que recopilan información personal
• Las violaciones de la privacidad se reportan de inmediato a la administración

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído, entendemos y aceptamos cumplir con esta Política de Uso Aceptable.`,
  },

  handbook_ack: {
    en: `STUDENT & FAMILY HANDBOOK ACKNOWLEDGMENT
Rooted School Vancouver — 2025–2026

This handbook represents our shared commitment to student success, equity, and preparation for financial freedom. By working together — students, families, and school — we create an environment where every student can thrive.

By signing below, I confirm that:
• I have received and reviewed the Rooted School Vancouver Student & Family Handbook 2025–2026
• My student and I understand the policies, expectations, and procedures outlined in the handbook
• I understand that the handbook is reviewed annually and updates will be communicated

The handbook covers: attendance, academic programs, student-directed learning, project-based learning, behavior expectations, dress code, technology use, health and safety, and family engagement.

For questions about handbook policies, contact the front office at frontoffice@rootedschoolvancouver.org or 360-524-2842.

As a dedicated member of the Rooted School Vancouver community, my student pledges to abide by the Student Code of Conduct:
1. Willing Learner: Open-minded and receptive to new knowledge
2. Regular Attendance: Attending school consistently
3. Safe Learning Environment: Contributing to a safe and supportive community
4. Respectful Communication: Treating all community members with dignity
5. Responsible Technology Use: Using school technology ethically and appropriately`,
    es: `RECONOCIMIENTO DEL MANUAL DEL ESTUDIANTE Y LA FAMILIA
Rooted School Vancouver, 2025-2026

Este manual representa nuestro compromiso compartido con el éxito estudiantil, la equidad y la preparación para la libertad financiera. Al trabajar juntos, estudiantes, familias y escuela, creamos un ambiente donde cada estudiante puede prosperar.

Al firmar a continuación, confirmo que:
• He recibido y revisado el Manual del Estudiante y la Familia 2025-2026 de Rooted School Vancouver
• Mi estudiante y yo entendemos las políticas, las expectativas y los procedimientos descritos en el manual
• Entiendo que el manual se revisa cada año y que los cambios se comunicarán a las familias

El manual cubre: asistencia, programas académicos, aprendizaje dirigido por el estudiante, aprendizaje basado en proyectos, expectativas de comportamiento, código de vestimenta, uso de la tecnología, salud y seguridad, y participación de las familias.

Si tiene preguntas sobre las políticas del manual, comuníquese con la oficina principal en frontoffice@rootedschoolvancouver.org o al 360-524-2842.

Como miembro comprometido de la comunidad de Rooted School Vancouver, mi estudiante se compromete a cumplir con el Código de Conducta Estudiantil:
1. Estudiante dispuesto: tener la mente abierta y estar receptivo a nuevos conocimientos
2. Asistencia regular: asistir a la escuela de manera constante
3. Ambiente de aprendizaje seguro: contribuir a una comunidad segura y de apoyo
4. Comunicación respetuosa: tratar con dignidad a todos los miembros de la comunidad
5. Uso responsable de la tecnología: usar la tecnología de la escuela de manera ética y apropiada`,
  },

  discipline_policy: {
    en: `BEHAVIOR EXPECTATIONS & DISCIPLINE POLICY
Rooted School Vancouver

BEHAVIOR PHILOSOPHY
We use restorative practices to build community, teach responsibility, and repair harm when expectations are not met. Our goal is keeping students engaged in learning while building life skills.

SCHOOL-WIDE EXPECTATIONS
• Respect: Show consideration for self, others, and property
• Responsibility: Take ownership of actions and learning
• Safety: Maintain physical and emotional safety for all
• Growth: Embrace challenges and learn from mistakes

GRADUATED RESPONSE SYSTEM
Level 1 — Minor (Classroom-managed): Redirection, reflection, brief restorative conversation
Level 2 — Moderate (Classroom + admin): Restorative conference, family contact, behavior plan
Level 3 — Serious (Admin-managed): In-school suspension (1–3 days), restorative process required, family meeting
Level 4 — Severe (Admin + potential law enforcement): Out-of-school suspension (1–10 days), expulsion consideration, law enforcement if required

RESTORATIVE PRACTICES
• Restorative Circles: Used for community building and conflict resolution
• Peer Mediation: Trained student mediators assist in conflict resolution
• Restorative Conferences: Structured conversations to repair harm and restore relationships

By signing below, I confirm that my student and I have read and understand the behavior expectations and discipline policy for Rooted School Vancouver.`,
    es: `EXPECTATIVAS DE COMPORTAMIENTO Y POLÍTICA DISCIPLINARIA
Rooted School Vancouver

FILOSOFÍA DE COMPORTAMIENTO
Usamos prácticas restaurativas para construir comunidad, enseñar responsabilidad y reparar el daño cuando no se cumplen las expectativas. Nuestra meta es mantener a los estudiantes conectados con el aprendizaje mientras desarrollan habilidades para la vida.

EXPECTATIVAS PARA TODA LA ESCUELA
• Respeto: mostrar consideración por uno mismo, por los demás y por la propiedad
• Responsabilidad: hacerse cargo de sus acciones y de su aprendizaje
• Seguridad: mantener la seguridad física y emocional de todos
• Crecimiento: aceptar los retos y aprender de los errores

SISTEMA DE RESPUESTA GRADUAL
Nivel 1, leve (manejado en el salón de clases): redirección, reflexión, breve conversación restaurativa
Nivel 2, moderado (salón de clases y administración): conferencia restaurativa, contacto con la familia, plan de comportamiento
Nivel 3, serio (manejado por la administración): suspensión dentro de la escuela (1 a 3 días), proceso restaurativo obligatorio, reunión con la familia
Nivel 4, severo (administración y posible intervención de las autoridades): suspensión fuera de la escuela (1 a 10 días), consideración de expulsión, intervención de las autoridades si es necesario

PRÁCTICAS RESTAURATIVAS
• Círculos restaurativos: se usan para construir comunidad y resolver conflictos
• Mediación entre compañeros: estudiantes mediadores capacitados ayudan a resolver conflictos
• Conferencias restaurativas: conversaciones estructuradas para reparar el daño y restablecer las relaciones

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído y entendemos las expectativas de comportamiento y la política disciplinaria de Rooted School Vancouver.`,
  },

  media_release: {
    en: `PHOTO/VIDEO/MEDIA RELEASE CONSENT
Rooted School Vancouver

Rooted School Vancouver may photograph or video-record students during school activities for use in school publications, the school website, social media, newsletters, and promotional materials.

WHAT THIS COVERS
• School events, classroom activities, field trips, and extracurricular activities
• Use in print materials, digital publications, and social media platforms
• Internal school communications and community outreach

WHAT THIS DOES NOT COVER
• Your child's name will not be published alongside photos without separate written consent
• Images will not be sold or shared with third parties for commercial purposes
• Medical or sensitive situations will never be photographed

YOUR OPTIONS
By completing this form, you are indicating your consent preference. You may withdraw consent at any time by contacting the front office.

For questions, contact: frontoffice@rootedschoolvancouver.org or 360-524-2842`,
    es: `CONSENTIMIENTO PARA EL USO DE FOTOGRAFÍAS, VIDEO Y MEDIOS
Rooted School Vancouver

Rooted School Vancouver puede tomar fotografías o grabar en video a los estudiantes durante las actividades escolares para usarlas en publicaciones de la escuela, el sitio web de la escuela, las redes sociales, los boletines y los materiales promocionales.

QUÉ INCLUYE ESTE CONSENTIMIENTO
• Eventos escolares, actividades en el salón de clases, excursiones y actividades extracurriculares
• Uso en materiales impresos, publicaciones digitales y plataformas de redes sociales
• Comunicaciones internas de la escuela y difusión comunitaria

QUÉ NO INCLUYE ESTE CONSENTIMIENTO
• El nombre de su hijo o hija no se publicará junto a las fotografías sin un consentimiento por escrito por separado
• Las imágenes no se venderán ni se compartirán con terceros con fines comerciales
• Nunca se fotografiarán situaciones médicas ni situaciones delicadas

SUS OPCIONES
Al completar este formulario, usted indica su preferencia de consentimiento. Puede retirar su consentimiento en cualquier momento comunicándose con la oficina principal.

Si tiene preguntas, comuníquese con: frontoffice@rootedschoolvancouver.org o al 360-524-2842`,
  },

  field_trip: {
    en: `BLANKET FIELD TRIP PERMISSION
Rooted School Vancouver — 2025–2026 School Year

This annual permission form authorizes your student to participate in school-sponsored field trips and off-campus learning activities during the 2025–2026 school year.

WHAT IS COVERED
• Educational field trips within the Vancouver/Portland metropolitan area
• Career-connected learning visits (internship sites, college campuses, businesses)
• Community service and project-based learning events
• School-sponsored extracurricular travel

EXPECTATIONS DURING FIELD TRIPS
• Students are expected to follow all school behavior expectations while off campus
• Dress code applies during all field trips and professional visits
• Students may not use personal phones except when permitted by supervising staff
• Students who do not meet behavioral standards may lose field trip privileges

TRANSPORTATION
• School-arranged transportation will be used for field trips
• Families will be notified in advance of transportation arrangements

EMERGENCY CONTACT
School staff will carry student emergency information during all field trips. Please ensure your emergency contact information is current.

NOTE: Overnight trips and out-of-state travel require separate permission forms.

For questions, contact: frontoffice@rootedschoolvancouver.org or 360-524-2842`,
    es: `PERMISO GENERAL PARA EXCURSIONES ESCOLARES
Rooted School Vancouver, año escolar 2025-2026

Este formulario de permiso anual autoriza a su estudiante a participar en excursiones patrocinadas por la escuela y en actividades de aprendizaje fuera del plantel durante el año escolar 2025-2026.

QUÉ SE CUBRE
• Excursiones educativas dentro del área metropolitana de Vancouver y Portland
• Visitas de aprendizaje conectado a carreras (sitios de pasantías, campus universitarios, empresas)
• Servicio comunitario y eventos de aprendizaje basado en proyectos
• Viajes extracurriculares patrocinados por la escuela

EXPECTATIVAS DURANTE LAS EXCURSIONES
• Se espera que los estudiantes cumplan con todas las expectativas de comportamiento de la escuela mientras estén fuera del plantel
• El código de vestimenta se aplica durante todas las excursiones y visitas profesionales
• Los estudiantes no pueden usar teléfonos personales, salvo cuando el personal que supervisa lo permita
• Los estudiantes que no cumplan con las normas de comportamiento pueden perder el privilegio de participar en las excursiones

TRANSPORTE
• Se usará transporte organizado por la escuela para las excursiones
• Se avisará a las familias con anticipación sobre los arreglos de transporte

CONTACTO DE EMERGENCIA
El personal de la escuela llevará consigo la información de emergencia de los estudiantes durante todas las excursiones. Por favor asegúrese de que su información de contacto de emergencia esté actualizada.

NOTA: los viajes con pernoctación y los viajes fuera del estado requieren formularios de permiso por separado.

Si tiene preguntas, comuníquese con: frontoffice@rootedschoolvancouver.org o al 360-524-2842`,
  },

  internet_safety: {
    en: `INTERNET SAFETY AGREEMENT
Rooted School Vancouver

DIGITAL CITIZENSHIP COMMITMENT
As part of our commitment to preparing students for college and career success, Rooted School Vancouver provides students with access to the internet and digital tools. This agreement outlines expectations for safe, responsible, and ethical online behavior.

STUDENT COMMITMENTS
• Use the internet for educational purposes only during school hours
• Never share personal information (address, phone number, passwords) online
• Report unsafe, inappropriate, or uncomfortable online situations to a trusted adult
• Treat others online with the same respect you would show in person
• Never attempt to bypass school internet filters
• Protect school and personal devices from unauthorized access

SOCIAL MEDIA
• Social media use is not permitted during instructional time
• School devices may not be used to access personal social media accounts
• Students are responsible for their online conduct, including outside of school hours, when it impacts the school community

CYBERBULLYING PREVENTION
• Cyberbullying, harassment, and threatening communications are prohibited
• All online communications should be respectful and constructive
• Report any cyberbullying to a teacher, counselor, or administrator immediately

By signing below, I confirm that my student and I understand and agree to this Internet Safety Agreement.`,
    es: `ACUERDO DE SEGURIDAD EN INTERNET
Rooted School Vancouver

COMPROMISO DE CIUDADANÍA DIGITAL
Como parte de nuestro compromiso de preparar a los estudiantes para el éxito universitario y profesional, Rooted School Vancouver brinda a los estudiantes acceso a internet y a herramientas digitales. Este acuerdo describe las expectativas para un comportamiento en línea seguro, responsable y ético.

COMPROMISOS DEL ESTUDIANTE
• Usar internet solo con fines educativos durante el horario escolar
• Nunca compartir información personal (dirección, número de teléfono, contraseñas) en línea
• Informar a un adulto de confianza sobre cualquier situación en línea insegura, inapropiada o incómoda
• Tratar a los demás en línea con el mismo respeto que mostraría en persona
• Nunca intentar evadir los filtros de internet de la escuela
• Proteger los dispositivos escolares y personales del acceso no autorizado

REDES SOCIALES
• No se permite el uso de redes sociales durante el tiempo de instrucción
• Los dispositivos de la escuela no se pueden usar para acceder a cuentas personales de redes sociales
• Los estudiantes son responsables de su conducta en línea, incluso fuera del horario escolar, cuando esta afecta a la comunidad escolar

PREVENCIÓN DEL CIBERACOSO
• El ciberacoso, el hostigamiento y las comunicaciones amenazantes están prohibidos
• Toda comunicación en línea debe ser respetuosa y constructiva
• Reporte de inmediato cualquier caso de ciberacoso a un maestro, consejero o administrador

Al firmar a continuación, confirmo que mi estudiante y yo entendemos y aceptamos este Acuerdo de Seguridad en Internet.`,
  },

  anti_bullying: {
    en: `ANTI-BULLYING & HARASSMENT PREVENTION POLICY
Rooted School Vancouver — Harassment, Intimidation, and Bullying (HIB) Policy

Schools are meant to be safe and inclusive environments where all students are protected from Harassment, Intimidation, and Bullying (HIB), including in the classroom, on the school bus, in school sports, and during other school activities.

WHAT IS HIB?
HIB is any intentional electronic, written, verbal, or physical act that:
• Physically harms a student or damages their property
• Has the effect of substantially interfering with a student's education
• Is so severe, persistent, or pervasive that it creates an intimidating or threatening educational environment
• Has the effect of substantially disrupting the orderly operation of school

REPORTING HIB
If you witness or experience HIB, report it to any staff member. Our HIB Compliance Officer is:
Adrienne Lee-Kernell, School Leader
akernell@rootedschoolvancouver.org | 360-524-2842

WHAT HAPPENS AFTER A REPORT?
School staff will investigate and take appropriate action to stop HIB and prevent recurrence. The school must address any effects the behavior had on students, including eliminating hostile environments.

ROOTED'S COMMITMENT
Rooted School Vancouver prohibits any acts of discrimination, harassment, intimidation, or bullying. We are committed to creating a community built on respect, dignity, and belonging for every student.

By signing below, I confirm that my student and I have read and understand Rooted School Vancouver's Anti-Bullying and Harassment Prevention Policy.`,
    es: `POLÍTICA DE PREVENCIÓN DEL ACOSO Y EL HOSTIGAMIENTO
Rooted School Vancouver, Política sobre Hostigamiento, Intimidación y Acoso (HIB, por sus siglas en inglés)

Las escuelas deben ser ambientes seguros e inclusivos donde todos los estudiantes estén protegidos contra el hostigamiento, la intimidación y el acoso (HIB), incluso en el salón de clases, en el autobús escolar, en los deportes escolares y durante otras actividades de la escuela.

¿QUÉ ES EL HIB?
El HIB es cualquier acto intencional, electrónico, escrito, verbal o físico que:
• Daña físicamente a un estudiante o daña su propiedad
• Tiene el efecto de interferir de manera sustancial con la educación de un estudiante
• Es tan severo, persistente o generalizado que crea un ambiente educativo intimidante o amenazante
• Tiene el efecto de interrumpir de manera sustancial el funcionamiento ordenado de la escuela

CÓMO REPORTAR EL HIB
Si usted presencia o sufre HIB, repórtelo a cualquier miembro del personal. Nuestra Oficial de Cumplimiento de HIB es:
Adrienne Lee-Kernell, Líder Escolar
akernell@rootedschoolvancouver.org | 360-524-2842

¿QUÉ SUCEDE DESPUÉS DE UN REPORTE?
El personal de la escuela investigará y tomará las medidas apropiadas para detener el HIB y evitar que vuelva a ocurrir. La escuela debe atender cualquier efecto que la conducta haya tenido en los estudiantes, incluyendo la eliminación de ambientes hostiles.

EL COMPROMISO DE ROOTED
Rooted School Vancouver prohíbe todo acto de discriminación, hostigamiento, intimidación o acoso. Nos comprometemos a crear una comunidad basada en el respeto, la dignidad y la pertenencia para cada estudiante.

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído y entendemos la Política de Prevención del Acoso y el Hostigamiento de Rooted School Vancouver.`,
  },

  uniform_policy: {
    en: `DRESS CODE POLICY
Rooted School Vancouver

PURPOSE
Our dress code prepares students for professional environments while allowing personal expression and ensuring equitable, consistent enforcement.

DAILY ATTIRE REQUIREMENTS
Tops:
• Collared shirts, crew neck t-shirts, or blouses
• Sleeves required (no tank tops, spaghetti straps, or strapless)
• Necklines must not extend below collarbone
• Midriff must be covered when arms are raised above head
• No undergarments visible

Bottoms:
• Pants, chinos, or knee-length shorts/skirts
• Waistbands must sit at natural waist
• No rips, tears, or distressed denim

Footwear:
• Closed-toe shoes recommended for safety
• No bedroom slippers or unsafe footwear

PROFESSIONAL/INTERNSHIP ATTIRE
For internships and professional experiences:
• Rooted polo, professional button-down, or approved dress shirt
• Dress pants or chinos (no cargo pants, shorts, or jeans)
• Dress shoes, loafers, or professional sneakers

NEVER APPROPRIATE
• Clothing with drug, alcohol, tobacco, or weapon references
• Clothing with offensive, discriminatory, or sexually suggestive content
• Hoods worn inside the building during instructional time

ENFORCEMENT
Dress code is enforced with an equity-centered approach — private conversations only, never public correction. Economic barriers are addressed through school clothing assistance.

By signing below, I confirm that my student and I have read and understand the Rooted School Vancouver Dress Code Policy.`,
    es: `POLÍTICA DEL CÓDIGO DE VESTIMENTA
Rooted School Vancouver

PROPÓSITO
Nuestro código de vestimenta prepara a los estudiantes para ambientes profesionales, permitiendo a la vez la expresión personal y asegurando una aplicación equitativa y consistente.

REQUISITOS DE VESTIMENTA DIARIA
Prendas de la parte de arriba:
• Camisas con cuello, camisetas de cuello redondo o blusas
• Se requieren mangas (no se permiten camisetas sin mangas, de tirantes delgados ni sin tirantes)
• El escote no debe pasar por debajo de la clavícula
• El abdomen debe quedar cubierto al levantar los brazos por encima de la cabeza
• No debe verse la ropa interior

Prendas de la parte de abajo:
• Pantalones, pantalones chinos, o shorts y faldas hasta la rodilla
• La pretina debe quedar a la altura natural de la cintura
• No se permiten prendas rasgadas, rotas ni de mezclilla desgastada

Calzado:
• Se recomienda calzado cerrado por seguridad
• No se permiten pantuflas ni calzado inseguro

VESTIMENTA PROFESIONAL Y PARA PASANTÍAS
Para las pasantías y las experiencias profesionales:
• Playera polo de Rooted, camisa de botones profesional o camisa de vestir aprobada
• Pantalones de vestir o chinos (no se permiten pantalones tipo cargo, shorts ni mezclilla)
• Zapatos de vestir, mocasines o tenis de aspecto profesional

NUNCA ES APROPIADO
• Ropa con referencias a drogas, alcohol, tabaco o armas
• Ropa con contenido ofensivo, discriminatorio o sexualmente sugerente
• Capuchas puestas dentro del edificio durante el tiempo de instrucción

APLICACIÓN DE LA POLÍTICA
El código de vestimenta se aplica con un enfoque centrado en la equidad: solo conversaciones privadas, nunca correcciones en público. Las barreras económicas se atienden por medio de la asistencia con ropa que ofrece la escuela.

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído y entendemos la Política del Código de Vestimenta de Rooted School Vancouver.`,
  },

  ferpa_consent: {
    en: `FERPA DIRECTORY INFORMATION CONSENT
Rooted School Vancouver

THE FAMILY EDUCATIONAL RIGHTS AND PRIVACY ACT (FERPA)
FERPA affords parents and students over 18 years of age certain rights with respect to the student's education records. These rights include:
• The right to inspect and review the student's education records
• The right to request amendment of education records the parent believes are inaccurate
• The right to consent to disclosures of personally identifiable information contained in the student's education records

DIRECTORY INFORMATION
Rooted School Vancouver designates the following as Directory Information:
• Student's name
• Dates of attendance
• Grade level
• Participation in school activities and sports
• Honors and awards received

CONSENT OPTIONS
By completing this form, you are indicating your preference regarding the release of your student's directory information for school publications, the school website, and recognition programs.

You may opt out of directory information disclosure at any time by contacting the front office in writing.

For questions about FERPA rights and student records, contact:
frontoffice@rootedschoolvancouver.org | 360-524-2842

For additional information about FERPA: www.ed.gov/ferpa`,
    es: `CONSENTIMIENTO DE INFORMACIÓN DE DIRECTORIO BAJO FERPA
Rooted School Vancouver

LA LEY DE DERECHOS EDUCATIVOS Y PRIVACIDAD FAMILIAR (FERPA)
FERPA (Ley de Derechos Educativos y Privacidad Familiar) otorga a los padres y a los estudiantes mayores de 18 años ciertos derechos con respecto a los expedientes educativos del estudiante. Estos derechos incluyen:
• El derecho a inspeccionar y revisar los expedientes educativos del estudiante
• El derecho a solicitar que se corrijan los expedientes educativos que el padre o la madre considere inexactos
• El derecho a dar su consentimiento para la divulgación de la información de identificación personal contenida en los expedientes educativos del estudiante

INFORMACIÓN DE DIRECTORIO
Rooted School Vancouver designa lo siguiente como Información de Directorio:
• Nombre del estudiante
• Fechas de asistencia
• Grado escolar
• Participación en actividades y deportes escolares
• Honores y reconocimientos recibidos

OPCIONES DE CONSENTIMIENTO
Al completar este formulario, usted indica su preferencia respecto a la divulgación de la información de directorio de su estudiante para las publicaciones de la escuela, el sitio web de la escuela y los programas de reconocimiento.

Puede excluirse de la divulgación de la información de directorio en cualquier momento avisando por escrito a la oficina principal.

Si tiene preguntas sobre los derechos que otorga FERPA y sobre los expedientes estudiantiles, comuníquese con:
frontoffice@rootedschoolvancouver.org | 360-524-2842

Para más información sobre FERPA: www.ed.gov/ferpa`,
  },
};

// ─── C.R. Neal Academy (Columbia, SC) ──────────────────────────────────────

const RSSC_POLICIES: PolicyMap = {

  tech_policy: {
    en: `TECHNOLOGY ACCEPTABLE USE POLICY
C.R. Neal Academy — Columbia, SC

Technology supports our mission to prepare students for high-demand careers while maintaining safety and appropriate use.

PERMITTED ACTIVITIES
• Academic research and coursework completion
• Educational software and approved applications
• Digital portfolio and project development
• Communication with teachers and classmates about schoolwork

PROHIBITED ACTIVITIES
• Social media during instructional time
• Gaming or entertainment content during school hours
• Accessing inappropriate content (violence, pornography, hate speech)
• Cyberbullying, harassment, or threatening communications
• Bypassing school internet filters or security measures
• Unauthorized sharing of personal information

1:1 DEVICE RESPONSIBILITIES
• Charge device nightly and bring fully charged daily
• Keep device in protective case when provided
• Report technical issues immediately to IT support
• Use technology for educational purposes only during school hours

CONSEQUENCES FOR MISUSE
1. Warning: Redirection and policy review
2. Restricted Access: Loss of privileges for remainder of day
3. Parent Conference: Technology use plan development
4. Extended Restriction: Loss of privileges 1–5 days
5. Major Violations: Possible suspension and loss of technology privileges

DATA PRIVACY & SECURITY
• Student data is protected under FERPA requirements
• Family consent is required for tools that collect personal information
• Privacy violations are reported immediately to administration

By signing below, I confirm that my student and I have read, understand, and agree to abide by this Acceptable Use Policy.`,
    es: `POLÍTICA DE USO ACEPTABLE DE LA TECNOLOGÍA
C.R. Neal Academy, Columbia, SC

La tecnología apoya nuestra misión de preparar a los estudiantes para carreras de alta demanda, manteniendo siempre la seguridad y el uso apropiado.

ACTIVIDADES PERMITIDAS
• Investigación académica y realización de los trabajos del curso
• Programas educativos y aplicaciones aprobadas
• Desarrollo de portafolios digitales y de proyectos
• Comunicación con maestros y compañeros sobre el trabajo escolar

ACTIVIDADES PROHIBIDAS
• Redes sociales durante el tiempo de instrucción
• Juegos o contenido de entretenimiento durante el horario escolar
• Acceder a contenido inapropiado (violencia, pornografía, discurso de odio)
• Ciberacoso, hostigamiento o comunicaciones amenazantes
• Evadir los filtros de internet o las medidas de seguridad de la escuela
• Compartir información personal sin autorización

RESPONSABILIDADES DEL DISPOSITIVO 1:1
• Cargar el dispositivo cada noche y traerlo con la batería completa todos los días
• Mantener el dispositivo en su funda protectora cuando se proporcione una
• Reportar de inmediato cualquier problema técnico al soporte de tecnología
• Usar la tecnología solo con fines educativos durante el horario escolar

CONSECUENCIAS POR EL MAL USO
1. Advertencia: redirección y repaso de la política
2. Acceso restringido: pérdida de privilegios por el resto del día
3. Conferencia con los padres: desarrollo de un plan de uso de la tecnología
4. Restricción extendida: pérdida de privilegios de 1 a 5 días
5. Faltas graves: posible suspensión y pérdida de los privilegios de tecnología

PRIVACIDAD Y SEGURIDAD DE LOS DATOS
• Los datos de los estudiantes están protegidos bajo los requisitos de FERPA (Ley de Derechos Educativos y Privacidad Familiar)
• Se requiere el consentimiento de la familia para las herramientas que recopilan información personal
• Las violaciones de la privacidad se reportan de inmediato a la administración

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído, entendemos y aceptamos cumplir con esta Política de Uso Aceptable.`,
  },

  handbook_ack: {
    en: `STUDENT & FAMILY HANDBOOK ACKNOWLEDGMENT
C.R. Neal Academy — 2025–2026

This handbook represents our shared commitment to student success, equity, and preparation for financial freedom. By working together — students, families, and school — we create an environment where every student can thrive.

By signing below, I confirm that:
• I have received and reviewed the C.R. Neal Academy Student & Family Handbook 2025–2026
• My student and I understand the policies, expectations, and procedures outlined in the handbook
• I understand that the handbook is reviewed annually and updates will be communicated

The handbook covers: attendance, academic programs, student-directed learning, project-based learning, behavior expectations, dress code, technology use, health and safety, and family engagement.

C.R. Neal Academy is authorized by Voorhees University and operates under the oversight of the South Carolina Public Charter School District (SCPSD).

For questions about handbook policies, contact the school office.

As a dedicated member of the C.R. Neal Academy community, my student pledges to abide by the Student Code of Conduct:
1. Willing Learner: Open-minded and receptive to new knowledge
2. Regular Attendance: Attending school consistently
3. Safe Learning Environment: Contributing to a safe and supportive community
4. Respectful Communication: Treating all community members with dignity
5. Responsible Technology Use: Using school technology ethically and appropriately`,
    es: `RECONOCIMIENTO DEL MANUAL DEL ESTUDIANTE Y LA FAMILIA
C.R. Neal Academy, 2025-2026

Este manual representa nuestro compromiso compartido con el éxito estudiantil, la equidad y la preparación para la libertad financiera. Al trabajar juntos, estudiantes, familias y escuela, creamos un ambiente donde cada estudiante puede prosperar.

Al firmar a continuación, confirmo que:
• He recibido y revisado el Manual del Estudiante y la Familia 2025-2026 de C.R. Neal Academy
• Mi estudiante y yo entendemos las políticas, las expectativas y los procedimientos descritos en el manual
• Entiendo que el manual se revisa cada año y que los cambios se comunicarán a las familias

El manual cubre: asistencia, programas académicos, aprendizaje dirigido por el estudiante, aprendizaje basado en proyectos, expectativas de comportamiento, código de vestimenta, uso de la tecnología, salud y seguridad, y participación de las familias.

C.R. Neal Academy está autorizada por Voorhees University y opera bajo la supervisión del Distrito Escolar Público Charter de Carolina del Sur (SCPSD, por sus siglas en inglés).

Si tiene preguntas sobre las políticas del manual, comuníquese con la oficina de la escuela.

Como miembro comprometido de la comunidad de C.R. Neal Academy, mi estudiante se compromete a cumplir con el Código de Conducta Estudiantil:
1. Estudiante dispuesto: tener la mente abierta y estar receptivo a nuevos conocimientos
2. Asistencia regular: asistir a la escuela de manera constante
3. Ambiente de aprendizaje seguro: contribuir a una comunidad segura y de apoyo
4. Comunicación respetuosa: tratar con dignidad a todos los miembros de la comunidad
5. Uso responsable de la tecnología: usar la tecnología de la escuela de manera ética y apropiada`,
  },

  discipline_policy: {
    en: `BEHAVIOR EXPECTATIONS & DISCIPLINE POLICY
C.R. Neal Academy — Columbia, SC

BEHAVIOR PHILOSOPHY
We use restorative practices to build community, teach responsibility, and repair harm when expectations are not met. Our goal is keeping students engaged in learning while building life skills.

SCHOOL-WIDE EXPECTATIONS
• Respect: Show consideration for self, others, and property
• Responsibility: Take ownership of actions and learning
• Safety: Maintain physical and emotional safety for all
• Growth: Embrace challenges and learn from mistakes

GRADUATED RESPONSE SYSTEM
Level 1 — Minor (Classroom-managed): Redirection, reflection, brief restorative conversation
Level 2 — Moderate (Classroom + admin): Restorative conference, family contact, behavior plan
Level 3 — Serious (Admin-managed): In-school suspension (1–3 days), restorative process required, family meeting
Level 4 — Severe (Admin + potential law enforcement): Out-of-school suspension (1–10 days), expulsion consideration, law enforcement if required

South Carolina law requires schools to report certain offenses to law enforcement. C.R. Neal Academy complies with all SCDE reporting requirements.

RESTORATIVE PRACTICES
• Restorative Circles: Used for community building and conflict resolution
• Peer Mediation: Trained student mediators assist in conflict resolution
• Restorative Conferences: Structured conversations to repair harm and restore relationships

By signing below, I confirm that my student and I have read and understand the behavior expectations and discipline policy for C.R. Neal Academy.`,
    es: `EXPECTATIVAS DE COMPORTAMIENTO Y POLÍTICA DISCIPLINARIA
C.R. Neal Academy, Columbia, SC

FILOSOFÍA DE COMPORTAMIENTO
Usamos prácticas restaurativas para construir comunidad, enseñar responsabilidad y reparar el daño cuando no se cumplen las expectativas. Nuestra meta es mantener a los estudiantes conectados con el aprendizaje mientras desarrollan habilidades para la vida.

EXPECTATIVAS PARA TODA LA ESCUELA
• Respeto: mostrar consideración por uno mismo, por los demás y por la propiedad
• Responsabilidad: hacerse cargo de sus acciones y de su aprendizaje
• Seguridad: mantener la seguridad física y emocional de todos
• Crecimiento: aceptar los retos y aprender de los errores

SISTEMA DE RESPUESTA GRADUAL
Nivel 1, leve (manejado en el salón de clases): redirección, reflexión, breve conversación restaurativa
Nivel 2, moderado (salón de clases y administración): conferencia restaurativa, contacto con la familia, plan de comportamiento
Nivel 3, serio (manejado por la administración): suspensión dentro de la escuela (1 a 3 días), proceso restaurativo obligatorio, reunión con la familia
Nivel 4, severo (administración y posible intervención de las autoridades): suspensión fuera de la escuela (1 a 10 días), consideración de expulsión, intervención de las autoridades si es necesario

La ley de Carolina del Sur exige que las escuelas reporten ciertas faltas a las autoridades del orden público. C.R. Neal Academy cumple con todos los requisitos de reporte del SCDE (Departamento de Educación de Carolina del Sur).

PRÁCTICAS RESTAURATIVAS
• Círculos restaurativos: se usan para construir comunidad y resolver conflictos
• Mediación entre compañeros: estudiantes mediadores capacitados ayudan a resolver conflictos
• Conferencias restaurativas: conversaciones estructuradas para reparar el daño y restablecer las relaciones

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído y entendemos las expectativas de comportamiento y la política disciplinaria de C.R. Neal Academy.`,
  },

  media_release: {
    en: `PHOTO/VIDEO/MEDIA RELEASE CONSENT
C.R. Neal Academy — Columbia, SC

C.R. Neal Academy may photograph or video-record students during school activities for use in school publications, the school website, social media, newsletters, and promotional materials.

WHAT THIS COVERS
• School events, classroom activities, field trips, and extracurricular activities
• Use in print materials, digital publications, and social media platforms
• Internal school communications and community outreach

WHAT THIS DOES NOT COVER
• Your child's name will not be published alongside photos without separate written consent
• Images will not be sold or shared with third parties for commercial purposes
• Medical or sensitive situations will never be photographed

YOUR OPTIONS
By completing this form, you are indicating your consent preference. You may withdraw consent at any time by contacting the school office.`,
    es: `CONSENTIMIENTO PARA EL USO DE FOTOGRAFÍAS, VIDEO Y MEDIOS
C.R. Neal Academy, Columbia, SC

C.R. Neal Academy puede tomar fotografías o grabar en video a los estudiantes durante las actividades escolares para usarlas en publicaciones de la escuela, el sitio web de la escuela, las redes sociales, los boletines y los materiales promocionales.

QUÉ INCLUYE ESTE CONSENTIMIENTO
• Eventos escolares, actividades en el salón de clases, excursiones y actividades extracurriculares
• Uso en materiales impresos, publicaciones digitales y plataformas de redes sociales
• Comunicaciones internas de la escuela y difusión comunitaria

QUÉ NO INCLUYE ESTE CONSENTIMIENTO
• El nombre de su hijo o hija no se publicará junto a las fotografías sin un consentimiento por escrito por separado
• Las imágenes no se venderán ni se compartirán con terceros con fines comerciales
• Nunca se fotografiarán situaciones médicas ni situaciones delicadas

SUS OPCIONES
Al completar este formulario, usted indica su preferencia de consentimiento. Puede retirar su consentimiento en cualquier momento comunicándose con la oficina de la escuela.`,
  },

  field_trip: {
    en: `BLANKET FIELD TRIP PERMISSION
C.R. Neal Academy — 2025–2026 School Year

This annual permission form authorizes your student to participate in school-sponsored field trips and off-campus learning activities during the 2025–2026 school year.

WHAT IS COVERED
• Educational field trips within the Columbia, SC metro area and South Carolina
• Career-connected learning visits (internship sites, college campuses, businesses)
• Community service and project-based learning events
• School-sponsored extracurricular travel

EXPECTATIONS DURING FIELD TRIPS
• Students are expected to follow all school behavior expectations while off campus
• Dress code applies during all field trips and professional visits
• Students who do not meet behavioral standards may lose field trip privileges

TRANSPORTATION
• School-arranged transportation will be used for field trips
• Families will be notified in advance of transportation arrangements

NOTE: Overnight trips and out-of-state travel require separate permission forms.

For questions, contact the school office.`,
    es: `PERMISO GENERAL PARA EXCURSIONES ESCOLARES
C.R. Neal Academy, año escolar 2025-2026

Este formulario de permiso anual autoriza a su estudiante a participar en excursiones patrocinadas por la escuela y en actividades de aprendizaje fuera del plantel durante el año escolar 2025-2026.

QUÉ SE CUBRE
• Excursiones educativas dentro del área metropolitana de Columbia, SC y del estado de Carolina del Sur
• Visitas de aprendizaje conectado a carreras (sitios de pasantías, campus universitarios, empresas)
• Servicio comunitario y eventos de aprendizaje basado en proyectos
• Viajes extracurriculares patrocinados por la escuela

EXPECTATIVAS DURANTE LAS EXCURSIONES
• Se espera que los estudiantes cumplan con todas las expectativas de comportamiento de la escuela mientras estén fuera del plantel
• El código de vestimenta se aplica durante todas las excursiones y visitas profesionales
• Los estudiantes que no cumplan con las normas de comportamiento pueden perder el privilegio de participar en las excursiones

TRANSPORTE
• Se usará transporte organizado por la escuela para las excursiones
• Se avisará a las familias con anticipación sobre los arreglos de transporte

NOTA: los viajes con pernoctación y los viajes fuera del estado requieren formularios de permiso por separado.

Si tiene preguntas, comuníquese con la oficina de la escuela.`,
  },

  internet_safety: {
    en: `INTERNET SAFETY AGREEMENT
C.R. Neal Academy — Columbia, SC

DIGITAL CITIZENSHIP COMMITMENT
As part of our commitment to preparing students for college and career success, C.R. Neal Academy provides students with access to the internet and digital tools. This agreement outlines expectations for safe, responsible, and ethical online behavior.

STUDENT COMMITMENTS
• Use the internet for educational purposes only during school hours
• Never share personal information (address, phone number, passwords) online
• Report unsafe, inappropriate, or uncomfortable online situations to a trusted adult
• Treat others online with the same respect you would show in person
• Never attempt to bypass school internet filters
• Protect school and personal devices from unauthorized access

SOCIAL MEDIA
• Social media use is not permitted during instructional time
• School devices may not be used to access personal social media accounts

CYBERBULLYING PREVENTION
• Cyberbullying, harassment, and threatening communications are prohibited
• Report any cyberbullying to a teacher, counselor, or administrator immediately

By signing below, I confirm that my student and I understand and agree to this Internet Safety Agreement.`,
    es: `ACUERDO DE SEGURIDAD EN INTERNET
C.R. Neal Academy, Columbia, SC

COMPROMISO DE CIUDADANÍA DIGITAL
Como parte de nuestro compromiso de preparar a los estudiantes para el éxito universitario y profesional, C.R. Neal Academy brinda a los estudiantes acceso a internet y a herramientas digitales. Este acuerdo describe las expectativas para un comportamiento en línea seguro, responsable y ético.

COMPROMISOS DEL ESTUDIANTE
• Usar internet solo con fines educativos durante el horario escolar
• Nunca compartir información personal (dirección, número de teléfono, contraseñas) en línea
• Informar a un adulto de confianza sobre cualquier situación en línea insegura, inapropiada o incómoda
• Tratar a los demás en línea con el mismo respeto que mostraría en persona
• Nunca intentar evadir los filtros de internet de la escuela
• Proteger los dispositivos escolares y personales del acceso no autorizado

REDES SOCIALES
• No se permite el uso de redes sociales durante el tiempo de instrucción
• Los dispositivos de la escuela no se pueden usar para acceder a cuentas personales de redes sociales

PREVENCIÓN DEL CIBERACOSO
• El ciberacoso, el hostigamiento y las comunicaciones amenazantes están prohibidos
• Reporte de inmediato cualquier caso de ciberacoso a un maestro, consejero o administrador

Al firmar a continuación, confirmo que mi estudiante y yo entendemos y aceptamos este Acuerdo de Seguridad en Internet.`,
  },

  anti_bullying: {
    en: `ANTI-BULLYING & HARASSMENT PREVENTION POLICY
C.R. Neal Academy — Columbia, SC

C.R. Neal Academy is committed to providing a safe and inclusive learning environment free from harassment, intimidation, and bullying (HIB). This policy applies in the classroom, on school transportation, at school events, and in all digital communications.

WHAT IS BULLYING/HIB?
HIB is any intentional electronic, written, verbal, or physical act that:
• Physically harms a student or damages their property
• Substantially interferes with a student's education
• Creates an intimidating or threatening educational environment
• Substantially disrupts the orderly operation of school

REPORTING
If you witness or experience bullying or harassment, report it to any staff member or school administrator. All reports are taken seriously and investigated promptly.

South Carolina law (S.C. Code § 59-63-120) requires all public schools, including charter schools, to adopt and enforce anti-bullying policies. C.R. Neal Academy fully complies with these requirements.

ROOTED'S COMMITMENT
C.R. Neal Academy prohibits any acts of discrimination, harassment, intimidation, or bullying. We are committed to creating a community built on respect, dignity, and belonging for every student.

By signing below, I confirm that my student and I have read and understand C.R. Neal Academy's Anti-Bullying and Harassment Prevention Policy.`,
    es: `POLÍTICA DE PREVENCIÓN DEL ACOSO Y EL HOSTIGAMIENTO
C.R. Neal Academy, Columbia, SC

C.R. Neal Academy se compromete a ofrecer un ambiente de aprendizaje seguro e inclusivo, libre de hostigamiento, intimidación y acoso (HIB, por sus siglas en inglés). Esta política se aplica en el salón de clases, en el transporte escolar, en los eventos de la escuela y en todas las comunicaciones digitales.

¿QUÉ ES EL ACOSO O HIB?
El HIB es cualquier acto intencional, electrónico, escrito, verbal o físico que:
• Daña físicamente a un estudiante o daña su propiedad
• Interfiere de manera sustancial con la educación de un estudiante
• Crea un ambiente educativo intimidante o amenazante
• Interrumpe de manera sustancial el funcionamiento ordenado de la escuela

CÓMO REPORTAR
Si usted presencia o sufre acoso u hostigamiento, repórtelo a cualquier miembro del personal o a un administrador de la escuela. Todos los reportes se toman en serio y se investigan sin demora.

La ley de Carolina del Sur (S.C. Code § 59-63-120) exige que todas las escuelas públicas, incluidas las escuelas charter, adopten y hagan cumplir políticas contra el acoso. C.R. Neal Academy cumple plenamente con estos requisitos.

EL COMPROMISO DE ROOTED
C.R. Neal Academy prohíbe todo acto de discriminación, hostigamiento, intimidación o acoso. Nos comprometemos a crear una comunidad basada en el respeto, la dignidad y la pertenencia para cada estudiante.

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído y entendemos la Política de Prevención del Acoso y el Hostigamiento de C.R. Neal Academy.`,
  },

  uniform_policy: {
    en: `DRESS CODE POLICY
C.R. Neal Academy — Columbia, SC

PURPOSE
Our dress code prepares students for professional environments while allowing personal expression and ensuring equitable, consistent enforcement.

DAILY ATTIRE REQUIREMENTS
Tops:
• Collared shirts, crew neck t-shirts, or blouses
• Sleeves required (no tank tops, spaghetti straps, or strapless)
• Necklines must not extend below collarbone
• Midriff must be covered when arms are raised above head
• No undergarments visible

Bottoms:
• Pants, chinos, or knee-length shorts/skirts
• Waistbands must sit at natural waist
• No rips, tears, or distressed denim

Footwear:
• Closed-toe shoes recommended for safety
• No bedroom slippers or unsafe footwear

PROFESSIONAL/INTERNSHIP ATTIRE
For internships and professional experiences:
• Professional button-down or approved dress shirt
• Dress pants or chinos (no cargo pants, shorts, or jeans)
• Dress shoes, loafers, or professional sneakers

NEVER APPROPRIATE
• Clothing with drug, alcohol, tobacco, or weapon references
• Clothing with offensive, discriminatory, or sexually suggestive content

ENFORCEMENT
Dress code is enforced with an equity-centered approach — private conversations only, never public correction. Economic barriers are addressed through school clothing assistance.

By signing below, I confirm that my student and I have read and understand the C.R. Neal Academy Dress Code Policy.`,
    es: `POLÍTICA DEL CÓDIGO DE VESTIMENTA
C.R. Neal Academy, Columbia, SC

PROPÓSITO
Nuestro código de vestimenta prepara a los estudiantes para ambientes profesionales, permitiendo a la vez la expresión personal y asegurando una aplicación equitativa y consistente.

REQUISITOS DE VESTIMENTA DIARIA
Prendas de la parte de arriba:
• Camisas con cuello, camisetas de cuello redondo o blusas
• Se requieren mangas (no se permiten camisetas sin mangas, de tirantes delgados ni sin tirantes)
• El escote no debe pasar por debajo de la clavícula
• El abdomen debe quedar cubierto al levantar los brazos por encima de la cabeza
• No debe verse la ropa interior

Prendas de la parte de abajo:
• Pantalones, pantalones chinos, o shorts y faldas hasta la rodilla
• La pretina debe quedar a la altura natural de la cintura
• No se permiten prendas rasgadas, rotas ni de mezclilla desgastada

Calzado:
• Se recomienda calzado cerrado por seguridad
• No se permiten pantuflas ni calzado inseguro

VESTIMENTA PROFESIONAL Y PARA PASANTÍAS
Para las pasantías y las experiencias profesionales:
• Camisa de botones profesional o camisa de vestir aprobada
• Pantalones de vestir o chinos (no se permiten pantalones tipo cargo, shorts ni mezclilla)
• Zapatos de vestir, mocasines o tenis de aspecto profesional

NUNCA ES APROPIADO
• Ropa con referencias a drogas, alcohol, tabaco o armas
• Ropa con contenido ofensivo, discriminatorio o sexualmente sugerente

APLICACIÓN DE LA POLÍTICA
El código de vestimenta se aplica con un enfoque centrado en la equidad: solo conversaciones privadas, nunca correcciones en público. Las barreras económicas se atienden por medio de la asistencia con ropa que ofrece la escuela.

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído y entendemos la Política del Código de Vestimenta de C.R. Neal Academy.`,
  },

  ferpa_consent: {
    en: `FERPA DIRECTORY INFORMATION CONSENT
C.R. Neal Academy — Columbia, SC

THE FAMILY EDUCATIONAL RIGHTS AND PRIVACY ACT (FERPA)
FERPA affords parents and students over 18 years of age certain rights with respect to the student's education records. These rights include:
• The right to inspect and review the student's education records
• The right to request amendment of education records the parent believes are inaccurate
• The right to consent to disclosures of personally identifiable information contained in the student's education records

DIRECTORY INFORMATION
C.R. Neal Academy designates the following as Directory Information:
• Student's name
• Dates of attendance
• Grade level
• Participation in school activities and sports
• Honors and awards received

CONSENT OPTIONS
By completing this form, you are indicating your preference regarding the release of your student's directory information for school publications, the school website, and recognition programs.

You may opt out of directory information disclosure at any time by contacting the school office in writing.

C.R. Neal Academy is authorized by Voorhees University and operates as a public charter school under South Carolina law. Student records are maintained in compliance with both FERPA and SC state law.

For additional information about FERPA: www.ed.gov/ferpa`,
    es: `CONSENTIMIENTO DE INFORMACIÓN DE DIRECTORIO BAJO FERPA
C.R. Neal Academy, Columbia, SC

LA LEY DE DERECHOS EDUCATIVOS Y PRIVACIDAD FAMILIAR (FERPA)
FERPA (Ley de Derechos Educativos y Privacidad Familiar) otorga a los padres y a los estudiantes mayores de 18 años ciertos derechos con respecto a los expedientes educativos del estudiante. Estos derechos incluyen:
• El derecho a inspeccionar y revisar los expedientes educativos del estudiante
• El derecho a solicitar que se corrijan los expedientes educativos que el padre o la madre considere inexactos
• El derecho a dar su consentimiento para la divulgación de la información de identificación personal contenida en los expedientes educativos del estudiante

INFORMACIÓN DE DIRECTORIO
C.R. Neal Academy designa lo siguiente como Información de Directorio:
• Nombre del estudiante
• Fechas de asistencia
• Grado escolar
• Participación en actividades y deportes escolares
• Honores y reconocimientos recibidos

OPCIONES DE CONSENTIMIENTO
Al completar este formulario, usted indica su preferencia respecto a la divulgación de la información de directorio de su estudiante para las publicaciones de la escuela, el sitio web de la escuela y los programas de reconocimiento.

Puede excluirse de la divulgación de la información de directorio en cualquier momento avisando por escrito a la oficina de la escuela.

C.R. Neal Academy está autorizada por Voorhees University y opera como escuela pública charter bajo las leyes de Carolina del Sur. Los expedientes estudiantiles se mantienen en cumplimiento con FERPA y con la ley estatal de Carolina del Sur.

Para más información sobre FERPA: www.ed.gov/ferpa`,
  },
};

// ─── Rooted School Cleveland (OH) ──────────────────────────────────────────

const RSOH_POLICIES: PolicyMap = {

  tech_policy: {
    en: `TECHNOLOGY ACCEPTABLE USE POLICY
Rooted School Cleveland — Ohio

Technology supports our mission to prepare students for high-demand careers while maintaining safety and appropriate use.

PERMITTED ACTIVITIES
• Academic research and coursework completion
• Educational software and approved applications
• Digital portfolio and project development
• Communication with teachers and classmates about schoolwork

PROHIBITED ACTIVITIES
• Social media during instructional time
• Gaming or entertainment content during school hours
• Accessing inappropriate content (violence, pornography, hate speech)
• Cyberbullying, harassment, or threatening communications
• Bypassing school internet filters or security measures
• Unauthorized sharing of personal information

1:1 DEVICE RESPONSIBILITIES
• Charge device nightly and bring fully charged daily
• Keep device in protective case when provided
• Report technical issues immediately to IT support
• Use technology for educational purposes only during school hours

CONSEQUENCES FOR MISUSE
1. Warning: Redirection and policy review
2. Restricted Access: Loss of privileges for remainder of day
3. Parent Conference: Technology use plan development
4. Extended Restriction: Loss of privileges 1–5 days
5. Major Violations: Possible suspension and loss of technology privileges

By signing below, I confirm that my student and I have read, understand, and agree to abide by this Acceptable Use Policy.`,
    es: `POLÍTICA DE USO ACEPTABLE DE LA TECNOLOGÍA
Rooted School Cleveland, Ohio

La tecnología apoya nuestra misión de preparar a los estudiantes para carreras de alta demanda, manteniendo siempre la seguridad y el uso apropiado.

ACTIVIDADES PERMITIDAS
• Investigación académica y realización de los trabajos del curso
• Programas educativos y aplicaciones aprobadas
• Desarrollo de portafolios digitales y de proyectos
• Comunicación con maestros y compañeros sobre el trabajo escolar

ACTIVIDADES PROHIBIDAS
• Redes sociales durante el tiempo de instrucción
• Juegos o contenido de entretenimiento durante el horario escolar
• Acceder a contenido inapropiado (violencia, pornografía, discurso de odio)
• Ciberacoso, hostigamiento o comunicaciones amenazantes
• Evadir los filtros de internet o las medidas de seguridad de la escuela
• Compartir información personal sin autorización

RESPONSABILIDADES DEL DISPOSITIVO 1:1
• Cargar el dispositivo cada noche y traerlo con la batería completa todos los días
• Mantener el dispositivo en su funda protectora cuando se proporcione una
• Reportar de inmediato cualquier problema técnico al soporte de tecnología
• Usar la tecnología solo con fines educativos durante el horario escolar

CONSECUENCIAS POR EL MAL USO
1. Advertencia: redirección y repaso de la política
2. Acceso restringido: pérdida de privilegios por el resto del día
3. Conferencia con los padres: desarrollo de un plan de uso de la tecnología
4. Restricción extendida: pérdida de privilegios de 1 a 5 días
5. Faltas graves: posible suspensión y pérdida de los privilegios de tecnología

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído, entendemos y aceptamos cumplir con esta Política de Uso Aceptable.`,
  },

  handbook_ack: {
    en: `STUDENT & FAMILY HANDBOOK ACKNOWLEDGMENT
Rooted School Cleveland — 2025–2026

This handbook represents our shared commitment to student success, equity, and preparation for financial freedom. By working together — students, families, and school — we create an environment where every student can thrive.

By signing below, I confirm that:
• I have received and reviewed the Rooted School Cleveland Student & Family Handbook 2025–2026
• My student and I understand the policies, expectations, and procedures outlined in the handbook
• I understand that the handbook is reviewed annually and updates will be communicated

Rooted School Cleveland operates as a public charter school under the Ohio Department of Education and Workforce (ODEW).

For questions about handbook policies, contact the school office.

As a dedicated member of the Rooted School Cleveland community, my student pledges to abide by the Student Code of Conduct:
1. Willing Learner: Open-minded and receptive to new knowledge
2. Regular Attendance: Attending school consistently
3. Safe Learning Environment: Contributing to a safe and supportive community
4. Respectful Communication: Treating all community members with dignity
5. Responsible Technology Use: Using school technology ethically and appropriately`,
    es: `RECONOCIMIENTO DEL MANUAL DEL ESTUDIANTE Y LA FAMILIA
Rooted School Cleveland, 2025-2026

Este manual representa nuestro compromiso compartido con el éxito estudiantil, la equidad y la preparación para la libertad financiera. Al trabajar juntos, estudiantes, familias y escuela, creamos un ambiente donde cada estudiante puede prosperar.

Al firmar a continuación, confirmo que:
• He recibido y revisado el Manual del Estudiante y la Familia 2025-2026 de Rooted School Cleveland
• Mi estudiante y yo entendemos las políticas, las expectativas y los procedimientos descritos en el manual
• Entiendo que el manual se revisa cada año y que los cambios se comunicarán a las familias

Rooted School Cleveland opera como escuela pública charter bajo el Departamento de Educación y Fuerza Laboral de Ohio (ODEW, por sus siglas en inglés).

Si tiene preguntas sobre las políticas del manual, comuníquese con la oficina de la escuela.

Como miembro comprometido de la comunidad de Rooted School Cleveland, mi estudiante se compromete a cumplir con el Código de Conducta Estudiantil:
1. Estudiante dispuesto: tener la mente abierta y estar receptivo a nuevos conocimientos
2. Asistencia regular: asistir a la escuela de manera constante
3. Ambiente de aprendizaje seguro: contribuir a una comunidad segura y de apoyo
4. Comunicación respetuosa: tratar con dignidad a todos los miembros de la comunidad
5. Uso responsable de la tecnología: usar la tecnología de la escuela de manera ética y apropiada`,
  },

  discipline_policy: {
    en: `BEHAVIOR EXPECTATIONS & DISCIPLINE POLICY
Rooted School Cleveland — Ohio

BEHAVIOR PHILOSOPHY
We use restorative practices to build community, teach responsibility, and repair harm when expectations are not met. Our goal is keeping students engaged in learning while building life skills.

SCHOOL-WIDE EXPECTATIONS
• Respect: Show consideration for self, others, and property
• Responsibility: Take ownership of actions and learning
• Safety: Maintain physical and emotional safety for all
• Growth: Embrace challenges and learn from mistakes

GRADUATED RESPONSE SYSTEM
Level 1 — Minor (Classroom-managed): Redirection, reflection, brief restorative conversation
Level 2 — Moderate (Classroom + admin): Restorative conference, family contact, behavior plan
Level 3 — Serious (Admin-managed): In-school suspension (1–3 days), restorative process required, family meeting
Level 4 — Severe (Admin + potential law enforcement): Out-of-school suspension (1–10 days), expulsion consideration

Ohio law requires schools to report certain offenses to law enforcement. Rooted School Cleveland complies with all ODEW reporting requirements.

RESTORATIVE PRACTICES
• Restorative Circles: Used for community building and conflict resolution
• Peer Mediation: Trained student mediators assist in conflict resolution

By signing below, I confirm that my student and I have read and understand the behavior expectations and discipline policy for Rooted School Cleveland.`,
    es: `EXPECTATIVAS DE COMPORTAMIENTO Y POLÍTICA DISCIPLINARIA
Rooted School Cleveland, Ohio

FILOSOFÍA DE COMPORTAMIENTO
Usamos prácticas restaurativas para construir comunidad, enseñar responsabilidad y reparar el daño cuando no se cumplen las expectativas. Nuestra meta es mantener a los estudiantes conectados con el aprendizaje mientras desarrollan habilidades para la vida.

EXPECTATIVAS PARA TODA LA ESCUELA
• Respeto: mostrar consideración por uno mismo, por los demás y por la propiedad
• Responsabilidad: hacerse cargo de sus acciones y de su aprendizaje
• Seguridad: mantener la seguridad física y emocional de todos
• Crecimiento: aceptar los retos y aprender de los errores

SISTEMA DE RESPUESTA GRADUAL
Nivel 1, leve (manejado en el salón de clases): redirección, reflexión, breve conversación restaurativa
Nivel 2, moderado (salón de clases y administración): conferencia restaurativa, contacto con la familia, plan de comportamiento
Nivel 3, serio (manejado por la administración): suspensión dentro de la escuela (1 a 3 días), proceso restaurativo obligatorio, reunión con la familia
Nivel 4, severo (administración y posible intervención de las autoridades): suspensión fuera de la escuela (1 a 10 días), consideración de expulsión

La ley de Ohio exige que las escuelas reporten ciertas faltas a las autoridades del orden público. Rooted School Cleveland cumple con todos los requisitos de reporte del ODEW.

PRÁCTICAS RESTAURATIVAS
• Círculos restaurativos: se usan para construir comunidad y resolver conflictos
• Mediación entre compañeros: estudiantes mediadores capacitados ayudan a resolver conflictos

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído y entendemos las expectativas de comportamiento y la política disciplinaria de Rooted School Cleveland.`,
  },

  media_release: {
    en: `PHOTO/VIDEO/MEDIA RELEASE CONSENT
Rooted School Cleveland — Ohio

Rooted School Cleveland may photograph or video-record students during school activities for use in school publications, the school website, social media, newsletters, and promotional materials.

WHAT THIS COVERS
• School events, classroom activities, field trips, and extracurricular activities
• Use in print materials, digital publications, and social media platforms
• Internal school communications and community outreach

WHAT THIS DOES NOT COVER
• Your child's name will not be published alongside photos without separate written consent
• Images will not be sold or shared with third parties for commercial purposes

YOUR OPTIONS
By completing this form, you are indicating your consent preference. You may withdraw consent at any time by contacting the school office.`,
    es: `CONSENTIMIENTO PARA EL USO DE FOTOGRAFÍAS, VIDEO Y MEDIOS
Rooted School Cleveland, Ohio

Rooted School Cleveland puede tomar fotografías o grabar en video a los estudiantes durante las actividades escolares para usarlas en publicaciones de la escuela, el sitio web de la escuela, las redes sociales, los boletines y los materiales promocionales.

QUÉ INCLUYE ESTE CONSENTIMIENTO
• Eventos escolares, actividades en el salón de clases, excursiones y actividades extracurriculares
• Uso en materiales impresos, publicaciones digitales y plataformas de redes sociales
• Comunicaciones internas de la escuela y difusión comunitaria

QUÉ NO INCLUYE ESTE CONSENTIMIENTO
• El nombre de su hijo o hija no se publicará junto a las fotografías sin un consentimiento por escrito por separado
• Las imágenes no se venderán ni se compartirán con terceros con fines comerciales

SUS OPCIONES
Al completar este formulario, usted indica su preferencia de consentimiento. Puede retirar su consentimiento en cualquier momento comunicándose con la oficina de la escuela.`,
  },

  field_trip: {
    en: `BLANKET FIELD TRIP PERMISSION
Rooted School Cleveland — 2025–2026 School Year

This annual permission form authorizes your student to participate in school-sponsored field trips and off-campus learning activities during the 2025–2026 school year.

WHAT IS COVERED
• Educational field trips within the Greater Cleveland area and Ohio
• Career-connected learning visits (internship sites, college campuses, businesses)
• Community service and project-based learning events
• School-sponsored extracurricular travel

EXPECTATIONS DURING FIELD TRIPS
• Students are expected to follow all school behavior expectations while off campus
• Dress code applies during all field trips and professional visits
• Students who do not meet behavioral standards may lose field trip privileges

NOTE: Overnight trips and out-of-state travel require separate permission forms.

For questions, contact the school office.`,
    es: `PERMISO GENERAL PARA EXCURSIONES ESCOLARES
Rooted School Cleveland, año escolar 2025-2026

Este formulario de permiso anual autoriza a su estudiante a participar en excursiones patrocinadas por la escuela y en actividades de aprendizaje fuera del plantel durante el año escolar 2025-2026.

QUÉ SE CUBRE
• Excursiones educativas dentro del área metropolitana de Cleveland y del estado de Ohio
• Visitas de aprendizaje conectado a carreras (sitios de pasantías, campus universitarios, empresas)
• Servicio comunitario y eventos de aprendizaje basado en proyectos
• Viajes extracurriculares patrocinados por la escuela

EXPECTATIVAS DURANTE LAS EXCURSIONES
• Se espera que los estudiantes cumplan con todas las expectativas de comportamiento de la escuela mientras estén fuera del plantel
• El código de vestimenta se aplica durante todas las excursiones y visitas profesionales
• Los estudiantes que no cumplan con las normas de comportamiento pueden perder el privilegio de participar en las excursiones

NOTA: los viajes con pernoctación y los viajes fuera del estado requieren formularios de permiso por separado.

Si tiene preguntas, comuníquese con la oficina de la escuela.`,
  },

  internet_safety: {
    en: `INTERNET SAFETY AGREEMENT
Rooted School Cleveland — Ohio

DIGITAL CITIZENSHIP COMMITMENT
Rooted School Cleveland provides students with access to the internet and digital tools. This agreement outlines expectations for safe, responsible, and ethical online behavior.

STUDENT COMMITMENTS
• Use the internet for educational purposes only during school hours
• Never share personal information (address, phone number, passwords) online
• Report unsafe or inappropriate online situations to a trusted adult immediately
• Treat others online with the same respect you would show in person
• Never attempt to bypass school internet filters

CYBERBULLYING PREVENTION
• Cyberbullying, harassment, and threatening communications are prohibited
• Ohio law (O.R.C. § 3313.666) requires schools to adopt anti-harassment and cyberbullying policies
• Report any cyberbullying to a teacher, counselor, or administrator immediately

By signing below, I confirm that my student and I understand and agree to this Internet Safety Agreement.`,
    es: `ACUERDO DE SEGURIDAD EN INTERNET
Rooted School Cleveland, Ohio

COMPROMISO DE CIUDADANÍA DIGITAL
Rooted School Cleveland brinda a los estudiantes acceso a internet y a herramientas digitales. Este acuerdo describe las expectativas para un comportamiento en línea seguro, responsable y ético.

COMPROMISOS DEL ESTUDIANTE
• Usar internet solo con fines educativos durante el horario escolar
• Nunca compartir información personal (dirección, número de teléfono, contraseñas) en línea
• Informar de inmediato a un adulto de confianza sobre cualquier situación en línea insegura o inapropiada
• Tratar a los demás en línea con el mismo respeto que mostraría en persona
• Nunca intentar evadir los filtros de internet de la escuela

PREVENCIÓN DEL CIBERACOSO
• El ciberacoso, el hostigamiento y las comunicaciones amenazantes están prohibidos
• La ley de Ohio (O.R.C. § 3313.666) exige que las escuelas adopten políticas contra el hostigamiento y el ciberacoso
• Reporte de inmediato cualquier caso de ciberacoso a un maestro, consejero o administrador

Al firmar a continuación, confirmo que mi estudiante y yo entendemos y aceptamos este Acuerdo de Seguridad en Internet.`,
  },

  anti_bullying: {
    en: `ANTI-BULLYING & HARASSMENT PREVENTION POLICY
Rooted School Cleveland — Ohio

Rooted School Cleveland is committed to providing a safe and inclusive learning environment free from harassment, intimidation, and bullying. This policy applies in the classroom, on school transportation, at school events, and in all digital communications.

WHAT IS BULLYING?
Bullying is repeated, aggressive behavior intended to hurt another person physically, emotionally, or socially. It includes:
• Physical acts (hitting, pushing, damaging property)
• Verbal acts (name-calling, threats, teasing)
• Social/relational bullying (exclusion, rumors)
• Cyberbullying (online harassment, threatening messages)

REPORTING
If you witness or experience bullying or harassment, report it to any staff member or school administrator. Ohio law (O.R.C. § 3313.666) requires all public schools, including community schools (charter schools), to adopt and enforce anti-harassment and anti-bullying policies.

ROOTED'S COMMITMENT
Rooted School Cleveland prohibits any acts of discrimination, harassment, intimidation, or bullying. We are committed to a community built on respect, dignity, and belonging.

By signing below, I confirm that my student and I have read and understand Rooted School Cleveland's Anti-Bullying and Harassment Prevention Policy.`,
    es: `POLÍTICA DE PREVENCIÓN DEL ACOSO Y EL HOSTIGAMIENTO
Rooted School Cleveland, Ohio

Rooted School Cleveland se compromete a ofrecer un ambiente de aprendizaje seguro e inclusivo, libre de hostigamiento, intimidación y acoso. Esta política se aplica en el salón de clases, en el transporte escolar, en los eventos de la escuela y en todas las comunicaciones digitales.

¿QUÉ ES EL ACOSO?
El acoso es una conducta agresiva y repetida cuya intención es lastimar a otra persona física, emocional o socialmente. Incluye:
• Actos físicos (golpear, empujar, dañar la propiedad)
• Actos verbales (insultos, amenazas, burlas)
• Acoso social o relacional (exclusión, rumores)
• Ciberacoso (hostigamiento en línea, mensajes amenazantes)

CÓMO REPORTAR
Si usted presencia o sufre acoso u hostigamiento, repórtelo a cualquier miembro del personal o a un administrador de la escuela. La ley de Ohio (O.R.C. § 3313.666) exige que todas las escuelas públicas, incluidas las community schools (escuelas charter), adopten y hagan cumplir políticas contra el hostigamiento y el acoso.

EL COMPROMISO DE ROOTED
Rooted School Cleveland prohíbe todo acto de discriminación, hostigamiento, intimidación o acoso. Nos comprometemos a formar una comunidad basada en el respeto, la dignidad y la pertenencia.

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído y entendemos la Política de Prevención del Acoso y el Hostigamiento de Rooted School Cleveland.`,
  },

  uniform_policy: {
    en: `DRESS CODE POLICY
Rooted School Cleveland — Ohio

PURPOSE
Our dress code prepares students for professional environments while allowing personal expression and ensuring equitable, consistent enforcement.

DAILY ATTIRE REQUIREMENTS
Tops:
• Collared shirts, crew neck t-shirts, or blouses
• Sleeves required (no tank tops, spaghetti straps, or strapless)
• Necklines must not extend below collarbone
• Midriff must be covered when arms are raised above head
• No undergarments visible

Bottoms:
• Pants, chinos, or knee-length shorts/skirts
• Waistbands must sit at natural waist
• No rips, tears, or distressed denim

Footwear:
• Closed-toe shoes recommended for safety
• No bedroom slippers or unsafe footwear

NEVER APPROPRIATE
• Clothing with drug, alcohol, tobacco, or weapon references
• Clothing with offensive, discriminatory, or sexually suggestive content

ENFORCEMENT
Dress code is enforced with an equity-centered approach — private conversations only, never public correction.

By signing below, I confirm that my student and I have read and understand the Rooted School Cleveland Dress Code Policy.`,
    es: `POLÍTICA DEL CÓDIGO DE VESTIMENTA
Rooted School Cleveland, Ohio

PROPÓSITO
Nuestro código de vestimenta prepara a los estudiantes para ambientes profesionales, permitiendo a la vez la expresión personal y asegurando una aplicación equitativa y consistente.

REQUISITOS DE VESTIMENTA DIARIA
Prendas de la parte de arriba:
• Camisas con cuello, camisetas de cuello redondo o blusas
• Se requieren mangas (no se permiten camisetas sin mangas, de tirantes delgados ni sin tirantes)
• El escote no debe pasar por debajo de la clavícula
• El abdomen debe quedar cubierto al levantar los brazos por encima de la cabeza
• No debe verse la ropa interior

Prendas de la parte de abajo:
• Pantalones, pantalones chinos, o shorts y faldas hasta la rodilla
• La pretina debe quedar a la altura natural de la cintura
• No se permiten prendas rasgadas, rotas ni de mezclilla desgastada

Calzado:
• Se recomienda calzado cerrado por seguridad
• No se permiten pantuflas ni calzado inseguro

NUNCA ES APROPIADO
• Ropa con referencias a drogas, alcohol, tabaco o armas
• Ropa con contenido ofensivo, discriminatorio o sexualmente sugerente

APLICACIÓN DE LA POLÍTICA
El código de vestimenta se aplica con un enfoque centrado en la equidad: solo conversaciones privadas, nunca correcciones en público.

Al firmar a continuación, confirmo que mi estudiante y yo hemos leído y entendemos la Política del Código de Vestimenta de Rooted School Cleveland.`,
  },

  ferpa_consent: {
    en: `FERPA DIRECTORY INFORMATION CONSENT
Rooted School Cleveland — Ohio

THE FAMILY EDUCATIONAL RIGHTS AND PRIVACY ACT (FERPA)
FERPA affords parents and students over 18 years of age certain rights with respect to the student's education records. These rights include:
• The right to inspect and review the student's education records
• The right to request amendment of education records the parent believes are inaccurate
• The right to consent to disclosures of personally identifiable information

DIRECTORY INFORMATION
Rooted School Cleveland designates the following as Directory Information:
• Student's name
• Dates of attendance
• Grade level
• Participation in school activities and sports
• Honors and awards received

CONSENT OPTIONS
By completing this form, you are indicating your preference regarding the release of your student's directory information.

You may opt out at any time by contacting the school office in writing.

Rooted School Cleveland operates as a community school under the Ohio Department of Education and Workforce (ODEW). Student records are maintained in compliance with both FERPA and Ohio state law.

For additional information about FERPA: www.ed.gov/ferpa`,
    es: `CONSENTIMIENTO DE INFORMACIÓN DE DIRECTORIO BAJO FERPA
Rooted School Cleveland, Ohio

LA LEY DE DERECHOS EDUCATIVOS Y PRIVACIDAD FAMILIAR (FERPA)
FERPA (Ley de Derechos Educativos y Privacidad Familiar) otorga a los padres y a los estudiantes mayores de 18 años ciertos derechos con respecto a los expedientes educativos del estudiante. Estos derechos incluyen:
• El derecho a inspeccionar y revisar los expedientes educativos del estudiante
• El derecho a solicitar que se corrijan los expedientes educativos que el padre o la madre considere inexactos
• El derecho a dar su consentimiento para la divulgación de la información de identificación personal

INFORMACIÓN DE DIRECTORIO
Rooted School Cleveland designa lo siguiente como Información de Directorio:
• Nombre del estudiante
• Fechas de asistencia
• Grado escolar
• Participación en actividades y deportes escolares
• Honores y reconocimientos recibidos

OPCIONES DE CONSENTIMIENTO
Al completar este formulario, usted indica su preferencia respecto a la divulgación de la información de directorio de su estudiante.

Puede excluirse en cualquier momento avisando por escrito a la oficina de la escuela.

Rooted School Cleveland opera como community school bajo el Departamento de Educación y Fuerza Laboral de Ohio (ODEW). Los expedientes estudiantiles se mantienen en cumplimiento con FERPA y con la ley estatal de Ohio.

Para más información sobre FERPA: www.ed.gov/ferpa`,
  },
};

// ─── Export ─────────────────────────────────────────────────────────────────

/**
 * Get policy text for a specific campus, item type, and language.
 *
 * Returns undefined if no school-specific text is configured (the caller then
 * falls back to the generic item description). Locale defaults to English so
 * existing callers keep working; Spanish falls back to English only if a
 * translation is ever missing, which the PolicyText type prevents at compile
 * time.
 */
export function getPolicyText(
  campusId: string,
  itemType: string,
  locale: Locale = "en"
): string | undefined {
  const map: Record<string, PolicyMap> = {
    [RSV]: RSV_POLICIES,
    [RSSC]: RSSC_POLICIES,
    [RSOH]: RSOH_POLICIES,
  };
  const policy = map[campusId]?.[itemType];
  if (!policy) return undefined;
  return policy[locale] ?? policy.en;
}
