"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  familyCompleteRegistrationItem,
  familySubmitRegistrationPacket,
} from "./actions";

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

interface EnrollmentRegistration {
  enrollment_id: string;
  student_name: string;
  campus_name: string;
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
  pending: { label: "Not Started", color: "bg-gray-100 text-gray-600" },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-800" },
  verified: { label: "Verified", color: "bg-green-100 text-green-800" },
};

export function RegistrationClient({ enrollments }: RegistrationClientProps) {
  const [activeEnrollment, setActiveEnrollment] = useState(0);
  const [loadingItem, setLoadingItem] = useState<string | null>(null);
  const [submittingPacket, setSubmittingPacket] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (enrollments.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No registration packets available.</p>
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

  async function handleCompleteItem(itemId: string, itemName: string) {
    setLoadingItem(itemId);
    setError(null);
    setSuccess(null);

    const result = await familyCompleteRegistrationItem(itemId, {
      acknowledged: true,
      completed_at: new Date().toISOString(),
    });

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(`"${itemName}" has been completed.`);
    }
    setLoadingItem(null);
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
    }
    setSubmittingPacket(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Registration Packet
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Complete all required items to finalize enrollment
        </p>
      </div>

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

      {/* Student Selector (if multiple enrollments) */}
      {enrollments.length > 1 && (
        <div className="flex gap-2">
          {enrollments.map((enr, idx) => (
            <button
              key={enr.enrollment_id}
              onClick={() => {
                setActiveEnrollment(idx);
                setError(null);
                setSuccess(null);
              }}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                idx === activeEnrollment
                  ? "bg-rooted-green text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {enr.student_name}
            </button>
          ))}
        </div>
      )}

      {/* Progress */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {enrollment.student_name}
              </p>
              <p className="text-xs text-gray-500">
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
                  : "Submitted"
                : allItemsComplete
                  ? "Ready to Submit"
                  : enrollment.packet?.status ?? "Not Started"}
            </Badge>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mt-3">
            <div
              className="bg-rooted-green h-2.5 rounded-full transition-all"
              style={{
                width: `${totalItems > 0 ? (completedCount / totalItems) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {completedCount} of {totalItems} items completed
            {totalRequired > 0 && ` (${totalRequired} required)`}
          </p>
        </CardContent>
      </Card>

      {/* Registration Items */}
      <div className="space-y-3">
        {enrollment.requirements.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-gray-500">
                No registration requirements configured for this campus yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          enrollment.requirements.map((req) => {
            const item = itemsByType[req.item_type];
            const status = item?.status ?? "pending";
            const statusCfg = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.pending;
            const isLoading = loadingItem === item?.id;

            return (
              <Card
                key={req.item_type}
                className={`transition-shadow hover:shadow-md ${
                  status === "verified"
                    ? "border-green-200 bg-green-50/30"
                    : status === "submitted"
                      ? "border-blue-200 bg-blue-50/20"
                      : ""
                }`}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {ITEM_ICONS[req.item_type] ?? "📄"}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">
                            {req.name}
                          </p>
                          {req.is_required && (
                            <span className="text-[10px] text-red-500 font-medium">
                              Required
                            </span>
                          )}
                        </div>
                        {req.description && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {req.description}
                          </p>
                        )}
                        {item?.signed_at && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            Signed{" "}
                            {new Date(item.signed_at).toLocaleDateString(
                              "en-US"
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={`text-[10px] ${statusCfg.color}`}>
                        {statusCfg.label}
                      </Badge>
                      {status === "pending" && item && (
                        <Button
                          size="sm"
                          disabled={isLoading}
                          onClick={() =>
                            handleCompleteItem(item.id, req.name)
                          }
                          className="bg-rooted-green hover:bg-rooted-green/90 text-white"
                        >
                          {isLoading ? "Saving..." : "Complete"}
                        </Button>
                      )}
                      {status === "pending" && !item && (
                        <span className="text-xs text-gray-400 italic">
                          Awaiting setup
                        </span>
                      )}
                      {status === "submitted" && (
                        <svg
                          className="w-5 h-5 text-blue-500"
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
                      )}
                      {status === "verified" && (
                        <svg
                          className="w-5 h-5 text-green-500"
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
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Submit Packet Button */}
      {allItemsComplete && !packetSubmitted && (
        <Card className="border-rooted-green/30 bg-green-50/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  All items completed!
                </p>
                <p className="text-xs text-gray-500">
                  Submit your registration packet to finalize enrollment.
                </p>
              </div>
              <Button
                disabled={submittingPacket}
                onClick={handleSubmitPacket}
                className="bg-rooted-green hover:bg-rooted-green/90 text-white"
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
          <CardContent className="py-4 text-center">
            <p className="text-green-800 font-medium">
              Registration packet {enrollment.packet?.status === "complete" ? "verified" : "submitted"} successfully!
            </p>
            <p className="text-xs text-green-600 mt-1">
              {enrollment.packet?.status === "complete"
                ? "All items have been verified by staff. Your enrollment is complete."
                : "Staff will review your submitted items. You'll be notified when everything is verified."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
