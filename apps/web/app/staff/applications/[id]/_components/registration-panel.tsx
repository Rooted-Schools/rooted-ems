"use client";

/**
 * RegistrationPanel — registration packet review + academic audit.
 *
 * Moved verbatim (same server actions, same signatures, same handler logic)
 * from the original detail-client.tsx's "Registration" tab. This content
 * (packet items checklist + academic audit form) doesn't fit the
 * exception/requirement/rail model the Phase 4 spec describes for document
 * review — it's a distinct later-lifecycle workflow (registered →
 * placement_review → enrolled) — so it stays as its own section, reachable
 * below the main review layout exactly as before, rather than being folded
 * into ExceptionList/RequirementList/ContextRail. This is a deliberate
 * scope call, not an omission — see the phase report.
 */
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import {
  staffVerifyRegistrationItem,
  staffSkipRegistrationItem,
  staffCompleteAcademicAudit,
  staffGetSignedUrl,
  staffConfirmPacketComplete,
} from "../actions";
import type { ApplicationDetail, RegistrationPacketDetail } from "@/lib/queries";
import { IconClipboardList, IconGraduationCap, IconRefreshCw, IconClock, IconCheckCircle } from "@/components/ui/icons";

function formatDateTime(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  emergency_contact: "Emergency Contact",
  medical_info: "Medical Information",
  medication_auth: "Medication Authorization",
  food_allergy_plan: "Food Allergy Plan",
  pickup_auth: "Authorized Pickup",
  home_language_survey: "Home Language Survey",
  transport: "Transportation",
  before_after_care: "Before & After Care",
  frl_app: "Free/Reduced Lunch",
  military_family: "Military Family",
  income_verification: "Income Verification",
  tech_policy: "Technology Policy",
  handbook_ack: "Handbook Acknowledgment",
  discipline_policy: "Discipline Policy",
  media_release: "Media Release",
  field_trip: "Field Trip Authorization",
  internet_safety: "Internet Safety",
  anti_bullying: "Anti-Bullying Policy",
  uniform_policy: "Uniform Policy",
  ferpa_consent: "FERPA Consent",
  immunization_records: "Immunization Records",
  proof_of_residency: "Proof of Residency",
  proof_of_age: "Proof of Age",
  parent_id: "Parent / Guardian ID",
  custody_docs: "Custody Documents",
  student_photo: "Student Photo",
  sports_physical: "Sports Physical",
  previous_school_records: "Previous School Records",
  iep_records: "IEP / Special Education Records",
  "504_plan": "504 Plan",
  mckinney_vento: "McKinney-Vento",
  lthc_form: "Long-Term Health Condition Form",
  sc_health_exam: "SC Health Examination",
  sc_dental_screen: "SC Dental Screening",
  oh_custody_affidavit: "OH Custody Affidavit",
  wa_health_exam: "WA Health Examination",
};

const regItemStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "text-amber-700 bg-amber-50 border-amber-200" },
  submitted: { label: "Submitted", color: "text-blue-700 bg-blue-50 border-blue-200" },
  verified: { label: "Verified", color: "text-green-700 bg-green-50 border-green-200" },
};

const packetStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "warning" | "success" | "destructive" }> = {
  pending: { label: "Not Started", variant: "secondary" },
  in_progress: { label: "In Progress", variant: "warning" },
  submitted: { label: "Submitted — Awaiting Review", variant: "default" },
  complete: { label: "Complete", variant: "success" },
};

const SKIP_KEYS = new Set(["acknowledged", "completed_at", "signature_data_url"]);

function labelFromKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ViewFileButton({ storagePath, fileName }: { storagePath: string; fileName?: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const { url, error } = await staffGetSignedUrl(storagePath);
    setLoading(false);
    if (error || !url) {
      toast({ variant: "error", title: "Could not open file", description: "The file may have been moved or deleted." });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 transition-colors"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
      {loading ? "Loading…" : (fileName || "View File")}
    </button>
  );
}

function RegistrationItemDetail({ data }: { data: Record<string, unknown>; itemType: string }) {
  const rows: { label: string; value: ReactNode }[] = [];

  function findStr(obj: Record<string, unknown>, key: string): string | null {
    if (key in obj && typeof obj[key] === "string") return obj[key] as string;
    for (const val of Object.values(obj)) {
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const found = findStr(val as Record<string, unknown>, key);
        if (found) return found;
      }
    }
    return null;
  }

  function renderValue(val: unknown): ReactNode {
    if (val === null || val === undefined || val === "") return null;
    if (typeof val === "boolean") return val ? "Yes" : "No";
    if (Array.isArray(val)) {
      const items = val.filter(Boolean);
      return items.length ? items.join(", ") : null;
    }
    if (typeof val === "object") return null;
    const str = String(val);
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      return new Date(str).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    }
    return str;
  }

  const signatureDataUrl = findStr(data, "signature_data_url");
  if (signatureDataUrl) {
    rows.push({
      label: "Signature",
      value: <img src={signatureDataUrl} alt="Family signature" className="max-h-16 border border-stone/20 rounded bg-white" />,
    });
  }

  const storagePath = findStr(data, "storage_path");
  const fileName = findStr(data, "file_name") ?? undefined;
  if (storagePath) {
    rows.push({ label: "Uploaded File", value: <ViewFileButton storagePath={storagePath} fileName={fileName} /> });
  }

  const FILE_KEYS = new Set(["storage_path", "file_name"]);

  function collect(obj: Record<string, unknown>) {
    for (const [key, val] of Object.entries(obj)) {
      if (SKIP_KEYS.has(key) || FILE_KEYS.has(key)) continue;
      if (val === null || val === undefined || val === "") continue;
      if (typeof val === "object" && !Array.isArray(val)) {
        collect(val as Record<string, unknown>);
      } else {
        const rendered = renderValue(val);
        if (rendered !== null) rows.push({ label: labelFromKey(key), value: rendered });
      }
    }
  }

  collect(data);

  if (rows.length === 0) {
    return <p className="text-xs text-stone italic">{data.acknowledged ? "Family acknowledged this item." : "No detail submitted."}</p>;
  }

  return (
    <div>
      <p className="text-xs font-semibold text-stone uppercase tracking-wider mb-2">Family Submission</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex gap-2 text-sm py-0.5 border-b border-rooted-gray/60 last:border-0">
            <span className="text-stone min-w-[130px] shrink-0 text-xs pt-0.5">{label}</span>
            <span className="text-ink font-medium break-words">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RegistrationPanelProps {
  detail: ApplicationDetail;
  registrationPacket: RegistrationPacketDetail;
}

export function RegistrationPanel({ detail, registrationPacket }: RegistrationPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [auditGrade, setAuditGrade] = useState(detail.grade ?? "");
  const [auditNotes, setAuditNotes] = useState("");
  const [auditSupports, setAuditSupports] = useState<string[]>([]);

  function showFeedback(type: "success" | "error", message: string) {
    toast({ variant: type, title: message });
  }

  const pCfg = packetStatusConfig[registrationPacket.packet_status] ?? packetStatusConfig.pending;
  const submittedCount = registrationPacket.items.filter((i) => i.status === "submitted" || i.status === "verified").length;
  const verifiedCount = registrationPacket.items.filter((i) => i.status === "verified").length;
  const totalItems = registrationPacket.items.length;
  const pendingOptional = registrationPacket.items.filter((i) => i.status === "pending").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registration & Placement</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3">
            <span className="text-ink/70 shrink-0" aria-hidden="true">
              {registrationPacket.packet_status === "complete" ? (
                <IconGraduationCap size={24} />
              ) : registrationPacket.packet_status === "submitted" ? (
                <IconClipboardList size={24} />
              ) : registrationPacket.packet_status === "in_progress" ? (
                <IconRefreshCw size={24} />
              ) : (
                <IconClock size={24} />
              )}
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">
                Registration Packet: <Badge variant={pCfg.variant}>{pCfg.label}</Badge>
              </p>
              <p className="text-xs text-stone mt-0.5">
                {totalItems > 0 ? `${submittedCount} of ${totalItems} items completed · ${verifiedCount} verified` : "No items yet"}
                {pendingOptional > 0 && ` · ${pendingOptional} optional item${pendingOptional > 1 ? "s" : ""} not submitted (use Skip to waive)`}
                {registrationPacket.submitted_at && ` · Submitted ${formatDateTime(registrationPacket.submitted_at)}`}
                {registrationPacket.verified_at && ` · All verified ${formatDateTime(registrationPacket.verified_at)}`}
              </p>
            </div>
          </div>
          {registrationPacket.packet_status === "complete" && ["accepted", "registered"].includes(detail.status) && (
            <div className="mt-3 pt-3 border-t border-stone/20">
              <p className="text-xs text-stone mb-2">
                All items verified. Click below to advance this student to Placement Review (academic audit).
              </p>
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await staffConfirmPacketComplete(detail.id);
                    if (result.error) showFeedback("error", result.error);
                    else {
                      showFeedback("success", "Student advanced to Placement Review.");
                      router.refresh();
                    }
                  });
                }}
              >
                <IconCheckCircle size={16} className="mr-1" aria-hidden="true" />
                Confirm Verification Complete → Move to Placement Review
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registration Items</CardTitle>
          <CardDescription>
            Click any row to see what the family submitted. Verify submitted items, or Skip optional items the family didn&apos;t complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {registrationPacket.items.length === 0 ? (
            <p className="text-center text-stone py-8 text-sm">No registration items found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Family Submitted</TableHead>
                  <TableHead>Verified By</TableHead>
                  <TableHead className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrationPacket.items.map((item) => {
                  const cfg = regItemStatusConfig[item.status] ?? regItemStatusConfig.pending;
                  const isExpanded = expandedItem === item.id;
                  const hasData = item.data && Object.keys(item.data).length > 0;
                  return (
                    <>
                      <TableRow
                        key={item.id}
                        className={hasData ? "cursor-pointer hover:bg-rooted-gray-light/60" : ""}
                        onClick={() => (hasData ? setExpandedItem(isExpanded ? null : item.id) : undefined)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            {hasData && <span className="text-stone text-xs">{isExpanded ? "▼" : "▶"}</span>}
                            {ITEM_TYPE_LABELS[item.item_type] ?? item.item_type.replace(/_/g, " ")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-stone text-sm">{item.signed_at ? formatDateTime(item.signed_at) : "—"}</TableCell>
                        <TableCell className="text-stone text-sm">
                          {item.verified_by_name ? (
                            <span className="text-ink/70">
                              {item.verified_by_name}
                              <br />
                              <span className="text-xs text-stone">{formatDateTime(item.verified_at)}</span>
                            </span>
                          ) : item.verified_at ? (
                            formatDateTime(item.verified_at)
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            {item.status === "submitted" && (
                              <Button
                                size="sm"
                                disabled={isPending}
                                onClick={() => {
                                  startTransition(async () => {
                                    const result = await staffVerifyRegistrationItem(item.id, detail.id);
                                    if (result.error) showFeedback("error", result.error);
                                    else {
                                      showFeedback("success", `${ITEM_TYPE_LABELS[item.item_type] ?? item.item_type} verified`);
                                      router.refresh();
                                    }
                                  });
                                }}
                              >
                                Verify
                              </Button>
                            )}
                            {item.status === "pending" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isPending}
                                onClick={() => {
                                  if (!confirm(`Skip "${ITEM_TYPE_LABELS[item.item_type] ?? item.item_type}"? This waives the requirement and marks it as complete.`)) return;
                                  startTransition(async () => {
                                    const result = await staffSkipRegistrationItem(item.id, detail.id);
                                    if (result.error) showFeedback("error", result.error);
                                    else {
                                      showFeedback("success", `${ITEM_TYPE_LABELS[item.item_type] ?? item.item_type} skipped`);
                                      router.refresh();
                                    }
                                  });
                                }}
                              >
                                Skip
                              </Button>
                            )}
                            {item.status === "verified" && (
                              <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                                <IconCheckCircle size={14} aria-hidden="true" />
                                Done
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && hasData && (
                        <TableRow key={`${item.id}-expand`} className="bg-rooted-gray-light/40">
                          <TableCell colSpan={5} className="py-4 px-6">
                            <RegistrationItemDetail data={item.data} itemType={item.item_type} />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(detail.status === "placement_review" || detail.status === "enrolled") && (
        <Card className={detail.status === "enrolled" ? "border-green-200 bg-green-50/20" : "border-blue-200 bg-blue-50/20"}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconGraduationCap size={20} className="text-ink/70 shrink-0" aria-hidden="true" />
              <div>
                <CardTitle className="text-base">Academic Audit & Placement</CardTitle>
                <CardDescription>
                  {detail.status === "enrolled"
                    ? "Academic audit is complete. See Notes for audit details."
                    : "Registration is verified. Complete the academic audit to confirm enrollment and placement."}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          {detail.status === "placement_review" && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-stone uppercase tracking-wider mb-1">Confirmed Grade Level</label>
                  <select
                    value={auditGrade}
                    onChange={(e) => setAuditGrade(e.target.value)}
                    className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                  >
                    {["6", "7", "8", "9", "10", "11", "12"].map((g) => (
                      <option key={g} value={g}>
                        Grade {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone uppercase tracking-wider mb-1">Academic Supports Identified</label>
                  <div className="space-y-1">
                    {["IEP", "504 Plan", "ELL/ESL", "Reading Intervention", "Math Intervention", "Behavioral Support", "None"].map((s) => (
                      <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={auditSupports.includes(s)}
                          onChange={(e) => setAuditSupports((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))}
                          className="rounded"
                        />
                        {s}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone uppercase tracking-wider mb-1">Placement Notes</label>
                <textarea
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                  placeholder="Any relevant academic history, transcript review notes, placement rationale, or concerns to flag for the teaching team..."
                  rows={3}
                  className="w-full px-3 py-2 border border-stone/30 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 resize-none"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  disabled={isPending || !auditGrade}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await staffCompleteAcademicAudit(detail.id, detail.campus_id, {
                        confirmedGrade: auditGrade,
                        placementNotes: auditNotes,
                        academicSupports: auditSupports,
                        reviewedBy: detail.campus_name,
                      });
                      if (result.error) showFeedback("error", result.error);
                      else {
                        showFeedback("success", "Academic audit complete — student is now fully enrolled.");
                        router.refresh();
                      }
                    });
                  }}
                >
                  Complete Audit & Confirm Enrollment
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
