"use client";

import { useState, useEffect, useMemo, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  familyCompleteRegistrationItem,
  familySubmitRegistrationPacket,
} from "./actions";
import { getPolicyText } from "./policy-content";
import { SignaturePad } from "@/components/ui/signature-pad";
import { useLocale } from "@/lib/i18n/locale-context";
import { type TranslationKey } from "@/lib/i18n/translations";
import { uploadFile, validateFile, formatFileSize, formatFileValidationError, UPLOAD_ERROR_TRANSLATION_KEY, type FileValidationError, type UploadErrorCode } from "@/lib/storage/upload";
import { compressImageFile } from "@/lib/storage/compress-image";
import { familyCreateDocumentRecord } from "@/app/family/applications/actions";
import {
  IconClipboardList,
  IconFileText,
  IconGraduationCap,
  IconCheckCircle,
  IconInbox,
  IconPaperclip,
  IconHeartPulse,
  IconSettings,
  IconInfo,
} from "@/components/ui/icons";

interface RegistrationItem {
  id: string;
  item_type: string;
  status: string;
  signed_at: string | null;
  verified_at: string | null;
  data: Record<string, unknown>;
}

interface PacketRequirement {
  item_type: string;
  name: string;
  description: string;
  is_required: boolean;
  sort_order: number;
}

export interface EnrollmentRegistration {
  enrollment_id: string;
  application_id: string;
  student_id: string;
  student_name: string;
  campus_name: string;
  campus_id: string;
  grade: string;
  school_year: string;
  enrollment_status: string;
  packet: {
    id: string;
    status: string;
    started_at: string | null;
    submitted_at: string | null;
    verified_at: string | null;
  } | null;
  items: RegistrationItem[];
  requirements: PacketRequirement[];
  /** Application-sourced starting values per item_type ("verify, don't re-enter"). */
  prefill: Record<string, Record<string, string | boolean>>;
}

interface RegistrationClientProps {
  enrollments: EnrollmentRegistration[];
  userId: string;
}

/* ─── Category icons (labels come from translations) ─── */
const ITEM_CATEGORY_ICONS: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  health:   IconHeartPulse,
  policies: IconClipboardList,
  records:  IconFileText,
  services: IconSettings,
};

const ITEM_TO_CATEGORY: Record<string, string> = {
  emergency_contact: "health",
  medical_info: "health",
  medication_auth: "health",
  food_allergy_plan: "health",
  immunization_records: "health",
  lthc_form: "health",
  sc_health_exam: "health",
  sc_dental_screen: "health",
  wa_health_exam: "health",
  sports_physical: "health",
  tech_policy: "policies",
  handbook_ack: "policies",
  discipline_policy: "policies",
  media_release: "policies",
  field_trip: "policies",
  internet_safety: "policies",
  anti_bullying: "policies",
  uniform_policy: "policies",
  ferpa_consent: "policies",
  pickup_auth: "records",
  proof_of_residency: "records",
  proof_of_age: "records",
  parent_id: "records",
  custody_docs: "records",
  oh_custody_affidavit: "records",
  student_photo: "records",
  previous_school_records: "records",
  iep_records: "records",
  "504_plan": "records",
  home_language_survey: "records",
  mckinney_vento: "records",
  income_verification: "services",
  frl_app: "services",
  military_family: "services",
  transport: "services",
  before_after_care: "services",
};

/* ─── Completion modes per item type ───
 * All family-visible strings (titles, descriptions, field labels,
 * placeholders, select options, upload examples) live in translations.ts
 * under the reg.item.* namespace — see ITEM_COMPLETION_CONFIG below, which
 * stores only TranslationKeys, never hardcoded English. Select option
 * *values* stay as stable English slugs (they're the persisted form_data
 * values staff read back) — only the displayed label is translated. */

type FieldOption = { value: string; labelKey: TranslationKey };

type FieldDef = {
  key: string;
  labelKey: TranslationKey;
  type: "text" | "tel" | "email" | "select" | "textarea" | "checkbox" | "date" | "phone";
  placeholderKey?: TranslationKey;
  options?: FieldOption[];
  required?: boolean;
};

type CompletionConfig =
  | { mode: "form"; titleKey: TranslationKey; descKey: TranslationKey; fields: FieldDef[] }
  | { mode: "acknowledge"; titleKey: TranslationKey; descKey: TranslationKey }
  | { mode: "upload"; titleKey: TranslationKey; descKey: TranslationKey; exampleKeys: TranslationKey[] };

const ITEM_COMPLETION_CONFIG: Record<string, CompletionConfig> = {
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

function getCompletionConfig(itemType: string): CompletionConfig {
  return ITEM_COMPLETION_CONFIG[itemType] ?? {
    mode: "acknowledge",
    titleKey: "reg.item.fallback.title",
    descKey: "reg.item.fallback.desc",
  };
}

function getButtonLabel(itemType: string, t: (key: TranslationKey) => string): string {
  const config = getCompletionConfig(itemType);
  if (config.mode === "form") return t("reg.btn.fillOut");
  if (config.mode === "upload") return t("reg.btn.upload");
  return t("reg.btn.reviewAgree");
}

export function RegistrationClient({ enrollments, userId }: RegistrationClientProps) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const localeTag = locale === "es" ? "es-US" : "en-US";
  const [activeEnrollment, setActiveEnrollment] = useState(0);
  const [loadingItem, setLoadingItem] = useState<string | null>(null);
  const [submittingPacket, setSubmittingPacket] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionTarget, setCompletionTarget] = useState<{ itemId: string; itemType: string; itemName: string } | null>(null);
  const [completionForm, setCompletionForm] = useState<Record<string, string | boolean>>({});
  const [wasPrefilled, setWasPrefilled] = useState(false);
  const [completionAck, setCompletionAck] = useState(false);
  const [uploadSelectedFile, setUploadSelectedFile] = useState<File | null>(null);
  const [uploadWasCompressed, setUploadWasCompressed] = useState(false);
  const [uploadCompressing, setUploadCompressing] = useState(false);
  const [uploadValidationError, setUploadValidationError] = useState<FileValidationError | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  // Errors raised while completing an item are shown INSIDE the dialog, not in
  // the page-level banner far above the fold, so a family that just drew a
  // signature actually sees why the save failed.
  const [completionError, setCompletionError] = useState<string | null>(null);

  if (enrollments.length === 0) {
    return (
      <div className="text-center py-16 max-w-md mx-auto">
        <div className="flex justify-center text-rooted-green mb-4">
          <IconClipboardList size={40} />
        </div>
        <h3 className="text-lg font-semibold text-ink mb-2">{t("reg.emptyTitle")}</h3>
        <p className="text-stone-text text-sm">
          {t("reg.emptyBody")} <a href="/family/offers" className="text-rooted-green underline font-medium">{t("offers.heading")}</a> {t("reg.emptyBodyEnd")}
        </p>
      </div>
    );
  }

  const enrollment = enrollments[activeEnrollment];
  const completedCount = enrollment.items.filter(
    (i) => i.status === "submitted" || i.status === "verified"
  ).length;
  const totalRequired = enrollment.requirements.filter(
    (r) => r.is_required
  ).length;
  const totalItems = enrollment.requirements.length;

  // Map items by type for lookup
  const itemsByType: Record<string, RegistrationItem> = {};
  for (const item of enrollment.items) {
    itemsByType[item.item_type] = item;
  }

  // Required items must all be done to submit; optional items can be skipped
  const requiredRequirements = enrollment.requirements.filter((r) => r.is_required);
  const allRequiredComplete = requiredRequirements.every((req) => {
    const item = itemsByType[req.item_type];
    return item && (item.status === "submitted" || item.status === "verified");
  });
  const allItemsComplete = enrollment.requirements.every((req) => {
    const item = itemsByType[req.item_type];
    return item && (item.status === "submitted" || item.status === "verified");
  });

  const packetSubmitted =
    enrollment.packet?.status === "submitted" ||
    enrollment.packet?.status === "complete";

  function openCompletionDialog(itemId: string, itemType: string, itemName: string) {
    // Starting values: previously saved answers win, then application
    // pre-fill, then a blank form. Families verify instead of re-entering.
    const saved = itemsByType[itemType]?.data;
    const savedValues =
      saved && typeof saved === "object" && Object.keys(saved).length > 0
        ? Object.fromEntries(
            Object.entries(saved).filter(
              (entry): entry is [string, string | boolean] =>
                typeof entry[1] === "string" || typeof entry[1] === "boolean"
            )
          )
        : null;
    const prefillValues = enrollment.prefill?.[itemType] ?? null;

    setCompletionTarget({ itemId, itemType, itemName });
    setCompletionForm(savedValues ?? prefillValues ?? {});
    setWasPrefilled(!savedValues && !!prefillValues);
    setCompletionAck(false);
    setUploadSelectedFile(null);
    setUploadWasCompressed(false);
    setUploadValidationError(null);
    setSignatureDataUrl(null);
    setError(null);
    setCompletionError(null);
    setCompletionOpen(true);
  }

  async function doCompleteItem() {
    if (!completionTarget) return;
    const { itemId, itemType, itemName } = completionTarget;
    const config = getCompletionConfig(itemType);

    // The dialog deliberately stays OPEN while the save is in flight. Closing
    // it first unmounted the signature pad, so any failure wiped a signature
    // the family had already drawn and forced them to draw it again.
    setLoadingItem(itemId);
    setError(null);
    setCompletionError(null);
    setSuccess(null);

    const payload: Record<string, unknown> = {
      acknowledged: true,
      completed_at: new Date().toISOString(),
    };

    if (config.mode === "form") {
      payload.form_data = { ...completionForm };
    }

    if (config.mode === "acknowledge" && signatureDataUrl) {
      payload.signature_data_url = signatureDataUrl;
    }

    if (config.mode === "upload" && uploadSelectedFile) {
      const uploadResult = await uploadFile(uploadSelectedFile, userId);
      if (uploadResult.error) {
        // Keep the dialog and everything they entered; show why it failed here.
        // Map the stable upload code to a translated message rather than
        // showing the family a raw code like "upload_failed".
        setCompletionError(
          t(UPLOAD_ERROR_TRANSLATION_KEY[uploadResult.error as UploadErrorCode] ?? "docs.error.uploadFailed")
        );
        setLoadingItem(null);
        return;
      }
      await familyCreateDocumentRecord({
        application_id: enrollment.application_id,
        student_id: enrollment.student_id,
        document_type: itemType,
        file_name: uploadResult.fileName,
        file_size: uploadResult.fileSize,
        mime_type: uploadResult.mimeType,
        storage_path: uploadResult.storagePath,
      });
      payload.storage_path = uploadResult.storagePath;
      payload.file_name = uploadResult.fileName;
    }

    const result = await familyCompleteRegistrationItem(itemId, payload);

    if (result.error) {
      // Failure path: leave the dialog open with the signature, form answers
      // and selected file intact so the family can simply press submit again.
      setCompletionError(result.error);
      setLoadingItem(null);
      return;
    }

    setSuccess(`"${itemName}" ${t("reg.itemCompleted")}`);
    router.refresh();
    setLoadingItem(null);
    setCompletionOpen(false);
    setCompletionTarget(null);
    setCompletionError(null);
    setUploadSelectedFile(null);
    setUploadWasCompressed(false);
    setUploadValidationError(null);
    setSignatureDataUrl(null);
  }

  async function handleSubmitPacket() {
    setSubmittingPacket(true);
    setError(null);
    setSuccess(null);

    const result = await familySubmitRegistrationPacket(
      enrollment.enrollment_id
    );

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(t("reg.packetSubmitSuccess"));
      router.refresh();
    }
    setSubmittingPacket(false);
  }

  // Group requirements by category and precompute progress in one pass
  const { groupedRequirements, categoryProgress } = useMemo(() => {
    const groups: Record<string, PacketRequirement[]> = {};
    for (const req of enrollment.requirements) {
      const cat = ITEM_TO_CATEGORY[req.item_type] ?? "records";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(req);
    }
    const progress: Record<string, { done: number; total: number }> = {};
    for (const [cat, reqs] of Object.entries(groups)) {
      const done = reqs.filter((r) => {
        const item = itemsByType[r.item_type];
        return item && (item.status === "submitted" || item.status === "verified");
      }).length;
      progress[cat] = { done, total: reqs.length };
    }
    return { groupedRequirements: groups, categoryProgress: progress };
  }, [enrollment.requirements, itemsByType]);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/family/dashboard" className="text-sm text-rooted-green hover:underline">
        ← {t("common.backToDashboard")}
      </Link>

      {/* Feedback banners */}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Welcome Banner */}
      {!packetSubmitted && (
        <Card className="border-rooted-green/30 bg-rooted-green/5">
          <CardContent className="py-5">
            <div className="flex items-start gap-4">
              <span className="text-rooted-green shrink-0" aria-hidden="true">
                <IconGraduationCap size={32} />
              </span>
              <div>
                <p className="text-base font-bold text-ink">
                  {t("reg.welcome")}
                </p>
                <p className="text-sm text-ink/60 mt-0.5">
                  {allRequiredComplete
                    ? t("reg.allRequiredOptional")
                    : t("reg.completeItems")}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Student Selector (if multiple enrollments) */}
      {enrollments.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {enrollments.map((enr, idx) => {
            const enrCompletedCount = enr.items.filter(
              (i) => i.status === "submitted" || i.status === "verified"
            ).length;
            const enrTotalItems = enr.requirements.length;
            return (
              <button
                key={enr.enrollment_id}
                onClick={() => {
                  setActiveEnrollment(idx);
                  setError(null);
                  setSuccess(null);
                }}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  idx === activeEnrollment
                    ? "bg-rooted-green text-white shadow-sm"
                    : "bg-rooted-gray text-ink/70 hover:bg-rooted-gray-dark/30"
                }`}
              >
                {enr.student_name}
                <span className={`text-xs ${idx === activeEnrollment ? "text-white/70" : "text-stone-text"}`}>
                  {enrCompletedCount}/{enrTotalItems}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Progress Card */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                {enrollment.student_name}
              </p>
              <p className="text-xs text-stone-text">
                {enrollment.campus_name} &middot; {t("apps.grade")} {enrollment.grade}{" "}
                &middot; {enrollment.school_year}
              </p>
            </div>
            <Badge
              variant={
                packetSubmitted
                  ? "default"
                  : allRequiredComplete
                    ? "success"
                    : "secondary"
              }
            >
              {packetSubmitted
                ? enrollment.packet?.status === "complete"
                  ? t("reg.complete")
                  : t("reg.underReviewBadge")
                : allRequiredComplete
                  ? t("reg.readyToSubmit")
                  : `${completedCount}/${totalItems} ${t("common.done")}`}
            </Badge>
          </div>
          {/* Progress bar */}
          <div
            className="w-full bg-rooted-gray-dark/30 rounded-full h-3"
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemin={0}
            aria-valuemax={totalItems}
            aria-label={t("reg.progressAria")}
          >
            <div
              className={`h-3 rounded-full transition-all ${
                packetSubmitted ? "bg-blue-500" : allItemsComplete ? "bg-rooted-green" : "bg-rooted-green"
              }`}
              style={{
                width: `${totalItems > 0 ? (completedCount / totalItems) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-stone-text">
              {completedCount} {t("reg.of")} {totalItems} {t("reg.itemsCompleted")}
              {totalRequired > 0 && totalRequired < totalItems && (
                <span className="text-stone-text"> &middot; {totalRequired} {t("reg.requiredCount")}</span>
              )}
            </p>
            {!packetSubmitted && completedCount < totalItems && (
              <p className="text-xs text-amber-600 font-medium">
                {totalItems - completedCount} {t("reg.itemsRemaining")}
              </p>
            )}
          </div>
          {/* Category mini-progress */}
          {Object.keys(groupedRequirements).length > 1 && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-rooted-gray">
              {Object.keys(ITEM_CATEGORY_ICONS).map((catKey) => {
                if (!groupedRequirements[catKey]) return null;
                const prog = categoryProgress[catKey] ?? { done: 0, total: 0 };
                const CategoryIcon = ITEM_CATEGORY_ICONS[catKey];
                return (
                  <div key={catKey} className="flex items-center gap-1.5">
                    <span className="text-stone">
                      <CategoryIcon size={14} />
                    </span>
                    <span className="text-[10px] text-stone-text">
                      {t(`reg.cat.${catKey}` as TranslationKey)}
                    </span>
                    <span className={`text-[10px] font-bold ${prog.done === prog.total ? "text-green-600" : "text-stone-text"}`}>
                      {prog.done}/{prog.total}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help section */}
      {!packetSubmitted && (
        <div className="text-center py-2">
          <p className="text-xs text-stone-text">
            {t("reg.needHelp")}
          </p>
        </div>
      )}

      {/* Registration Items — Grouped by Category */}
      {enrollment.requirements.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-stone-text">
              {t("reg.noRequirements")}
            </p>
            <p className="text-xs text-stone-text mt-1">
              {t("reg.checkBackSoon")}
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.keys(ITEM_CATEGORY_ICONS).map((catKey) => {
          const reqs = groupedRequirements[catKey];
          if (!reqs || reqs.length === 0) return null;
          const prog = categoryProgress[catKey] ?? { done: 0, total: 0 };
          const allDone = prog.done === prog.total;
          const CategoryIcon = ITEM_CATEGORY_ICONS[catKey];

          return (
            <Card key={catKey} className={allDone ? "border-green-200/60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-ink/70">
                      <CategoryIcon size={20} />
                    </span>
                    <CardTitle className="text-sm">{t(`reg.cat.${catKey}` as TranslationKey)}</CardTitle>
                  </div>
                  <span className={`text-xs font-semibold ${allDone ? "text-green-600" : "text-stone-text"}`}>
                    {prog.done}/{prog.total} {t("common.complete")}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {reqs.map((req) => {
                  const item = itemsByType[req.item_type];
                  const status = item?.status ?? "pending";
                  const isLoading = loadingItem === item?.id;

                  return (
                    <div
                      key={req.item_type}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        status === "verified"
                          ? "border-green-200 bg-green-50/40"
                          : status === "submitted"
                            ? "border-blue-200 bg-blue-50/30"
                            : "border-stone/20 hover:border-stone/30 hover:bg-rooted-gray-light"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-ink">
                              {req.name}
                            </p>
                            {req.is_required && (
                              <span className="text-[10px] text-red-500 font-semibold uppercase">
                                {t("reg.required")}
                              </span>
                            )}
                          </div>
                          {req.description && (
                            <p className="text-xs text-stone-text mt-0.5 line-clamp-1">
                              {req.description}
                            </p>
                          )}
                          {item?.signed_at && (
                            <p className="text-[10px] text-stone-text mt-0.5">
                              {t("reg.completedOn")}{" "}
                              {new Date(item.signed_at).toLocaleDateString(localeTag, {
                                month: "short",
                                day: "numeric",
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {status === "pending" && item && (
                          <Button
                            size="sm"
                            disabled={isLoading}
                            onClick={() =>
                              openCompletionDialog(item.id, req.item_type, req.name)
                            }
                            className="bg-rooted-green hover:bg-rooted-green/90 text-white"
                          >
                            {isLoading ? t("reg.btn.saving") : getButtonLabel(req.item_type, t)}
                          </Button>
                        )}
                        {status === "pending" && !item && (
                          <Badge className="text-[10px] bg-rooted-gray text-stone-text">
                            {t("reg.awaitingSetup")}
                          </Badge>
                        )}
                        {status === "submitted" && (
                          <div className="flex items-center gap-1.5">
                            <svg
                              className="w-4 h-4 text-blue-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span className="text-xs text-blue-600 font-medium">{t("common.done")}</span>
                          </div>
                        )}
                        {status === "verified" && (
                          <div className="flex items-center gap-1.5">
                            <svg
                              className="w-4 h-4 text-green-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                            <span className="text-xs text-green-600 font-medium">{t("common.verified")}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Submit Packet Button */}
      {allRequiredComplete && !packetSubmitted && (
        <Card className="border-rooted-green bg-rooted-green/5 shadow-md">
          <CardContent className="py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <span className="text-rooted-green shrink-0" aria-hidden="true">
                  <IconCheckCircle size={24} />
                </span>
                <div>
                  <p className="text-base font-bold text-ink">
                    {allItemsComplete ? t("reg.allComplete") : t("reg.requiredComplete")}
                  </p>
                  <p className="text-sm text-ink/60">
                    {allItemsComplete
                      ? t("reg.allRequired")
                      : t("reg.submitNow")}
                  </p>
                </div>
              </div>
              <Button
                disabled={submittingPacket}
                onClick={handleSubmitPacket}
                className="bg-rooted-green hover:bg-rooted-green/90 text-white px-6"
                size="lg"
              >
                {submittingPacket ? t("reg.submitting") : t("reg.submitPacket")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submitted confirmation */}
      {packetSubmitted && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="py-6 text-center">
            <div className="flex justify-center text-green-700 mb-3" aria-hidden="true">
              {enrollment.packet?.status === "complete" ? (
                <IconGraduationCap size={36} />
              ) : (
                <IconInbox size={36} />
              )}
            </div>
            <p className="text-lg font-bold text-green-800">
              {enrollment.packet?.status === "complete"
                ? t("reg.packComplete")
                : t("reg.packSubmitted")}
            </p>
            <p className="text-sm text-green-600 mt-1 max-w-md mx-auto">
              {enrollment.packet?.status === "complete"
                ? t("reg.allVerified")
                : t("reg.underReview")}
            </p>
            <Link href="/family/dashboard">
              <Button variant="outline" size="sm" className="mt-4">
                {t("common.backToDashboard")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Completion Dialog */}
      {completionTarget && (() => {
        const config = getCompletionConfig(completionTarget.itemType);
        const canSubmit =
          config.mode === "form"
            ? config.fields.every((f) =>
                !f.required || (completionForm[f.key] !== undefined && completionForm[f.key] !== "")
              )
            : config.mode === "acknowledge"
              ? completionAck && !!signatureDataUrl
              : !!uploadSelectedFile && !uploadValidationError; // upload mode: file selected and valid

        const isSavingItem = loadingItem === completionTarget.itemId;

        return (
          <Dialog
            open={completionOpen}
            onOpenChange={(open) => {
              // Don't let a stray click dismiss the dialog mid-save — that is
              // what used to lose the signature.
              if (!open && isSavingItem) return;
              setCompletionOpen(open);
              if (!open) setCompletionError(null);
            }}
          >
            <DialogContent closeLabel={t("common.close")}>
              <DialogHeader>
                <DialogTitle>{t(config.titleKey)}</DialogTitle>
                <DialogDescription>{t(config.descKey)}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {config.mode === "form" && wasPrefilled && (
                  <p className="flex items-start gap-1.5 text-xs text-rooted-green bg-rooted-green/5 border border-rooted-green/20 rounded-md px-3 py-2">
                    <IconCheckCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{t("reg.prefilledHint")}</span>
                  </p>
                )}
                {config.mode === "form" && config.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-ink/70 mb-1">
                      {t(field.labelKey)}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {field.type === "select" && field.options ? (
                      <select
                        value={(completionForm[field.key] as string) ?? ""}
                        onChange={(e) =>
                          setCompletionForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                      >
                        <option value="">{t("common.select")}</option>
                        {field.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        value={(completionForm[field.key] as string) ?? ""}
                        onChange={(e) =>
                          setCompletionForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
                        rows={3}
                        className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                      />
                    ) : (
                      <Input
                        type={field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
                        value={(completionForm[field.key] as string) ?? ""}
                        onChange={(e) =>
                          setCompletionForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
                      />
                    )}
                  </div>
                ))}

                {config.mode === "acknowledge" && (() => {
                  // Families e-sign this text, so it must be in the language
                  // they are reading the packet in.
                  const policyText = getPolicyText(enrollment.campus_id, completionTarget.itemType, locale);
                  return (
                    <>
                      {policyText && (
                        <div className="max-h-64 overflow-y-auto rounded-lg border border-stone/20 bg-rooted-gray/30 p-4">
                          <p className="text-sm text-ink/80 whitespace-pre-wrap leading-relaxed">{policyText}</p>
                        </div>
                      )}
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={completionAck}
                          onChange={(e) => setCompletionAck(e.target.checked)}
                          className="mt-0.5 w-4 h-4 rounded border-stone/30 text-rooted-green focus:ring-rooted-green"
                        />
                        <span className="text-sm text-ink/70">
                          {t("reg.dialog.iAgree")}
                        </span>
                      </label>
                      {completionAck && (
                        <div className="space-y-1.5">
                          <p className="text-sm font-medium text-ink/70">{t("reg.dialog.yourSignature")}</p>
                          <SignaturePad
                            onChange={setSignatureDataUrl}
                            placeholder={t("reg.dialog.signHere")}
                            drawInstruction={t("reg.dialog.signInstruct")}
                            clearLabel={t("reg.dialog.clear")}
                          />
                          {!signatureDataUrl && (
                            <p className="text-xs text-amber-600">
                              {t("reg.dialog.signRequired")}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}

                {config.mode === "upload" && (
                  <div className="space-y-3">
                    {config.exampleKeys.length > 0 && (
                      <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3">
                        <p className="text-xs font-semibold text-blue-800 mb-1.5">{t("reg.upload.whatToUpload")}</p>
                        <ul className="space-y-1">
                          {config.exampleKeys.map((exKey) => (
                            <li key={exKey} className="flex items-start gap-2 text-xs text-blue-700">
                              <span className="mt-0.5 shrink-0">•</span>
                              <span>{t(exKey)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div
                      className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                        uploadSelectedFile
                          ? "border-rooted-green/40 bg-rooted-green/5"
                          : "border-stone/30 hover:border-stone/50"
                      }`}
                    >
                      {/* No capture attribute: the native chooser offers
                          camera, photo library, and files. Selected images are
                          compressed client-side before validation, so the 10MB
                          limit is rarely the blocker. */}
                      <input
                        type="file"
                        id="reg-upload-input"
                        accept="image/*,application/pdf"
                        disabled={uploadCompressing}
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadCompressing(true);
                          try {
                            const { file: processed, wasCompressed } = await compressImageFile(file);
                            const err = validateFile(processed);
                            setUploadValidationError(err);
                            setUploadSelectedFile(err ? null : processed);
                            setUploadWasCompressed(!err && wasCompressed);
                          } finally {
                            setUploadCompressing(false);
                          }
                        }}
                      />
                      {uploadCompressing ? (
                        <p className="text-sm text-stone-text">{t("common.loading")}</p>
                      ) : uploadSelectedFile ? (
                        <div className="space-y-1">
                          <div className="flex justify-center text-rooted-green">
                            <IconCheckCircle size={28} />
                          </div>
                          <p className="text-sm font-medium text-ink">{uploadSelectedFile.name}</p>
                          <p className="text-xs text-stone-text">
                            {formatFileSize(uploadSelectedFile.size)}
                            {uploadWasCompressed ? ` · ${t("docs.compressed")}` : ""}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setUploadSelectedFile(null);
                              setUploadWasCompressed(false);
                              setUploadValidationError(null);
                              const input = document.getElementById("reg-upload-input") as HTMLInputElement;
                              if (input) input.value = "";
                            }}
                            className="text-xs text-rooted-green hover:underline mt-1"
                          >
                            {t("reg.upload.chooseDifferent")}
                          </button>
                        </div>
                      ) : (
                        <label htmlFor="reg-upload-input" className="cursor-pointer block">
                          <div className="flex justify-center text-stone mb-2">
                            <IconPaperclip size={28} />
                          </div>
                          <p className="text-sm font-medium text-ink">{t("reg.upload.clickToChoose")}</p>
                          <p className="text-xs text-stone-text mt-1">{t("reg.upload.formats")}</p>
                        </label>
                      )}
                    </div>
                    <p className="flex items-start gap-1 text-xs text-stone-text">
                      <IconInfo size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{t("docs.captureHint")}</span>
                    </p>
                    {uploadValidationError && (
                      <p className="text-xs text-red-600">{formatFileValidationError(uploadValidationError, locale)}</p>
                    )}
                  </div>
                )}
              </div>

              {completionError && (
                <div
                  role="alert"
                  className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700 space-y-1"
                >
                  <p>{completionError}</p>
                  <p className="text-xs">
                    {config.mode === "acknowledge" && signatureDataUrl
                      ? t("reg.dialog.errorSignatureKept")
                      : t("reg.dialog.errorTryAgain")}
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={isSavingItem}
                  onClick={() => {
                    setCompletionOpen(false);
                    setCompletionError(null);
                  }}
                >
                  {t("reg.dialog.cancel")}
                </Button>
                <Button
                  onClick={doCompleteItem}
                  disabled={!canSubmit || isSavingItem}
                  className="bg-rooted-green hover:bg-rooted-green/90 text-white"
                >
                  {isSavingItem
                    ? t("reg.btn.saving")
                    : config.mode === "form"
                      ? t("reg.dialog.submit")
                      : config.mode === "upload"
                        ? t("reg.dialog.uploadComplete")
                        : t("reg.dialog.confirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
