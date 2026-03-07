"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
  tech_policy: "💻",
  handbook_ack: "📖",
  media_release: "📷",
  field_trip: "🚌",
  frl_app: "🍽️",
  transport: "🚗",
  before_after_care: "🕐",
};

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  pending: { label: "Not Started", color: "bg-gray-100 text-gray-600" },
  submitted: { label: "Submitted", color: "bg-blue-100 text-blue-800" },
  verified: { label: "Verified", color: "bg-green-100 text-green-800" },
};

export function RegistrationClient({ enrollments }: RegistrationClientProps) {
  const [activeEnrollment, setActiveEnrollment] = useState(0);

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
  const totalRequired = enrollment.requirements.filter((r) => r.is_required).length;
  const totalItems = enrollment.requirements.length;

  // Map items by type for lookup
  const itemsByType: Record<string, RegistrationItem> = {};
  for (const item of enrollment.items) {
    itemsByType[item.item_type] = item;
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

      {/* Student Selector (if multiple enrollments) */}
      {enrollments.length > 1 && (
        <div className="flex gap-2">
          {enrollments.map((enr, idx) => (
            <button
              key={enr.enrollment_id}
              onClick={() => setActiveEnrollment(idx)}
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
                enrollment.packet?.status === "complete"
                  ? "default"
                  : "secondary"
              }
            >
              {enrollment.packet?.status ?? "Not Started"}
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

            return (
              <Card
                key={req.item_type}
                className={`transition-shadow hover:shadow-md ${
                  status === "verified"
                    ? "border-green-200 bg-green-50/30"
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
                      {status === "pending" && (
                        <button
                          className="text-sm px-3 py-1.5 bg-rooted-green text-white rounded-md hover:bg-rooted-green-dark transition-colors"
                          disabled
                          title="Coming soon"
                        >
                          Complete
                        </button>
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
    </div>
  );
}
