/**
 * The one internal interface both SIS platforms implement.
 *
 * Rooted runs PowerSchool at Columbia and Cleveland, and Skyward Qmlativ at
 * Vancouver. The temptation is to write PowerSchool-shaped code first and bolt
 * Skyward on later, which reliably produces an integration where one platform
 * is a first-class citizen and the other is a pile of special cases. Defining
 * the shared surface first, before either adapter exists, is what prevents
 * that.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * STATUS: interface and contract only. NEITHER ADAPTER IS IMPLEMENTED.
 *
 * This is genuinely blocked, and not on code:
 *   - API credentials for both platforms
 *   - A sandbox or test instance for each, since nobody should be discovering
 *     PowerSchool's plugin auth against a database of real children
 *   - A decision on identity reconciliation when a match is ambiguous
 *
 * The interface can be reviewed and argued with now. The adapters cannot be
 * written honestly until the above exists. Shipping stubs that silently return
 * empty arrays would let the funnel's Retain stage render as though attendance
 * data were flowing, which is the exact failure this codebase keeps designing
 * against.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type SisPlatform = "powerschool" | "qmlativ";

/** A student as the SIS knows them. Deliberately minimal. */
export interface SisStudent {
  /** The SIS's own identifier. Stored on enrollment.sis_student_id. */
  sisStudentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gradeLevel: string | null;
  /** True when the SIS considers the student actively enrolled. */
  active: boolean;
}

/** One day's attendance for one student. */
export interface SisAttendanceDay {
  sisStudentId: string;
  /** ISO date, no time component. */
  date: string;
  present: boolean;
}

/**
 * What we ask the SIS to create when a family finishes registration.
 * Outbound provisioning: EMS is the source of truth up to enrollment, the SIS
 * is the source of truth after it.
 */
export interface SisStudentDraft {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gradeLevel: string | null;
  guardianEmail: string | null;
  guardianPhone: string | null;
}

export interface SisSyncResult {
  ok: boolean;
  sisStudentId?: string;
  error?: string;
}

/**
 * Every adapter implements exactly this.
 *
 * Note what is NOT here: nothing platform-specific leaks through. If a method
 * signature ever needs a `powerSchoolSchoolId`, that is the signal the
 * abstraction is wrong, not an excuse to widen the interface.
 */
export interface SisAdapter {
  readonly platform: SisPlatform;

  /** Cheap credential check. Used by a health surface, never mid-request. */
  verifyConnection(): Promise<{ ok: boolean; error?: string }>;

  /** Outbound: create the student record after registration completes. */
  createStudent(draft: SisStudentDraft): Promise<SisSyncResult>;

  /** Inbound: find an existing student, for reconciliation. */
  findStudent(query: {
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
  }): Promise<SisStudent[]>;

  /**
   * Inbound: attendance for a date range. Powers Day 1 attendance and 30-day
   * retention, the two Retain-stage metrics the funnel currently cannot show.
   */
  getAttendance(input: {
    sisStudentIds: string[];
    startDate: string;
    endDate: string;
  }): Promise<SisAttendanceDay[]>;
}

/**
 * Thrown when something asks for an adapter that has not been built.
 *
 * A distinct error type rather than a generic throw so callers can degrade
 * (hide the Retain metrics) instead of 500-ing, and so this is impossible to
 * confuse with a real API failure in a log.
 */
export class SisNotImplementedError extends Error {
  constructor(public readonly platform: SisPlatform | null) {
    super(
      platform
        ? `SIS adapter for "${platform}" is not implemented yet. Blocked on API credentials and a sandbox instance.`
        : "No SIS platform is configured for this campus."
    );
    this.name = "SisNotImplementedError";
  }
}
