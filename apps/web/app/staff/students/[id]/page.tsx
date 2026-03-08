export const runtime = "edge";
export const dynamic = "force-dynamic";

import { createServerClient } from "@rooted-ems/database/server";
import { requireStaffSession } from "@/lib/auth/get-session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { redirect } from "next/navigation";
import { APPLICATION_STATUS_CONFIG } from "@/lib/application-helpers";

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string };
}) {
  const { id } = await Promise.resolve(params);
  await requireStaffSession();
  const supabase = await createServerClient();

  // Fetch student with household info
  const { data: student, error } = await supabase
    .from("student")
    .select(`
      id, first_name, middle_name, last_name, suffix, date_of_birth,
      gender, race_ethnicity, primary_language, home_language,
      previous_school_name, previous_school_phone,
      has_iep, has_504, special_services_notes,
      medical_allergies, medical_medications, medical_conditions,
      emergency_contact_1_name, emergency_contact_1_phone, emergency_contact_1_relationship,
      emergency_contact_2_name, emergency_contact_2_phone, emergency_contact_2_relationship,
      created_at,
      household:household_id (
        id, address_line1, address_line2, city, state, zip, primary_language
      )
    `)
    .eq("id", id)
    .single();

  if (error || !student) {
    redirect("/staff/students");
  }

  // Fetch guardians
  const { data: guardianLinks } = await supabase
    .from("guardian_student")
    .select(`
      relationship, is_legal_guardian,
      guardian:guardian_id (
        id, first_name, last_name, relationship, email, phone, phone_secondary,
        employer, is_primary, is_emergency_contact, sms_consent
      )
    `)
    .eq("student_id", id);

  // Fetch all applications
  const { data: applications } = await supabase
    .from("application")
    .select(`
      id, status, submitted_at, created_at,
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      enrollment_window:enrollment_window_id (name)
    `)
    .eq("student_id", id)
    .order("created_at", { ascending: false });

  // Fetch documents
  const { data: documents } = await supabase
    .from("document")
    .select("id, document_type, file_name, status, created_at")
    .eq("student_id", id)
    .order("created_at", { ascending: false });

  // Fetch enrollments
  const { data: enrollments } = await supabase
    .from("enrollment")
    .select(`
      id, status, enrolled_at, sis_student_id, sis_synced_at,
      campus:campus_id (name),
      grade_level:grade_level_id (grade),
      school_year:school_year_id (name)
    `)
    .eq("student_id", id)
    .order("enrolled_at", { ascending: false });

  // Fetch notes for this student
  const { data: notes } = await supabase
    .from("note")
    .select(`
      id, content, is_internal, created_at,
      author:created_by (first_name, last_name)
    `)
    .eq("entity_type", "student")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const household = student.household as unknown as Record<string, string> | null;
  const guardians = (guardianLinks ?? []).map((gl: Record<string, unknown>) => {
    const g = gl.guardian as Record<string, unknown> | null;
    return {
      id: g?.id as string,
      first_name: g?.first_name as string,
      last_name: g?.last_name as string,
      relationship: (gl.relationship ?? g?.relationship) as string,
      email: g?.email as string,
      phone: g?.phone as string,
      phone_secondary: g?.phone_secondary as string,
      employer: g?.employer as string,
      is_primary: g?.is_primary as boolean,
      is_legal_guardian: gl.is_legal_guardian as boolean,
      sms_consent: g?.sms_consent as boolean,
    };
  });

  const studentAge = student.date_of_birth
    ? Math.floor(
        (Date.now() - new Date(student.date_of_birth as string).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000)
      )
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/staff/students"
              className="text-sm text-gray-500 hover:text-gray-700 no-underline"
            >
              &larr; All Students
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">
            {student.first_name} {student.middle_name ?? ""}{" "}
            {student.last_name}
            {student.suffix ? ` ${student.suffix}` : ""}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {student.gender ?? "—"} &middot; Age {studentAge ?? "—"}
            {student.date_of_birth
              ? ` (DOB: ${new Date(student.date_of_birth as string).toLocaleDateString("en-US")})`
              : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {student.has_iep && (
            <Badge variant="secondary">IEP</Badge>
          )}
          {student.has_504 && (
            <Badge variant="secondary">504</Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Demographics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Demographics</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">Race/Ethnicity</dt>
                  <dd className="font-medium">
                    {(student.race_ethnicity as string[] | null)?.join(", ") ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Primary Language</dt>
                  <dd className="font-medium">{student.primary_language ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Home Language</dt>
                  <dd className="font-medium">{student.home_language ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Previous School</dt>
                  <dd className="font-medium">
                    {student.previous_school_name ?? "—"}
                    {student.previous_school_phone
                      ? ` (${student.previous_school_phone})`
                      : ""}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Special Services */}
          {(student.has_iep || student.has_504 || student.special_services_notes) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Special Services</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <dt className="text-gray-500">IEP</dt>
                    <dd className="font-medium">{student.has_iep ? "Yes" : "No"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">504 Plan</dt>
                    <dd className="font-medium">{student.has_504 ? "Yes" : "No"}</dd>
                  </div>
                  {student.special_services_notes && (
                    <div className="col-span-2">
                      <dt className="text-gray-500">Notes</dt>
                      <dd className="font-medium">{student.special_services_notes}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Application History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Application History</CardTitle>
            </CardHeader>
            <CardContent>
              {(!applications || applications.length === 0) ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  No applications on record
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {(applications as Record<string, unknown>[]).map((app) => {
                    const campus = app.campus as Record<string, string> | null;
                    const grade = app.grade_level as Record<string, string> | null;
                    const window = app.enrollment_window as Record<string, string> | null;
                    const status = app.status as string;
                    const cfg = APPLICATION_STATUS_CONFIG[status] ?? { label: status, variant: "outline" as const };
                    return (
                      <Link
                        key={app.id as string}
                        href={`/staff/applications/${app.id}`}
                        className="flex items-center justify-between py-3 hover:bg-gray-50 rounded-lg px-2 -mx-2 no-underline"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {campus?.name ?? ""} &middot; Grade {grade?.grade ?? ""}
                          </p>
                          <p className="text-xs text-gray-500">
                            {window?.name ?? ""} &middot;{" "}
                            {app.submitted_at
                              ? `Submitted ${new Date(app.submitted_at as string).toLocaleDateString("en-US")}`
                              : `Created ${new Date(app.created_at as string).toLocaleDateString("en-US")}`}
                          </p>
                        </div>
                        <Badge
                          variant={cfg.variant}
                          className="text-[10px]"
                        >
                          {cfg.label}
                        </Badge>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Enrollment History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enrollment History</CardTitle>
            </CardHeader>
            <CardContent>
              {(!enrollments || enrollments.length === 0) ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  No enrollment records
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {(enrollments as Record<string, unknown>[]).map((enr) => {
                    const campus = enr.campus as Record<string, string> | null;
                    const grade = enr.grade_level as Record<string, string> | null;
                    const year = enr.school_year as Record<string, string> | null;
                    return (
                      <div key={enr.id as string} className="py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {campus?.name ?? ""} &middot; Grade {grade?.grade ?? ""}
                          </p>
                          <p className="text-xs text-gray-500">
                            {year?.name ?? ""} &middot;{" "}
                            {enr.enrolled_at
                              ? `Enrolled ${new Date(enr.enrolled_at as string).toLocaleDateString("en-US")}`
                              : "Pending"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={enr.status === "active" ? "default" : "secondary"}>
                            {enr.status as string}
                          </Badge>
                          {(enr.sis_student_id as string | null) && (
                            <span className="text-[10px] text-gray-400 font-mono">
                              SIS: {enr.sis_student_id as string}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {(!documents || documents.length === 0) ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  No documents uploaded
                </p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {(documents as Record<string, unknown>[]).map((doc) => (
                    <div key={doc.id as string} className="py-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {(doc.document_type as string)?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                        </p>
                        <p className="text-xs text-gray-500">{doc.file_name as string}</p>
                      </div>
                      <Badge
                        variant={doc.status === "verified" ? "default" : doc.status === "rejected" ? "destructive" : "secondary"}
                      >
                        {doc.status as string}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Address</CardTitle>
            </CardHeader>
            <CardContent>
              {household ? (
                <div className="text-sm">
                  <p className="font-medium">{household.address_line1}</p>
                  {household.address_line2 && <p>{household.address_line2}</p>}
                  <p>
                    {household.city}, {household.state} {household.zip}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No address on file</p>
              )}
            </CardContent>
          </Card>

          {/* Guardians */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Guardians ({guardians.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {guardians.length === 0 ? (
                <p className="text-sm text-gray-400">No guardians linked</p>
              ) : (
                <div className="space-y-4">
                  {guardians.map((g) => (
                    <div key={g.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {g.first_name} {g.last_name}
                        </p>
                        {g.is_primary && (
                          <Badge variant="secondary" className="text-[10px]">
                            Primary
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 capitalize">
                        {g.relationship?.replace(/_/g, " ")}
                        {g.is_legal_guardian ? " (Legal Guardian)" : ""}
                      </p>
                      {g.email && (
                        <p className="text-xs text-gray-600 mt-1">{g.email}</p>
                      )}
                      {g.phone && (
                        <p className="text-xs text-gray-600">{g.phone}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Medical Info */}
          {(student.medical_allergies || student.medical_medications || student.medical_conditions) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Medical Info</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  {student.medical_allergies && (
                    <div>
                      <dt className="text-gray-500 text-xs">Allergies</dt>
                      <dd className="font-medium">{student.medical_allergies}</dd>
                    </div>
                  )}
                  {student.medical_medications && (
                    <div>
                      <dt className="text-gray-500 text-xs">Medications</dt>
                      <dd className="font-medium">{student.medical_medications}</dd>
                    </div>
                  )}
                  {student.medical_conditions && (
                    <div>
                      <dt className="text-gray-500 text-xs">Conditions</dt>
                      <dd className="font-medium">{student.medical_conditions}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          )}

          {/* Emergency Contacts */}
          {(student.emergency_contact_1_name || student.emergency_contact_2_name) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Emergency Contacts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {student.emergency_contact_1_name && (
                  <div>
                    <p className="font-medium">{student.emergency_contact_1_name}</p>
                    <p className="text-xs text-gray-500">
                      {student.emergency_contact_1_relationship} &middot; {student.emergency_contact_1_phone}
                    </p>
                  </div>
                )}
                {student.emergency_contact_2_name && (
                  <div>
                    <p className="font-medium">{student.emergency_contact_2_name}</p>
                    <p className="text-xs text-gray-500">
                      {student.emergency_contact_2_relationship} &middot; {student.emergency_contact_2_phone}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Notes ({notes?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!notes || notes.length === 0) ? (
                <p className="text-sm text-gray-400 text-center py-2">
                  No notes
                </p>
              ) : (
                <div className="space-y-3">
                  {(notes as Record<string, unknown>[]).map((note) => {
                    const author = note.author as Record<string, string> | null;
                    return (
                      <div key={note.id as string} className="border-b border-gray-100 pb-2 last:border-0">
                        <p className="text-sm text-gray-800">{note.content as string}</p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {author
                            ? `${author.first_name} ${author.last_name}`
                            : "System"}{" "}
                          &middot;{" "}
                          {new Date(note.created_at as string).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
