"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function RegistrationClient({ enrollments }: RegistrationClientProps) {
  const router = useRouter();
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
      router.refresh();
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
                <p className="text-base font-bold text-gray-900">
                  Welcome to Registration!
                </p>
                <p className="text-sm text-gray-600 mt-0.5">
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
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {enr.student_name}
                <span className={`text-xs ${idx === activeEnrollment ? "text-white/70" : "text-gray-400"}`}>
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
              <p className="text-sm font-semibold text-gray-900">
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
                  : "Under Review"
                : allItemsComplete
                  ? "Ready to Submit"
                  : `${completedCount}/${totalItems} Done`}
            </Badge>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-3">
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
            <p className="text-xs text-gray-500">
              {completedCount} of {totalItems} items completed
              {totalRequired > 0 && totalRequired < totalItems && (
                <span className="text-gray-400"> &middot; {totalRequired} required</span>
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
            <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
              {Object.entries(ITEM_CATEGORIES).map(([catKey, catCfg]) => {
                if (!groupedRequirements[catKey]) return null;
                const prog = getCategoryProgress(catKey);
                return (
                  <div key={catKey} className="flex items-center gap-1.5">
                    <span className="text-xs">{catCfg.icon}</span>
                    <span className="text-[10px] text-gray-500">
                      {catCfg.label}
                    </span>
                    <span className={`text-[10px] font-bold ${prog.done === prog.total ? "text-green-600" : "text-gray-400"}`}>
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
            <p className="text-gray-500">
              No registration requirements configured for this campus yet.
            </p>
            <p className="text-xs text-gray-400 mt-1">
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
                  <span className={`text-xs font-semibold ${allDone ? "text-green-600" : "text-gray-400"}`}>
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
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg shrink-0">
                          {ITEM_ICONS[req.item_type] ?? "📄"}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">
                              {req.name}
                            </p>
                            {req.is_required && (
                              <span className="text-[10px] text-red-500 font-semibold uppercase">
                                Required
                              </span>
                            )}
                          </div>
                          {req.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                              {req.description}
                            </p>
                          )}
                          {item?.signed_at && (
                            <p className="text-[10px] text-gray-400 mt-0.5">
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
                              handleCompleteItem(item.id, req.name)
                            }
                            className="bg-rooted-green hover:bg-rooted-green/90 text-white"
                          >
                            {isLoading ? "Saving..." : "Complete"}
                          </Button>
                        )}
                        {status === "pending" && !item && (
                          <Badge className="text-[10px] bg-gray-100 text-gray-500">
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
                  <p className="text-base font-bold text-gray-900">
                    All Items Complete!
                  </p>
                  <p className="text-sm text-gray-600">
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
          <p className="text-xs text-gray-400">
            Need help? Contact your school&apos;s enrollment office for assistance with any registration items.
          </p>
        </div>
      )}
    </div>
  );
}
