"use client";

import { useState, useEffect } from "react";
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
import { uploadFile, validateFile, formatFileSize } from "@/lib/storage/upload";
import { familyCreateDocumentRecord } from "@/app/family/applications/actions";

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
}

interface RegistrationClientProps {
  enrollments: EnrollmentRegistration[];
  userId: string;
}

const ITEM_ICONS: Record<string, string> = {
  emergency_contact: "🚨",
  medical_info: "🏥",
  medication_auth: "💊",
  food_allergy_plan: "🥜",
  tech_policy: "💻",
  handbook_ack: "📖",
  discipline_policy: "📋",
  media_release: "📷",
  field_trip: "🚌",
  internet_safety: "🔒",
  anti_bullying: "🤝",
  uniform_policy: "👔",
  ferpa_consent: "📝",
  pickup_auth: "🚗",
  immunization_records: "💉",
  proof_of_residency: "🏠",
  proof_of_age: "📄",
  lthc_form: "⚕️",
  sc_health_exam: "🩺",
  sc_dental_screen: "🦷",
  oh_custody_affidavit: "⚖️",
  income_verification: "💰",
  iep_records: "📚",
  "504_plan": "♿",
  home_language_survey: "🌐",
  mckinney_vento: "🏘️",
  previous_school_records: "🎓",
  frl_app: "🍽️",
  military_family: "🎖️",
  transport: "🚌",
  before_after_care: "🕐",
  parent_id: "🪪",
  custody_docs: "⚖️",
  student_photo: "📸",
  sports_physical: "🏃",
  wa_health_exam: "🩺",
};

const STATUS_DISPLAY: Record<
  string,
  { label: string; color: string }
> = {
  pending: { label: "Not Started", color: "bg-rooted-gray text-ink/60" },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-800" },
  verified: { label: "Verified", color: "bg-green-100 text-green-800" },
};

/* ─── Categorize items for grouped display ─── */
const ITEM_CATEGORIES: Record<string, { label: string; icon: string }> = {
  health: { label: "Health & Medical", icon: "🏥" },
  policies: { label: "Policies & Agreements", icon: "📋" },
  records: { label: "Records & Documents", icon: "📄" },
  services: { label: "Services & Preferences", icon: "⚙️" },
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

/* ─── Completion modes per item type ─── */

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "tel" | "email" | "select" | "textarea" | "checkbox" | "date" | "phone";
  placeholder?: string;
  options?: string[];
  required?: boolean;
};

type CompletionConfig =
  | { mode: "form"; title: string; description: string; fields: FieldDef[] }
  | { mode: "acknowledge"; title: string; description: string }
  | { mode: "upload"; title: string; description: string };

const ITEM_COMPLETION_CONFIG: Record<string, CompletionConfig> = {
  // ─── Data Entry Forms ───
  emergency_contact: {
    mode: "form",
    title: "Emergency Contact Information",
    description: "Provide emergency contact details for your child.",
    fields: [
      { key: "contact_name", label: "Contact Name", type: "text", placeholder: "Full name", required: true },
      { key: "relationship", label: "Relationship", type: "select", options: ["Parent", "Grandparent", "Aunt/Uncle", "Sibling", "Family Friend", "Other"], required: true },
      { key: "phone", label: "Phone Number", type: "tel", placeholder: "(555) 555-5555", required: true },
      { key: "alt_phone", label: "Alternate Phone", type: "tel", placeholder: "(555) 555-5555" },
    ],
  },
  medical_info: {
    mode: "form",
    title: "Medical Information",
    description: "Provide your child's medical information so the school can respond in an emergency.",
    fields: [
      { key: "physician_name", label: "Physician Name", type: "text", placeholder: "Dr. Smith", required: true },
      { key: "physician_phone", label: "Physician Phone", type: "tel", placeholder: "(555) 555-5555", required: true },
      { key: "insurance_provider", label: "Insurance Provider", type: "text", placeholder: "e.g. Blue Cross" },
      { key: "policy_number", label: "Policy Number", type: "text", placeholder: "Policy or member ID" },
      { key: "allergies", label: "Allergies", type: "textarea", placeholder: "List any known allergies (or write None)" },
      { key: "conditions", label: "Medical Conditions", type: "textarea", placeholder: "List any conditions or special needs (or write None)" },
    ],
  },
  medication_auth: {
    mode: "form",
    title: "Medication Authorization",
    description: "Authorize the school to administer medication if needed.",
    fields: [
      { key: "medication_name", label: "Medication Name", type: "text", placeholder: "Name of medication", required: true },
      { key: "dosage", label: "Dosage", type: "text", placeholder: "e.g. 10mg", required: true },
      { key: "frequency", label: "Frequency", type: "text", placeholder: "e.g. Once daily at noon", required: true },
      { key: "reason", label: "Reason", type: "text", placeholder: "Condition being treated" },
      { key: "authorize", label: "I authorize the school to administer this medication", type: "checkbox", required: true },
    ],
  },
  food_allergy_plan: {
    mode: "form",
    title: "Food Allergy Action Plan",
    description: "Provide details about your child's food allergies so the school can keep them safe.",
    fields: [
      { key: "allergens", label: "Allergens", type: "textarea", placeholder: "List specific food allergens (e.g. peanuts, dairy)", required: true },
      { key: "severity", label: "Severity", type: "select", options: ["Mild", "Moderate", "Severe / Anaphylaxis"], required: true },
      { key: "symptoms", label: "Symptoms", type: "textarea", placeholder: "Describe typical reaction symptoms" },
      { key: "treatment", label: "Treatment Plan", type: "textarea", placeholder: "e.g. EpiPen, Benadryl — include instructions", required: true },
      { key: "epipen_onsite", label: "EpiPen will be kept on-site", type: "checkbox" },
    ],
  },
  pickup_auth: {
    mode: "form",
    title: "Authorized Pickup Contacts",
    description: "List all people authorized to pick up your child from school besides guardians on file.",
    fields: [
      { key: "contact1_name", label: "Authorized Person #1", type: "text", placeholder: "Full name", required: true },
      { key: "contact1_relationship", label: "Relationship", type: "text", placeholder: "e.g. Grandmother" },
      { key: "contact1_phone", label: "Phone", type: "tel", placeholder: "(555) 555-5555", required: true },
      { key: "contact2_name", label: "Authorized Person #2", type: "text", placeholder: "Full name" },
      { key: "contact2_relationship", label: "Relationship", type: "text", placeholder: "e.g. Neighbor" },
      { key: "contact2_phone", label: "Phone", type: "tel", placeholder: "(555) 555-5555" },
    ],
  },
  home_language_survey: {
    mode: "form",
    title: "Home Language Survey",
    description: "Federal law requires schools to identify students who may need English language support.",
    fields: [
      { key: "home_language", label: "Language most often spoken at home", type: "text", placeholder: "e.g. English, Spanish", required: true },
      { key: "student_first_language", label: "Language student learned first", type: "text", placeholder: "e.g. English", required: true },
      { key: "student_school_language", label: "Language student uses most at school", type: "text", placeholder: "e.g. English", required: true },
      { key: "other_languages", label: "Other languages spoken in the home", type: "text", placeholder: "e.g. None" },
    ],
  },
  transport: {
    mode: "form",
    title: "Transportation Preferences",
    description: "How will your child get to and from school?",
    fields: [
      { key: "arrival_mode", label: "Arrival Method", type: "select", options: ["Parent Drop-off", "School Bus", "Public Transit", "Walk/Bike", "Carpool", "Other"], required: true },
      { key: "departure_mode", label: "Departure Method", type: "select", options: ["Parent Pick-up", "School Bus", "Public Transit", "Walk/Bike", "Carpool", "After-School Program", "Other"], required: true },
      { key: "notes", label: "Additional Notes", type: "textarea", placeholder: "Any special transportation arrangements" },
    ],
  },
  before_after_care: {
    mode: "form",
    title: "Before & After School Care",
    description: "Indicate if your child needs before or after school care.",
    fields: [
      { key: "before_care", label: "Needs before-school care", type: "checkbox" },
      { key: "after_care", label: "Needs after-school care", type: "checkbox" },
      { key: "days_needed", label: "Days Needed", type: "select", options: ["Monday-Friday", "Select Days Only"], required: true },
      { key: "notes", label: "Additional Notes", type: "textarea", placeholder: "Any specific schedule needs" },
    ],
  },
  frl_app: {
    mode: "form",
    title: "Free/Reduced Lunch Application",
    description: "Provide household information for the National School Lunch Program.",
    fields: [
      { key: "household_size", label: "Household Size", type: "text", placeholder: "Number of people in household", required: true },
      { key: "annual_income", label: "Annual Household Income", type: "text", placeholder: "e.g. $35,000", required: true },
      { key: "snap_tanf", label: "Household receives SNAP, TANF, or FDPIR benefits", type: "checkbox" },
      { key: "foster_child", label: "Student is a foster child", type: "checkbox" },
    ],
  },
  military_family: {
    mode: "form",
    title: "Military Family Information",
    description: "If applicable, provide details about military family status.",
    fields: [
      { key: "branch", label: "Branch of Service", type: "select", options: ["Army", "Navy", "Air Force", "Marines", "Coast Guard", "Space Force", "National Guard"], required: true },
      { key: "status", label: "Service Status", type: "select", options: ["Active Duty", "Reserve", "Veteran", "Retired"], required: true },
      { key: "deployment_notes", label: "Deployment / Special Circumstances", type: "textarea", placeholder: "Any relevant information" },
    ],
  },

  // ─── Policy Acknowledgments ───
  income_verification: {
    mode: "acknowledge",
    title: "Income Verification Acknowledgment",
    description: "I acknowledge that the income information provided is true and accurate. I understand the school may request supporting documentation.",
  },
  tech_policy: {
    mode: "acknowledge",
    title: "Technology Acceptable Use Policy",
    description: "I have read and agree to the school's technology acceptable use policy. I understand the rules for using school-provided devices and internet access.",
  },
  handbook_ack: {
    mode: "acknowledge",
    title: "Student & Family Handbook",
    description: "I have read and understand the Student & Family Handbook, including attendance policies, academic expectations, and behavioral guidelines.",
  },
  discipline_policy: {
    mode: "acknowledge",
    title: "Discipline Policy",
    description: "I have read and understand the school's discipline policy, including the progressive discipline framework and due process procedures.",
  },
  media_release: {
    mode: "acknowledge",
    title: "Media / Photo Release",
    description: "I grant permission for my child's name, image, and/or work to be used in school publications, website, and promotional materials.",
  },
  field_trip: {
    mode: "acknowledge",
    title: "Field Trip Permission",
    description: "I grant blanket permission for my child to participate in school-sponsored field trips during the school year. I understand I will be notified before each trip.",
  },
  internet_safety: {
    mode: "acknowledge",
    title: "Internet Safety Agreement",
    description: "I have reviewed the internet safety guidelines with my child and understand the expectations for safe and responsible online behavior at school.",
  },
  anti_bullying: {
    mode: "acknowledge",
    title: "Anti-Bullying Policy",
    description: "I have read the school's anti-bullying policy and understand the reporting procedures. I will encourage my child to report any bullying incidents.",
  },
  uniform_policy: {
    mode: "acknowledge",
    title: "Uniform Policy",
    description: "I have read and understand the school's uniform/dress code policy and agree to ensure my child arrives at school in compliance.",
  },
  ferpa_consent: {
    mode: "acknowledge",
    title: "FERPA Consent",
    description: "I have read the Family Educational Rights and Privacy Act (FERPA) notice and understand my rights regarding my child's educational records.",
  },

  // ─── Document Uploads ───
  immunization_records: {
    mode: "upload",
    title: "Immunization Records",
    description: "Upload your child's current immunization records from their healthcare provider.",
  },
  proof_of_residency: {
    mode: "upload",
    title: "Proof of Residency",
    description: "Upload a utility bill, lease agreement, or other proof of your current address.",
  },
  proof_of_age: {
    mode: "upload",
    title: "Proof of Age / Birth Certificate",
    description: "Upload your child's birth certificate or other official proof of age.",
  },
  parent_id: {
    mode: "upload",
    title: "Parent/Guardian ID",
    description: "Upload a government-issued photo ID for the enrolling parent or guardian.",
  },
  custody_docs: {
    mode: "upload",
    title: "Custody Documentation",
    description: "Upload any relevant custody or guardianship documentation.",
  },
  student_photo: {
    mode: "upload",
    title: "Student Photo",
    description: "Upload a recent photo of your child for school identification purposes.",
  },
  sports_physical: {
    mode: "upload",
    title: "Sports Physical",
    description: "Upload a completed sports physical form if your child plans to participate in athletics.",
  },
  previous_school_records: {
    mode: "upload",
    title: "Previous School Records",
    description: "Upload transcripts, report cards, or other records from your child's previous school.",
  },
  iep_records: {
    mode: "upload",
    title: "IEP Records",
    description: "Upload your child's current Individualized Education Program (IEP) documents.",
  },
  "504_plan": {
    mode: "upload",
    title: "504 Plan",
    description: "Upload your child's current 504 Plan documents.",
  },
  mckinney_vento: {
    mode: "upload",
    title: "McKinney-Vento Questionnaire",
    description: "Upload the completed McKinney-Vento Housing Questionnaire if applicable.",
  },
  lthc_form: {
    mode: "upload",
    title: "Licensed Treatment Health Certificate",
    description: "Upload the completed LTHC form signed by your child's healthcare provider.",
  },
  sc_health_exam: {
    mode: "upload",
    title: "SC Health Examination",
    description: "Upload the South Carolina health examination form completed by your child's physician.",
  },
  sc_dental_screen: {
    mode: "upload",
    title: "SC Dental Screening",
    description: "Upload the South Carolina dental screening form.",
  },
  oh_custody_affidavit: {
    mode: "upload",
    title: "Ohio Custody Affidavit",
    description: "Upload the completed Ohio custody affidavit if applicable.",
  },
  wa_health_exam: {
    mode: "upload",
    title: "WA Health Examination",
    description: "Upload the Washington state health examination form completed by your child's physician.",
  },
};

function getCompletionConfig(itemType: string): CompletionConfig {
  return ITEM_COMPLETION_CONFIG[itemType] ?? {
    mode: "acknowledge",
    title: "Complete Item",
    description: "Confirm that you have completed this registration requirement.",
  };
}

function getButtonLabel(itemType: string): string {
  const config = getCompletionConfig(itemType);
  if (config.mode === "form") return "Fill Out";
  if (config.mode === "upload") return "Upload";
  return "Review & Agree";
}

export function RegistrationClient({ enrollments, userId }: RegistrationClientProps) {
  const router = useRouter();
  const [activeEnrollment, setActiveEnrollment] = useState(0);
  const [loadingItem, setLoadingItem] = useState<string | null>(null);
  const [submittingPacket, setSubmittingPacket] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionTarget, setCompletionTarget] = useState<{ itemId: string; itemType: string; itemName: string } | null>(null);
  const [completionForm, setCompletionForm] = useState<Record<string, string | boolean>>({});
  const [completionAck, setCompletionAck] = useState(false);
  const [uploadSelectedFile, setUploadSelectedFile] = useState<File | null>(null);
  const [uploadValidationError, setUploadValidationError] = useState<string | null>(null);

  if (enrollments.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-stone">No registration packets available.</p>
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

  // Check if all items are completed
  const allItemsComplete = enrollment.requirements.every((req) => {
    const item = itemsByType[req.item_type];
    return item && (item.status === "submitted" || item.status === "verified");
  });

  const packetSubmitted =
    enrollment.packet?.status === "submitted" ||
    enrollment.packet?.status === "complete";

  function openCompletionDialog(itemId: string, itemType: string, itemName: string) {
    setCompletionTarget({ itemId, itemType, itemName });
    setCompletionForm({});
    setCompletionAck(false);
    setUploadSelectedFile(null);
    setUploadValidationError(null);
    setError(null);
    setCompletionOpen(true);
  }

  async function doCompleteItem() {
    if (!completionTarget) return;
    const { itemId, itemType, itemName } = completionTarget;
    const config = getCompletionConfig(itemType);

    setLoadingItem(itemId);
    setError(null);
    setSuccess(null);
    setCompletionOpen(false);

    const payload: Record<string, unknown> = {
      acknowledged: true,
      completed_at: new Date().toISOString(),
    };

    if (config.mode === "form") {
      payload.form_data = { ...completionForm };
    }

    if (config.mode === "upload" && uploadSelectedFile) {
      const uploadResult = await uploadFile(uploadSelectedFile, userId);
      if (uploadResult.error) {
        setError(uploadResult.error);
        setLoadingItem(null);
        setCompletionOpen(true); // re-open so they can try again
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
      setError(result.error);
    } else {
      setSuccess(`"${itemName}" has been completed.`);
      router.refresh();
    }
    setLoadingItem(null);
    setCompletionTarget(null);
    setUploadSelectedFile(null);
    setUploadValidationError(null);
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
      setSuccess("Registration packet submitted successfully!");
      router.refresh();
    }
    setSubmittingPacket(false);
  }

  // Group requirements by category
  const groupedRequirements = (() => {
    const groups: Record<string, PacketRequirement[]> = {};
    for (const req of enrollment.requirements) {
      const cat = ITEM_TO_CATEGORY[req.item_type] ?? "records";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(req);
    }
    return groups;
  })();

  // Category completion counts
  function getCategoryProgress(category: string) {
    const reqs = groupedRequirements[category] ?? [];
    const done = reqs.filter((r) => {
      const item = itemsByType[r.item_type];
      return item && (item.status === "submitted" || item.status === "verified");
    }).length;
    return { done, total: reqs.length };
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/family/dashboard" className="text-sm text-rooted-green hover:underline">
        ← Back to Dashboard
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
              <span className="text-3xl" aria-hidden="true">🎓</span>
              <div>
                <p className="text-base font-bold text-ink">
                  Welcome to Registration!
                </p>
                <p className="text-sm text-ink/60 mt-0.5">
                  {allItemsComplete
                    ? "All items are complete — submit your packet below to finalize enrollment."
                    : `Complete the ${totalRequired > 0 ? totalRequired + " required" : ""} items below to finalize ${enrollment.student_name}'s enrollment at ${enrollment.campus_name}. You can complete items in any order.`}
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
                <span className={`text-xs ${idx === activeEnrollment ? "text-white/70" : "text-stone"}`}>
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
              <p className="text-xs text-stone">
                {enrollment.campus_name} &middot; Grade {enrollment.grade}{" "}
                &middot; {enrollment.school_year}
              </p>
            </div>
            <Badge
              variant={
                packetSubmitted
                  ? "default"
                  : allItemsComplete
                    ? "success"
                    : "secondary"
              }
            >
              {packetSubmitted
                ? enrollment.packet?.status === "complete"
                  ? "Complete"
                  : "Under Review"
                : allItemsComplete
                  ? "Ready to Submit"
                  : `${completedCount}/${totalItems} Done`}
            </Badge>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-rooted-gray-dark/30 rounded-full h-3">
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
            <p className="text-xs text-stone">
              {completedCount} of {totalItems} items completed
              {totalRequired > 0 && totalRequired < totalItems && (
                <span className="text-stone"> &middot; {totalRequired} required</span>
              )}
            </p>
            {!packetSubmitted && completedCount < totalItems && (
              <p className="text-xs text-amber-600 font-medium">
                {totalItems - completedCount} remaining
              </p>
            )}
          </div>
          {/* Category mini-progress */}
          {Object.keys(groupedRequirements).length > 1 && (
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-rooted-gray">
              {Object.entries(ITEM_CATEGORIES).map(([catKey, catCfg]) => {
                if (!groupedRequirements[catKey]) return null;
                const prog = getCategoryProgress(catKey);
                return (
                  <div key={catKey} className="flex items-center gap-1.5">
                    <span className="text-xs">{catCfg.icon}</span>
                    <span className="text-[10px] text-stone">
                      {catCfg.label}
                    </span>
                    <span className={`text-[10px] font-bold ${prog.done === prog.total ? "text-green-600" : "text-stone"}`}>
                      {prog.done}/{prog.total}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Registration Items — Grouped by Category */}
      {enrollment.requirements.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-stone">
              No registration requirements configured for this campus yet.
            </p>
            <p className="text-xs text-stone mt-1">
              Check back soon — your school is setting up the registration packet.
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(ITEM_CATEGORIES).map(([catKey, catCfg]) => {
          const reqs = groupedRequirements[catKey];
          if (!reqs || reqs.length === 0) return null;
          const prog = getCategoryProgress(catKey);
          const allDone = prog.done === prog.total;

          return (
            <Card key={catKey} className={allDone ? "border-green-200/60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{catCfg.icon}</span>
                    <CardTitle className="text-sm">{catCfg.label}</CardTitle>
                  </div>
                  <span className={`text-xs font-semibold ${allDone ? "text-green-600" : "text-stone"}`}>
                    {prog.done}/{prog.total} complete
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {reqs.map((req) => {
                  const item = itemsByType[req.item_type];
                  const status = item?.status ?? "pending";
                  const statusCfg = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.pending;
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
                        <span className="text-lg shrink-0">
                          {ITEM_ICONS[req.item_type] ?? "📄"}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-ink">
                              {req.name}
                            </p>
                            {req.is_required && (
                              <span className="text-[10px] text-red-500 font-semibold uppercase">
                                Required
                              </span>
                            )}
                          </div>
                          {req.description && (
                            <p className="text-xs text-stone mt-0.5 line-clamp-1">
                              {req.description}
                            </p>
                          )}
                          {item?.signed_at && (
                            <p className="text-[10px] text-stone mt-0.5">
                              Completed{" "}
                              {new Date(item.signed_at).toLocaleDateString("en-US", {
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
                            {isLoading ? "Saving..." : getButtonLabel(req.item_type)}
                          </Button>
                        )}
                        {status === "pending" && !item && (
                          <Badge className="text-[10px] bg-rooted-gray text-stone">
                            Awaiting Setup
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
                            <span className="text-xs text-blue-600 font-medium">Done</span>
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
                            <span className="text-xs text-green-600 font-medium">Verified</span>
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
      {allItemsComplete && !packetSubmitted && (
        <Card className="border-rooted-green bg-rooted-green/5 shadow-md">
          <CardContent className="py-5">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">🎉</span>
                <div>
                  <p className="text-base font-bold text-ink">
                    All Items Complete!
                  </p>
                  <p className="text-sm text-ink/60">
                    Submit your registration packet to finalize {enrollment.student_name}&apos;s enrollment.
                  </p>
                </div>
              </div>
              <Button
                disabled={submittingPacket}
                onClick={handleSubmitPacket}
                className="bg-rooted-green hover:bg-rooted-green/90 text-white px-6"
                size="lg"
              >
                {submittingPacket ? "Submitting..." : "Submit Packet"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submitted confirmation */}
      {packetSubmitted && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="py-6 text-center">
            <span className="text-4xl block mb-3" aria-hidden="true">
              {enrollment.packet?.status === "complete" ? "🎓" : "📬"}
            </span>
            <p className="text-lg font-bold text-green-800">
              {enrollment.packet?.status === "complete"
                ? "Registration Complete!"
                : "Packet Submitted!"}
            </p>
            <p className="text-sm text-green-600 mt-1 max-w-md mx-auto">
              {enrollment.packet?.status === "complete"
                ? `All items have been verified by staff. ${enrollment.student_name} is officially enrolled. Welcome to the rootedschools family!`
                : `Your registration packet is being reviewed by the enrollment team at ${enrollment.campus_name}. You'll be notified when everything is verified.`}
            </p>
            <Link href="/family/dashboard">
              <Button variant="outline" size="sm" className="mt-4">
                Back to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Help section */}
      {!packetSubmitted && (
        <div className="text-center py-2">
          <p className="text-xs text-stone">
            Need help? Contact your school&apos;s enrollment office for assistance with any registration items.
          </p>
        </div>
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
              ? completionAck
              : !!uploadSelectedFile && !uploadValidationError; // upload mode: file selected and valid

        return (
          <Dialog open={completionOpen} onOpenChange={setCompletionOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{config.title}</DialogTitle>
                <DialogDescription>{config.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {config.mode === "form" && config.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-ink/70 mb-1">
                      {field.label}
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
                        <option value="">Select...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        value={(completionForm[field.key] as string) ?? ""}
                        onChange={(e) =>
                          setCompletionForm((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={field.placeholder}
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
                        placeholder={field.placeholder}
                      />
                    )}
                  </div>
                ))}

                {config.mode === "acknowledge" && (() => {
                  const policyText = getPolicyText(enrollment.campus_id, completionTarget.itemType);
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
                          I have read and agree to the above. I understand this is a binding acknowledgement.
                        </span>
                      </label>
                    </>
                  );
                })()}

                {config.mode === "upload" && (
                  <div className="space-y-3">
                    <div
                      className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                        uploadSelectedFile
                          ? "border-rooted-green/40 bg-rooted-green/5"
                          : "border-stone/30 hover:border-stone/50"
                      }`}
                    >
                      <input
                        type="file"
                        id="reg-upload-input"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const err = validateFile(file);
                          setUploadValidationError(err);
                          setUploadSelectedFile(err ? null : file);
                        }}
                      />
                      {uploadSelectedFile ? (
                        <div className="space-y-1">
                          <p className="text-2xl">✅</p>
                          <p className="text-sm font-medium text-ink">{uploadSelectedFile.name}</p>
                          <p className="text-xs text-stone">{formatFileSize(uploadSelectedFile.size)}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setUploadSelectedFile(null);
                              setUploadValidationError(null);
                              const input = document.getElementById("reg-upload-input") as HTMLInputElement;
                              if (input) input.value = "";
                            }}
                            className="text-xs text-rooted-green hover:underline mt-1"
                          >
                            Choose a different file
                          </button>
                        </div>
                      ) : (
                        <label htmlFor="reg-upload-input" className="cursor-pointer block">
                          <p className="text-2xl mb-2">📎</p>
                          <p className="text-sm font-medium text-ink">Click to choose a file</p>
                          <p className="text-xs text-stone mt-1">PDF, JPEG, or PNG — max 10MB</p>
                        </label>
                      )}
                    </div>
                    {uploadValidationError && (
                      <p className="text-xs text-red-600">{uploadValidationError}</p>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCompletionOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={doCompleteItem}
                  disabled={!canSubmit}
                  className="bg-rooted-green hover:bg-rooted-green/90 text-white"
                >
                  {config.mode === "form" ? "Submit" : config.mode === "upload" ? "Upload & Complete" : "Confirm"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
