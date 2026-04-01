/**
 * Family-facing UI translations — English + Spanish.
 *
 * Keys are dot-namespaced strings. Add new keys here and TypeScript will
 * surface any usage of unknown keys at build time.
 *
 * Spanish translations reviewed for Latin American / school context.
 */

export type Locale = "en" | "es";

const dict = {
  // ─── Navigation ───────────────────────────────────────────────────────────
  "nav.dashboard":      { en: "Dashboard",       es: "Panel" },
  "nav.applications":   { en: "Applications",    es: "Solicitudes" },
  "nav.offers":         { en: "Offers",           es: "Ofertas" },
  "nav.documents":      { en: "Documents",        es: "Documentos" },
  "nav.messages":       { en: "Messages",         es: "Mensajes" },
  "nav.registration":   { en: "Registration",     es: "Registro" },
  "nav.reenrollment":   { en: "Re-enrollment",    es: "Re-matrícula" },
  "nav.signOut":        { en: "Sign out",         es: "Cerrar sesión" },

  // ─── Application Statuses ─────────────────────────────────────────────────
  "status.draft":            { en: "Draft",              es: "Borrador" },
  "status.submitted":        { en: "Submitted",          es: "Enviada" },
  "status.needs_info":       { en: "Needs Info",         es: "Información Requerida" },
  "status.verified":         { en: "Verified",           es: "Verificada" },
  "status.lottery_assigned": { en: "Lottery Assigned",   es: "Sorteo Asignado" },
  "status.offered":          { en: "Offered",            es: "Con Oferta" },
  "status.accepted":         { en: "Accepted",           es: "Aceptada" },
  "status.registered":       { en: "Registered",         es: "Registrado" },
  "status.waitlisted":       { en: "Waitlisted",         es: "En Lista de Espera" },
  "status.withdrawn":        { en: "Withdrawn",          es: "Retirada" },
  "status.placement_review": { en: "Placement Review",   es: "Revisión de Ubicación" },
  "status.enrolled":         { en: "Enrolled",           es: "Matriculado" },

  // ─── Dashboard ────────────────────────────────────────────────────────────
  "dashboard.welcomeBack":          { en: "Welcome back",                es: "Bienvenido/a de vuelta" },
  "dashboard.startNewApplication":  { en: "Start New Application",       es: "Nueva Solicitud" },
  "dashboard.welcomeFamily":        { en: "Welcome to the rootedschools family!", es: "¡Bienvenido a la familia rootedschools!" },
  "dashboard.enrolledStudents":     { en: "student(s) enrolled and registered.", es: "estudiante(s) matriculado(s) y registrado(s)." },
  "dashboard.checkOrientation":     { en: "Check your school for orientation details.", es: "Comuníquese con su escuela para los detalles de orientación." },
  "dashboard.activeApplications":   { en: "Active Applications",         es: "Solicitudes Activas" },
  "dashboard.noApplications":       { en: "No applications yet.",        es: "Aún no hay solicitudes." },
  "dashboard.startFirstApp":        { en: "Start your first application to get started.", es: "Comience su primera solicitud para empezar." },
  "dashboard.pendingOffers":        { en: "You have a pending offer",    es: "Tiene una oferta pendiente" },
  "dashboard.viewOffers":           { en: "View Offers",                 es: "Ver Ofertas" },
  "dashboard.recentActivity":       { en: "Recent Activity",             es: "Actividad Reciente" },
  "dashboard.noActivity":           { en: "No recent activity.",         es: "Sin actividad reciente." },
  "dashboard.enrollmentOpen":       { en: "Enrollment is now open",      es: "Las inscripciones ya están abiertas" },
  "dashboard.applyNow":             { en: "Apply Now",                   es: "Solicitar Ahora" },
  "dashboard.yourProgress":         { en: "Your Progress",              es: "Tu Progreso" },
  "dashboard.completeReg":          { en: "Complete Registration",       es: "Completar Registro" },
  "dashboard.goToReg":              { en: "Go to Registration",          es: "Ir al Registro" },
  "dashboard.respond":              { en: "Respond",                     es: "Responder" },
  "dashboard.ourSchools":           { en: "Our Schools",                 es: "Nuestras Escuelas" },

  // ─── Enrollment Steps ─────────────────────────────────────────────────────
  "steps.applied":        { en: "Applied",        es: "Solicitado" },
  "steps.verified":       { en: "Verified",       es: "Verificado" },
  "steps.offered":        { en: "Offered",        es: "Ofrecido" },
  "steps.accepted":       { en: "Accepted",       es: "Aceptado" },
  "steps.registered":     { en: "Registered",     es: "Registrado" },

  // ─── Offers ───────────────────────────────────────────────────────────────
  "offers.heading":          { en: "Your Offers",           es: "Sus Ofertas" },
  "offers.noOffers":         { en: "No offers yet.",        es: "Aún no hay ofertas." },
  "offers.noOffersDetail":   { en: "Once your application is reviewed and a seat is offered, it will appear here.", es: "Una vez que se revise su solicitud y se ofrezca un lugar, aparecerá aquí." },
  "offers.accept":           { en: "Accept Offer",          es: "Aceptar Oferta" },
  "offers.decline":          { en: "Decline Offer",         es: "Rechazar Oferta" },
  "offers.expiresOn":        { en: "Expires",               es: "Vence" },
  "offers.offerFrom":        { en: "Offer from",            es: "Oferta de" },
  "offers.grade":            { en: "Grade",                 es: "Grado" },
  "offers.schoolYear":       { en: "School Year",           es: "Año Escolar" },
  "offers.declineConfirm":   { en: "Are you sure you want to decline this offer? This action cannot be undone.", es: "¿Está seguro/a de que desea rechazar esta oferta? Esta acción no se puede deshacer." },
  "offers.accepting":        { en: "Accepting...",          es: "Aceptando..." },
  "offers.declining":        { en: "Declining...",          es: "Rechazando..." },

  // ─── Registration ─────────────────────────────────────────────────────────
  "reg.heading":              { en: "Registration Packet",           es: "Paquete de Registro" },
  "reg.welcome":              { en: "Welcome to Registration!",      es: "¡Bienvenido al Registro!" },
  "reg.allRequired":          { en: "All required items are complete — submit your packet below to finalize enrollment.", es: "Todos los elementos requeridos están completos — envíe su paquete para finalizar la inscripción." },
  "reg.completeItems":        { en: "Complete the required items below to finalize enrollment. You can complete items in any order.", es: "Complete los elementos requeridos a continuación para finalizar la inscripción. Puede completarlos en cualquier orden." },
  "reg.submitPacket":         { en: "Submit Packet",                 es: "Enviar Paquete" },
  "reg.submitting":           { en: "Submitting...",                 es: "Enviando..." },
  "reg.allComplete":          { en: "All Items Complete!",           es: "¡Todos los Elementos Completos!" },
  "reg.requiredComplete":     { en: "Required Items Complete!",      es: "¡Elementos Requeridos Completos!" },
  "reg.submitNow":            { en: "Submit now — you can complete any optional items later.", es: "Envíe ahora — puede completar los elementos opcionales más tarde." },
  "reg.packSubmitted":        { en: "Packet Submitted!",             es: "¡Paquete Enviado!" },
  "reg.packComplete":         { en: "Registration Complete!",        es: "¡Registro Completo!" },
  "reg.underReview":          { en: "Your registration packet is being reviewed by the enrollment team.", es: "Su paquete de registro está siendo revisado por el equipo de inscripción." },
  "reg.allVerified":          { en: "All items have been verified by staff. Welcome to the rootedschools family!", es: "Todos los elementos han sido verificados. ¡Bienvenido a la familia rootedschools!" },
  "reg.backToDashboard":      { en: "Back to Dashboard",             es: "Volver al Panel" },
  "reg.needHelp":             { en: "Need help? Contact your school's enrollment office for assistance.", es: "¿Necesita ayuda? Comuníquese con la oficina de inscripciones de su escuela." },
  "reg.itemsRemaining":       { en: "remaining",                     es: "restante(s)" },
  "reg.of":                   { en: "of",                            es: "de" },
  "reg.itemsCompleted":       { en: "items completed",               es: "elementos completados" },
  "reg.required":             { en: "Required",                      es: "Requerido" },
  "reg.optional":             { en: "Optional",                      es: "Opcional" },
  "reg.completed":            { en: "Completed",                     es: "Completado" },
  "reg.awaitingSetup":        { en: "Awaiting Setup",               es: "Pendiente de Configuración" },
  "reg.readyToSubmit":        { en: "Ready to Submit",               es: "Listo para Enviar" },
  "reg.underReviewBadge":     { en: "Under Review",                  es: "En Revisión" },
  "reg.complete":             { en: "Complete",                      es: "Completo" },

  // ─── Registration item categories ─────────────────────────────────────────
  "reg.cat.health":     { en: "Health & Medical",       es: "Salud y Médico" },
  "reg.cat.policies":   { en: "Policies & Agreements",  es: "Políticas y Acuerdos" },
  "reg.cat.records":    { en: "Records & Documents",    es: "Registros y Documentos" },
  "reg.cat.services":   { en: "Services & Preferences", es: "Servicios y Preferencias" },

  // ─── Registration item status ─────────────────────────────────────────────
  "reg.status.pending":    { en: "Not Started",  es: "Sin Iniciar" },
  "reg.status.submitted":  { en: "Submitted",    es: "Enviado" },
  "reg.status.verified":   { en: "Verified",     es: "Verificado" },

  // ─── Registration completion dialog ───────────────────────────────────────
  "reg.btn.fillOut":           { en: "Fill Out",             es: "Completar" },
  "reg.btn.upload":            { en: "Upload",               es: "Cargar" },
  "reg.btn.reviewAgree":       { en: "Review & Agree",       es: "Revisar y Aceptar" },
  "reg.btn.saving":            { en: "Saving...",            es: "Guardando..." },
  "reg.dialog.submit":         { en: "Submit",               es: "Enviar" },
  "reg.dialog.uploadComplete": { en: "Upload & Complete",    es: "Cargar y Completar" },
  "reg.dialog.confirm":        { en: "Confirm",              es: "Confirmar" },
  "reg.dialog.cancel":         { en: "Cancel",               es: "Cancelar" },
  "reg.dialog.iAgree":         { en: "I have read and agree to the above. I understand this is a binding acknowledgement.", es: "He leído y acepto lo anterior. Entiendo que este es un reconocimiento vinculante." },
  "reg.dialog.yourSignature":  { en: "Your signature",       es: "Su firma" },
  "reg.dialog.signHere":       { en: "Sign here",            es: "Firme aquí" },
  "reg.dialog.signInstruct":   { en: "Draw your signature above using your mouse or finger", es: "Dibuje su firma con el mouse o su dedo" },
  "reg.dialog.signRequired":   { en: "Please sign above to complete this acknowledgement.", es: "Por favor firme arriba para completar este acuerdo." },
  "reg.dialog.clear":          { en: "Clear",                es: "Borrar" },
  "reg.upload.clickToChoose":  { en: "Click to choose a file",  es: "Haga clic para elegir un archivo" },
  "reg.upload.formats":        { en: "PDF, JPEG, or PNG — max 10MB", es: "PDF, JPEG o PNG — máx. 10 MB" },
  "reg.upload.whatToUpload":   { en: "What to upload:",     es: "Qué cargar:" },
  "reg.upload.chooseDifferent": { en: "Choose a different file", es: "Elegir otro archivo" },
  "reg.upload.uploading":      { en: "Uploading...",        es: "Cargando..." },

  // ─── Re-enrollment ────────────────────────────────────────────────────────
  "reenroll.heading":     { en: "Re-enrollment Offers",    es: "Ofertas de Re-matrícula" },
  "reenroll.noOffers":    { en: "No re-enrollment offers.", es: "Sin ofertas de re-matrícula." },
  "reenroll.noOffersDetail": { en: "Your school will send re-enrollment offers when seats are confirmed for the upcoming year.", es: "Su escuela enviará ofertas de re-matrícula cuando los cupos se confirmen para el próximo año." },
  "reenroll.accept":         { en: "Accept & Enroll",         es: "Aceptar y Matricularse" },
  "reenroll.acceptLabel":    { en: "Accept Re-enrollment",    es: "Aceptar Re-matrícula" },
  "reenroll.decline":        { en: "Decline",                 es: "Rechazar" },
  "reenroll.accepting":      { en: "Accepting...",            es: "Aceptando..." },
  "reenroll.declining":      { en: "Declining...",            es: "Rechazando..." },
  "reenroll.acceptSuccess":  { en: "Re-enrollment accepted. Your registration packet will be ready shortly.", es: "Re-matrícula aceptada. Su paquete de registro estará listo en breve." },
  "reenroll.declineSuccess": { en: "You have declined this re-enrollment offer.", es: "Ha rechazado esta oferta de re-matrícula." },

  // ─── Documents ───────────────────────────────────────────────────────────────
  "docs.upload":           { en: "Upload Document",      es: "Cargar Documento" },
  "docs.yourDocs":         { en: "Your Documents",        es: "Sus Documentos" },
  "docs.noDocs":           { en: "No documents yet",      es: "Aún no hay documentos" },
  "docs.reupload":         { en: "Re-upload",             es: "Volver a Cargar" },
  "docs.view":             { en: "View",                  es: "Ver" },
  "docs.status.pending":   { en: "Pending Review",        es: "En Revisión" },
  "docs.status.rejected":  { en: "Needs Re-upload",       es: "Necesita Nueva Carga" },
  "docs.status.expired":   { en: "Expired",               es: "Expirado" },

  // ─── Messages ─────────────────────────────────────────────────────────────
  "msgs.unread":           { en: "Unread",                es: "No Leídos" },
  "msgs.read":             { en: "Read",                  es: "Leídos" },
  "msgs.markAllRead":      { en: "Mark all read",          es: "Marcar todo como leído" },
  "msgs.marking":          { en: "Marking...",             es: "Marcando..." },
  "msgs.markRead":         { en: "Mark as read",           es: "Marcar como leído" },
  "msgs.allMessages":      { en: "All Messages",           es: "Todos los Mensajes" },
  "msgs.unreadMessages":   { en: "Unread Messages",        es: "Mensajes No Leídos" },
  "msgs.noMessages":       { en: "No messages yet",        es: "Aún no hay mensajes" },
  "msgs.showAll":          { en: "Show all messages",      es: "Mostrar todos" },
  "msgs.allCaughtUp":      { en: "All caught up! No unread messages.", es: "¡Todo al día! Sin mensajes no leídos." },
  "msgs.viewDetails":      { en: "View Details",           es: "Ver Detalles" },

  // ─── Offers (extended) ────────────────────────────────────────────────────
  "offers.congratulations": { en: "Congratulations!",     es: "¡Felicitaciones!" },
  "offers.offerAccepted":   { en: "Offer Accepted",       es: "Oferta Aceptada" },
  "offers.offerDeclined":   { en: "Offer Declined",       es: "Oferta Rechazada" },
  "offers.offerExpired":    { en: "Offer Expired",        es: "Oferta Expirada" },
  "offers.goToReg":         { en: "Go to Registration",   es: "Ir al Registro" },
  "offers.offerDetails":    { en: "Offer Details",        es: "Detalles de la Oferta" },
  "offers.acceptTitle":     { en: "Accept the Offer?",    es: "¿Aceptar la Oferta?" },
  "offers.declineTitle":    { en: "Decline the Offer?",   es: "¿Rechazar la Oferta?" },
  "offers.yesAccept":       { en: "Yes, Accept Offer",    es: "Sí, Aceptar Oferta" },
  "offers.yesDecline":      { en: "Yes, Decline Offer",   es: "Sí, Rechazar Oferta" },
  "offers.keepOffer":       { en: "Keep Offer",           es: "Mantener Oferta" },
  "offers.student":         { en: "Student",              es: "Estudiante" },
  "offers.school":          { en: "School",               es: "Escuela" },
  "offers.deadline":        { en: "Deadline",             es: "Fecha Límite" },

  // ─── Applications ─────────────────────────────────────────────────────────
  "apps.heading":           { en: "My Applications",        es: "Mis Solicitudes" },
  "apps.noApplications":    { en: "No applications yet.",   es: "Aún no hay solicitudes." },
  "apps.startApplication":  { en: "Start Application",      es: "Iniciar Solicitud" },
  "apps.viewDetails":       { en: "View Details",           es: "Ver Detalles" },
  "apps.campus":            { en: "Campus",                 es: "Escuela" },
  "apps.grade":             { en: "Grade",                  es: "Grado" },
  "apps.schoolYear":        { en: "School Year",            es: "Año Escolar" },
  "apps.status":            { en: "Status",                 es: "Estado" },
  "apps.submitted":         { en: "Submitted",              es: "Enviada" },
  "apps.lastUpdated":       { en: "Last updated",           es: "Última actualización" },
  "apps.continueApp":       { en: "Continue Application",   es: "Continuar Solicitud" },
  "apps.actionNeeded":      { en: "Action needed",           es: "Acción requerida" },

  // ─── Common ───────────────────────────────────────────────────────────────
  "common.backToDashboard": { en: "Back to Dashboard", es: "Volver al Panel" },
  "common.loading":         { en: "Loading...",        es: "Cargando..." },
  "common.error":           { en: "Something went wrong.", es: "Algo salió mal." },
  "common.tryAgain":        { en: "Try again",         es: "Intentar de nuevo" },
  "common.done":            { en: "Done",              es: "Listo" },
  "common.verified":        { en: "Verified",          es: "Verificado" },
  "common.complete":        { en: "complete",          es: "completo" },
} satisfies Record<string, Record<Locale, string>>;

export type TranslationKey = keyof typeof dict;

/**
 * Translate a key into the target locale.
 * Falls back to English if the Spanish string is missing.
 */
export function tx(key: TranslationKey, locale: Locale): string {
  return dict[key]?.[locale] ?? dict[key]?.en ?? key;
}
