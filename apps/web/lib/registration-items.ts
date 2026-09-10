import { type TranslationKey } from "@/lib/i18n/translations";

/**
 * Registration packet form schema — the single source of truth for what each
 * registration item asks a family, shared by the family registration flow
 * (app/family/registration/registration-client.tsx) and the staff-side
 * read-only preview (Settings → registration packet).
 *
 * Extracted verbatim from the family client so both render the exact same
 * fields; all family-visible strings stay as TranslationKeys (reg.item.*).
 * Modes: "form" (data-entry fields), "acknowledge" (review + agree), "upload"
 * (document with examples).
 */

export type FieldOption = { value: string; labelKey: TranslationKey };

export type FieldDef = {
  key: string;
  labelKey: TranslationKey;
  type: "text" | "tel" | "email" | "select" | "textarea" | "checkbox" | "date" | "phone";
  placeholderKey?: TranslationKey;
  options?: FieldOption[];
  required?: boolean;
};

export type CompletionConfig =
  | { mode: "form"; titleKey: TranslationKey; descKey: TranslationKey; fields: FieldDef[] }
  | { mode: "acknowledge"; titleKey: TranslationKey; descKey: TranslationKey }
  | { mode: "upload"; titleKey: TranslationKey; descKey: TranslationKey; exampleKeys: TranslationKey[] };

export const ITEM_COMPLETION_CONFIG: Record<string, CompletionConfig> = {
  // ─── Data Entry Forms ───
  emergency_contact: {
    mode: "form",
    titleKey: "reg.item.emergency_contact.title",
    descKey: "reg.item.emergency_contact.desc",
    fields: [
      { key: "contact_name", labelKey: "reg.item.emergency_contact.field.contact_name.label", type: "text", placeholderKey: "reg.item.emergency_contact.field.contact_name.placeholder", required: true },
      {
        key: "relationship",
        labelKey: "reg.item.emergency_contact.field.relationship.label",
        type: "select",
        required: true,
        options: [
          { value: "Parent", labelKey: "reg.item.emergency_contact.field.relationship.opt.parent" },
          { value: "Grandparent", labelKey: "reg.item.emergency_contact.field.relationship.opt.grandparent" },
          { value: "Aunt/Uncle", labelKey: "reg.item.emergency_contact.field.relationship.opt.aunt_uncle" },
          { value: "Sibling", labelKey: "reg.item.emergency_contact.field.relationship.opt.sibling" },
          { value: "Family Friend", labelKey: "reg.item.emergency_contact.field.relationship.opt.family_friend" },
          { value: "Other", labelKey: "reg.item.emergency_contact.field.relationship.opt.other" },
        ],
      },
      { key: "phone", labelKey: "reg.item.emergency_contact.field.phone.label", type: "tel", placeholderKey: "reg.item.emergency_contact.field.phone.placeholder", required: true },
      { key: "alt_phone", labelKey: "reg.item.emergency_contact.field.alt_phone.label", type: "tel", placeholderKey: "reg.item.emergency_contact.field.alt_phone.placeholder" },
    ],
  },
  medical_info: {
    mode: "form",
    titleKey: "reg.item.medical_info.title",
    descKey: "reg.item.medical_info.desc",
    fields: [
      { key: "physician_name", labelKey: "reg.item.medical_info.field.physician_name.label", type: "text", placeholderKey: "reg.item.medical_info.field.physician_name.placeholder", required: true },
      { key: "physician_phone", labelKey: "reg.item.medical_info.field.physician_phone.label", type: "tel", placeholderKey: "reg.item.medical_info.field.physician_phone.placeholder", required: true },
      { key: "insurance_provider", labelKey: "reg.item.medical_info.field.insurance_provider.label", type: "text", placeholderKey: "reg.item.medical_info.field.insurance_provider.placeholder" },
      { key: "policy_number", labelKey: "reg.item.medical_info.field.policy_number.label", type: "text", placeholderKey: "reg.item.medical_info.field.policy_number.placeholder" },
      { key: "allergies", labelKey: "reg.item.medical_info.field.allergies.label", type: "textarea", placeholderKey: "reg.item.medical_info.field.allergies.placeholder" },
      { key: "conditions", labelKey: "reg.item.medical_info.field.conditions.label", type: "textarea", placeholderKey: "reg.item.medical_info.field.conditions.placeholder" },
    ],
  },
  medication_auth: {
    mode: "form",
    titleKey: "reg.item.medication_auth.title",
    descKey: "reg.item.medication_auth.desc",
    fields: [
      { key: "medication_name", labelKey: "reg.item.medication_auth.field.medication_name.label", type: "text", placeholderKey: "reg.item.medication_auth.field.medication_name.placeholder", required: true },
      { key: "dosage", labelKey: "reg.item.medication_auth.field.dosage.label", type: "text", placeholderKey: "reg.item.medication_auth.field.dosage.placeholder", required: true },
      { key: "frequency", labelKey: "reg.item.medication_auth.field.frequency.label", type: "text", placeholderKey: "reg.item.medication_auth.field.frequency.placeholder", required: true },
      { key: "reason", labelKey: "reg.item.medication_auth.field.reason.label", type: "text", placeholderKey: "reg.item.medication_auth.field.reason.placeholder" },
      { key: "authorize", labelKey: "reg.item.medication_auth.field.authorize.label", type: "checkbox", required: true },
    ],
  },
  food_allergy_plan: {
    mode: "form",
    titleKey: "reg.item.food_allergy_plan.title",
    descKey: "reg.item.food_allergy_plan.desc",
    fields: [
      { key: "allergens", labelKey: "reg.item.food_allergy_plan.field.allergens.label", type: "textarea", placeholderKey: "reg.item.food_allergy_plan.field.allergens.placeholder", required: true },
      {
        key: "severity",
        labelKey: "reg.item.food_allergy_plan.field.severity.label",
        type: "select",
        required: true,
        options: [
          { value: "Mild", labelKey: "reg.item.food_allergy_plan.field.severity.opt.mild" },
          { value: "Moderate", labelKey: "reg.item.food_allergy_plan.field.severity.opt.moderate" },
          { value: "Severe / Anaphylaxis", labelKey: "reg.item.food_allergy_plan.field.severity.opt.severe" },
        ],
      },
      { key: "symptoms", labelKey: "reg.item.food_allergy_plan.field.symptoms.label", type: "textarea", placeholderKey: "reg.item.food_allergy_plan.field.symptoms.placeholder" },
      { key: "treatment", labelKey: "reg.item.food_allergy_plan.field.treatment.label", type: "textarea", placeholderKey: "reg.item.food_allergy_plan.field.treatment.placeholder", required: true },
      { key: "epipen_onsite", labelKey: "reg.item.food_allergy_plan.field.epipen_onsite.label", type: "checkbox" },
    ],
  },
  pickup_auth: {
    mode: "form",
    titleKey: "reg.item.pickup_auth.title",
    descKey: "reg.item.pickup_auth.desc",
    fields: [
      { key: "contact1_name", labelKey: "reg.item.pickup_auth.field.contact1_name.label", type: "text", placeholderKey: "reg.item.pickup_auth.field.contact1_name.placeholder", required: true },
      { key: "contact1_relationship", labelKey: "reg.item.pickup_auth.field.contact1_relationship.label", type: "text", placeholderKey: "reg.item.pickup_auth.field.contact1_relationship.placeholder" },
      { key: "contact1_phone", labelKey: "reg.item.pickup_auth.field.contact1_phone.label", type: "tel", placeholderKey: "reg.item.pickup_auth.field.contact1_phone.placeholder", required: true },
      { key: "contact2_name", labelKey: "reg.item.pickup_auth.field.contact2_name.label", type: "text", placeholderKey: "reg.item.pickup_auth.field.contact2_name.placeholder" },
      { key: "contact2_relationship", labelKey: "reg.item.pickup_auth.field.contact2_relationship.label", type: "text", placeholderKey: "reg.item.pickup_auth.field.contact2_relationship.placeholder" },
      { key: "contact2_phone", labelKey: "reg.item.pickup_auth.field.contact2_phone.label", type: "tel", placeholderKey: "reg.item.pickup_auth.field.contact2_phone.placeholder" },
    ],
  },
  home_language_survey: {
    mode: "form",
    titleKey: "reg.item.home_language_survey.title",
    descKey: "reg.item.home_language_survey.desc",
    fields: [
      { key: "home_language", labelKey: "reg.item.home_language_survey.field.home_language.label", type: "text", placeholderKey: "reg.item.home_language_survey.field.home_language.placeholder", required: true },
      { key: "student_first_language", labelKey: "reg.item.home_language_survey.field.student_first_language.label", type: "text", placeholderKey: "reg.item.home_language_survey.field.student_first_language.placeholder", required: true },
      { key: "student_school_language", labelKey: "reg.item.home_language_survey.field.student_school_language.label", type: "text", placeholderKey: "reg.item.home_language_survey.field.student_school_language.placeholder", required: true },
      { key: "other_languages", labelKey: "reg.item.home_language_survey.field.other_languages.label", type: "text", placeholderKey: "reg.item.home_language_survey.field.other_languages.placeholder" },
    ],
  },
  transport: {
    mode: "form",
    titleKey: "reg.item.transport.title",
    descKey: "reg.item.transport.desc",
    fields: [
      {
        key: "arrival_mode",
        labelKey: "reg.item.transport.field.arrival_mode.label",
        type: "select",
        required: true,
        options: [
          { value: "Parent Drop-off", labelKey: "reg.item.transport.field.arrival_mode.opt.parent_dropoff" },
          { value: "School Bus", labelKey: "reg.item.transport.field.arrival_mode.opt.school_bus" },
          { value: "Public Transit", labelKey: "reg.item.transport.field.arrival_mode.opt.public_transit" },
          { value: "Walk/Bike", labelKey: "reg.item.transport.field.arrival_mode.opt.walk_bike" },
          { value: "Carpool", labelKey: "reg.item.transport.field.arrival_mode.opt.carpool" },
          { value: "Other", labelKey: "reg.item.transport.field.arrival_mode.opt.other" },
        ],
      },
      {
        key: "departure_mode",
        labelKey: "reg.item.transport.field.departure_mode.label",
        type: "select",
        required: true,
        options: [
          { value: "Parent Pick-up", labelKey: "reg.item.transport.field.departure_mode.opt.parent_pickup" },
          { value: "School Bus", labelKey: "reg.item.transport.field.departure_mode.opt.school_bus" },
          { value: "Public Transit", labelKey: "reg.item.transport.field.departure_mode.opt.public_transit" },
          { value: "Walk/Bike", labelKey: "reg.item.transport.field.departure_mode.opt.walk_bike" },
          { value: "Carpool", labelKey: "reg.item.transport.field.departure_mode.opt.carpool" },
          { value: "After-School Program", labelKey: "reg.item.transport.field.departure_mode.opt.after_school_program" },
          { value: "Other", labelKey: "reg.item.transport.field.departure_mode.opt.other" },
        ],
      },
      { key: "notes", labelKey: "reg.item.transport.field.notes.label", type: "textarea", placeholderKey: "reg.item.transport.field.notes.placeholder" },
    ],
  },
  before_after_care: {
    mode: "form",
    titleKey: "reg.item.before_after_care.title",
    descKey: "reg.item.before_after_care.desc",
    fields: [
      { key: "before_care", labelKey: "reg.item.before_after_care.field.before_care.label", type: "checkbox" },
      { key: "after_care", labelKey: "reg.item.before_after_care.field.after_care.label", type: "checkbox" },
      {
        key: "days_needed",
        labelKey: "reg.item.before_after_care.field.days_needed.label",
        type: "select",
        required: true,
        options: [
          { value: "Monday-Friday", labelKey: "reg.item.before_after_care.field.days_needed.opt.mon_fri" },
          { value: "Select Days Only", labelKey: "reg.item.before_after_care.field.days_needed.opt.select_days" },
        ],
      },
      { key: "notes", labelKey: "reg.item.before_after_care.field.notes.label", type: "textarea", placeholderKey: "reg.item.before_after_care.field.notes.placeholder" },
    ],
  },
  frl_app: {
    mode: "form",
    titleKey: "reg.item.frl_app.title",
    descKey: "reg.item.frl_app.desc",
    fields: [
      { key: "household_size", labelKey: "reg.item.frl_app.field.household_size.label", type: "text", placeholderKey: "reg.item.frl_app.field.household_size.placeholder", required: true },
      { key: "annual_income", labelKey: "reg.item.frl_app.field.annual_income.label", type: "text", placeholderKey: "reg.item.frl_app.field.annual_income.placeholder", required: true },
      { key: "snap_tanf", labelKey: "reg.item.frl_app.field.snap_tanf.label", type: "checkbox" },
      { key: "foster_child", labelKey: "reg.item.frl_app.field.foster_child.label", type: "checkbox" },
    ],
  },
  military_family: {
    mode: "form",
    titleKey: "reg.item.military_family.title",
    descKey: "reg.item.military_family.desc",
    fields: [
      {
        key: "branch",
        labelKey: "reg.item.military_family.field.branch.label",
        type: "select",
        required: true,
        options: [
          { value: "Army", labelKey: "reg.item.military_family.field.branch.opt.army" },
          { value: "Navy", labelKey: "reg.item.military_family.field.branch.opt.navy" },
          { value: "Air Force", labelKey: "reg.item.military_family.field.branch.opt.air_force" },
          { value: "Marines", labelKey: "reg.item.military_family.field.branch.opt.marines" },
          { value: "Coast Guard", labelKey: "reg.item.military_family.field.branch.opt.coast_guard" },
          { value: "Space Force", labelKey: "reg.item.military_family.field.branch.opt.space_force" },
          { value: "National Guard", labelKey: "reg.item.military_family.field.branch.opt.national_guard" },
        ],
      },
      {
        key: "status",
        labelKey: "reg.item.military_family.field.status.label",
        type: "select",
        required: true,
        options: [
          { value: "Active Duty", labelKey: "reg.item.military_family.field.status.opt.active_duty" },
          { value: "Reserve", labelKey: "reg.item.military_family.field.status.opt.reserve" },
          { value: "Veteran", labelKey: "reg.item.military_family.field.status.opt.veteran" },
          { value: "Retired", labelKey: "reg.item.military_family.field.status.opt.retired" },
        ],
      },
      { key: "deployment_notes", labelKey: "reg.item.military_family.field.deployment_notes.label", type: "textarea", placeholderKey: "reg.item.military_family.field.deployment_notes.placeholder" },
    ],
  },

  // ─── Policy Acknowledgments ───
  income_verification: { mode: "acknowledge", titleKey: "reg.item.income_verification.title", descKey: "reg.item.income_verification.desc" },
  tech_policy: { mode: "acknowledge", titleKey: "reg.item.tech_policy.title", descKey: "reg.item.tech_policy.desc" },
  handbook_ack: { mode: "acknowledge", titleKey: "reg.item.handbook_ack.title", descKey: "reg.item.handbook_ack.desc" },
  discipline_policy: { mode: "acknowledge", titleKey: "reg.item.discipline_policy.title", descKey: "reg.item.discipline_policy.desc" },
  media_release: { mode: "acknowledge", titleKey: "reg.item.media_release.title", descKey: "reg.item.media_release.desc" },
  field_trip: { mode: "acknowledge", titleKey: "reg.item.field_trip.title", descKey: "reg.item.field_trip.desc" },
  internet_safety: { mode: "acknowledge", titleKey: "reg.item.internet_safety.title", descKey: "reg.item.internet_safety.desc" },
  anti_bullying: { mode: "acknowledge", titleKey: "reg.item.anti_bullying.title", descKey: "reg.item.anti_bullying.desc" },
  uniform_policy: { mode: "acknowledge", titleKey: "reg.item.uniform_policy.title", descKey: "reg.item.uniform_policy.desc" },
  ferpa_consent: { mode: "acknowledge", titleKey: "reg.item.ferpa_consent.title", descKey: "reg.item.ferpa_consent.desc" },

  // ─── Document Uploads ───
  immunization_records: {
    mode: "upload",
    titleKey: "reg.item.immunization_records.title",
    descKey: "reg.item.immunization_records.desc",
    exampleKeys: ["reg.item.immunization_records.example.1", "reg.item.immunization_records.example.2", "reg.item.immunization_records.example.3"],
  },
  proof_of_residency: {
    mode: "upload",
    titleKey: "reg.item.proof_of_residency.title",
    descKey: "reg.item.proof_of_residency.desc",
    exampleKeys: ["reg.item.proof_of_residency.example.1", "reg.item.proof_of_residency.example.2", "reg.item.proof_of_residency.example.3", "reg.item.proof_of_residency.example.4"],
  },
  proof_of_age: {
    mode: "upload",
    titleKey: "reg.item.proof_of_age.title",
    descKey: "reg.item.proof_of_age.desc",
    exampleKeys: ["reg.item.proof_of_age.example.1", "reg.item.proof_of_age.example.2", "reg.item.proof_of_age.example.3", "reg.item.proof_of_age.example.4"],
  },
  parent_id: {
    mode: "upload",
    titleKey: "reg.item.parent_id.title",
    descKey: "reg.item.parent_id.desc",
    exampleKeys: ["reg.item.parent_id.example.1", "reg.item.parent_id.example.2", "reg.item.parent_id.example.3", "reg.item.parent_id.example.4"],
  },
  custody_docs: {
    mode: "upload",
    titleKey: "reg.item.custody_docs.title",
    descKey: "reg.item.custody_docs.desc",
    exampleKeys: ["reg.item.custody_docs.example.1", "reg.item.custody_docs.example.2", "reg.item.custody_docs.example.3", "reg.item.custody_docs.example.4"],
  },
  student_photo: {
    mode: "upload",
    titleKey: "reg.item.student_photo.title",
    descKey: "reg.item.student_photo.desc",
    exampleKeys: ["reg.item.student_photo.example.1", "reg.item.student_photo.example.2", "reg.item.student_photo.example.3"],
  },
  sports_physical: {
    mode: "upload",
    titleKey: "reg.item.sports_physical.title",
    descKey: "reg.item.sports_physical.desc",
    exampleKeys: ["reg.item.sports_physical.example.1", "reg.item.sports_physical.example.2", "reg.item.sports_physical.example.3"],
  },
  previous_school_records: {
    mode: "upload",
    titleKey: "reg.item.previous_school_records.title",
    descKey: "reg.item.previous_school_records.desc",
    exampleKeys: ["reg.item.previous_school_records.example.1", "reg.item.previous_school_records.example.2", "reg.item.previous_school_records.example.3", "reg.item.previous_school_records.example.4"],
  },
  iep_records: {
    mode: "upload",
    titleKey: "reg.item.iep_records.title",
    descKey: "reg.item.iep_records.desc",
    exampleKeys: ["reg.item.iep_records.example.1", "reg.item.iep_records.example.2", "reg.item.iep_records.example.3"],
  },
  "504_plan": {
    mode: "upload",
    titleKey: "reg.item.504_plan.title",
    descKey: "reg.item.504_plan.desc",
    exampleKeys: ["reg.item.504_plan.example.1", "reg.item.504_plan.example.2", "reg.item.504_plan.example.3"],
  },
  mckinney_vento: {
    mode: "upload",
    titleKey: "reg.item.mckinney_vento.title",
    descKey: "reg.item.mckinney_vento.desc",
    exampleKeys: ["reg.item.mckinney_vento.example.1", "reg.item.mckinney_vento.example.2"],
  },
  lthc_form: {
    mode: "upload",
    titleKey: "reg.item.lthc_form.title",
    descKey: "reg.item.lthc_form.desc",
    exampleKeys: ["reg.item.lthc_form.example.1", "reg.item.lthc_form.example.2", "reg.item.lthc_form.example.3"],
  },
  sc_health_exam: {
    mode: "upload",
    titleKey: "reg.item.sc_health_exam.title",
    descKey: "reg.item.sc_health_exam.desc",
    exampleKeys: ["reg.item.sc_health_exam.example.1", "reg.item.sc_health_exam.example.2", "reg.item.sc_health_exam.example.3"],
  },
  sc_dental_screen: {
    mode: "upload",
    titleKey: "reg.item.sc_dental_screen.title",
    descKey: "reg.item.sc_dental_screen.desc",
    exampleKeys: ["reg.item.sc_dental_screen.example.1", "reg.item.sc_dental_screen.example.2", "reg.item.sc_dental_screen.example.3"],
  },
  oh_custody_affidavit: {
    mode: "upload",
    titleKey: "reg.item.oh_custody_affidavit.title",
    descKey: "reg.item.oh_custody_affidavit.desc",
    exampleKeys: ["reg.item.oh_custody_affidavit.example.1", "reg.item.oh_custody_affidavit.example.2", "reg.item.oh_custody_affidavit.example.3"],
  },
  wa_health_exam: {
    mode: "upload",
    titleKey: "reg.item.wa_health_exam.title",
    descKey: "reg.item.wa_health_exam.desc",
    exampleKeys: ["reg.item.wa_health_exam.example.1", "reg.item.wa_health_exam.example.2", "reg.item.wa_health_exam.example.3"],
  },
};

export function getCompletionConfig(itemType: string): CompletionConfig {
  return ITEM_COMPLETION_CONFIG[itemType] ?? {
    mode: "acknowledge",
    titleKey: "reg.item.fallback.title",
    descKey: "reg.item.fallback.desc",
  };
}
