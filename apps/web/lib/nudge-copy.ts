/**
 * Registration-nudge message copy, extracted to a pure module so the staff
 * UI can show an exact preview of what the family receives and the server
 * fan-out (lib/notify.ts) sends the very same strings. One source of truth:
 * if the copy changes here, the preview and the real message change together.
 *
 * No server imports allowed in this file — it is bundled into client
 * components for the preview dialog on /staff/today.
 */

const APP_LINK = process.env.NEXT_PUBLIC_APP_URL ?? "https://enroll.rootedschool.org";

/** In-app notification subject for a registration nudge. */
export function registrationNudgeSubject(count: number): string {
  return `Almost done: ${count} registration item${count === 1 ? "" : "s"} left`;
}

/** In-app notification body for a registration nudge. */
export function registrationNudgeBody(params: {
  studentName?: string;
  campusName: string;
  missingNames: string[];
}): string {
  const { studentName, campusName, missingNames } = params;
  const count = missingNames.length;
  return `${studentName ? `${studentName}'s` : "Your student's"} registration at ${campusName} is waiting on: ${missingNames
    .slice(0, 4)
    .join(", ")}${count > 4 ? "…" : ""}. Finish these to secure the seat.`;
}

/** Bilingual SMS body for a registration nudge (consented guardians only). */
export function registrationNudgeSms(params: {
  studentFirstName?: string;
  campusName: string;
  count: number;
}): string {
  const { studentFirstName, campusName, count } = params;
  return `Rooted Schools: ${count} registration item${count === 1 ? "" : "s"} still needed for ${
    studentFirstName ?? "your student"
  } at ${campusName}. Finish here: ${APP_LINK}/family/registration\nAún faltan pasos de inscripción. Complételos en el enlace.`;
}
