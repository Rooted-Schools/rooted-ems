"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, displayClass } from "@/lib/utils";
import {
  parseLotteryPolicyConfig,
  renderPolicyStatements,
  unsourcedWeightedTiers,
  OPTIONAL_PREFERENCE_STANDING_WARNING,
  BOARD_MEMBER_PREFERENCE_WARNING,
  OPTIONAL_FEATURE_LABELS,
  type LotteryPolicyConfig,
  type LotteryPolicyOptionalFeatures,
} from "@/lib/lottery-policy";
import { staffSaveDraftPolicy, staffAdoptPolicy } from "./actions";

export interface PolicyVersionView {
  id: string;
  name: string;
  version: number;
  status: "draft" | "adopted" | "superseded";
  config: unknown;
  adoptedDate: string | null;
  adoptedNote: string | null;
  adoptedByName: string | null;
  createdAt: string;
}

const fieldClass =
  "w-full px-3 py-2 border border-line rounded-[6px] text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50 min-h-[44px]";

const statusChip: Record<PolicyVersionView["status"], { label: string; className: string }> = {
  adopted: {
    label: "Adopted",
    className: "border-rooted-green/30 bg-rooted-green/10 text-deep-green",
  },
  draft: { label: "Draft", className: "border-warn/30 bg-warn/10 text-warn-text" },
  superseded: { label: "Superseded", className: "border-line bg-sunken text-stone-text" },
};

function Chip({ status }: { status: PolicyVersionView["status"] }) {
  const chip = statusChip[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[6px] border px-2 py-1 text-xs font-medium",
        chip.className
      )}
    >
      {chip.label}
    </span>
  );
}

function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-[6px] border border-line bg-white">
      <div className="border-b border-line px-4 py-3 flex items-start justify-between gap-4">
        <div>
          <h2 className={cn("text-sm font-semibold uppercase tracking-wide text-ink", displayClass)}>
            {title}
          </h2>
          {description && <p className="mt-1 text-xs text-stone">{description}</p>}
        </div>
        {action}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

// ─── Editor state ──────────────────────────────────────────────────────────

interface EditableTier {
  key: string;
  label: string;
  weight: string;
  enabled: boolean;
  optional: boolean;
  sourceKind: "application_column" | "application_answer" | "unavailable";
  sourceField: string;
  authorityNote: string;
  capPercent: string;
}

interface EditableOptional {
  enabled: boolean;
  authorityNote: string;
  weight: string;
  capPercent: string;
  zoneDescription: string;
  note: string;
}

const OPTIONAL_KEYS: Array<keyof LotteryPolicyOptionalFeatures> = [
  "multiBirthSingleUnit",
  "foundersChildren",
  "geographicZone",
  "militaryFamily",
  "boardMemberChildren",
  "returningStudentExemption",
];

const OPTIONAL_SHAPE: Record<
  keyof LotteryPolicyOptionalFeatures,
  { weight: boolean; cap: boolean; zone: boolean; note: boolean }
> = {
  multiBirthSingleUnit: { weight: false, cap: false, zone: false, note: false },
  foundersChildren: { weight: true, cap: true, zone: false, note: false },
  geographicZone: { weight: true, cap: false, zone: true, note: false },
  militaryFamily: { weight: true, cap: false, zone: false, note: false },
  boardMemberChildren: { weight: true, cap: false, zone: false, note: false },
  returningStudentExemption: { weight: false, cap: false, zone: false, note: true },
};

export function PolicyClient({
  campusId,
  campusName,
  versions,
  isSystemAdmin,
}: {
  campusId: string | null;
  campusName: string | null;
  versions: PolicyVersionView[];
  isSystemAdmin: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const adopted = versions.find((v) => v.status === "adopted") ?? null;
  const current = adopted ?? versions[0] ?? null;

  const parsed = useMemo(
    () => (current ? parseLotteryPolicyConfig(current.config) : { config: null, errors: [] }),
    [current]
  );

  // ── Editor ───────────────────────────────────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [tiers, setTiers] = useState<EditableTier[]>([]);
  const [acceptanceDays, setAcceptanceDays] = useState("14");
  const [acceptanceCutoff, setAcceptanceCutoff] = useState("16:00");
  const [waitlistDays, setWaitlistDays] = useState("2");
  const [waitlistCutoff, setWaitlistCutoff] = useState("16:00");
  const [waitlistCarryover, setWaitlistCarryover] = useState(false);
  const [optionals, setOptionals] = useState<Record<string, EditableOptional>>({});

  // ── Adoption ─────────────────────────────────────────────────────────────
  const [adoptTarget, setAdoptTarget] = useState<PolicyVersionView | null>(null);
  const [adoptDate, setAdoptDate] = useState("");
  const [adoptNote, setAdoptNote] = useState("");
  const [adoptAffirmed, setAdoptAffirmed] = useState(false);

  function openEditor(base: PolicyVersionView) {
    const { config } = parseLotteryPolicyConfig(base.config);
    if (!config) {
      setFeedback({
        type: "error",
        message: "This version's configuration could not be read, so it cannot be used as a starting point.",
      });
      return;
    }
    setEditName(base.name);
    setTiers(
      config.weightedTiers.map((t) => ({
        key: t.key,
        label: t.label,
        weight: String(t.weight),
        enabled: t.enabled,
        optional: t.optional,
        sourceKind: t.source.kind,
        sourceField: t.source.field,
        authorityNote: t.authorityNote,
        capPercent: t.capPercent === undefined ? "" : String(t.capPercent),
      }))
    );
    setAcceptanceDays(String(config.acceptanceWindowDays));
    setAcceptanceCutoff(config.acceptanceCutoffTime);
    setWaitlistDays(String(config.waitlistOfferWindow.days));
    setWaitlistCutoff(config.waitlistOfferWindow.cutoffTime);
    setWaitlistCarryover(config.waitlistCarryover);
    const nextOptionals: Record<string, EditableOptional> = {};
    for (const key of OPTIONAL_KEYS) {
      const feature = config.optionalFeatures[key];
      nextOptionals[key] = {
        enabled: feature.enabled,
        authorityNote: feature.authorityNote,
        weight: feature.weight === undefined ? "1" : String(feature.weight),
        capPercent: feature.capPercent === undefined ? "0" : String(feature.capPercent),
        zoneDescription: feature.zoneDescription ?? "",
        note: feature.note ?? "",
      };
    }
    setOptionals(nextOptionals);
    setFeedback(null);
    setEditorOpen(true);
  }

  function buildConfig(base: LotteryPolicyConfig): LotteryPolicyConfig {
    const optionalFeatures = { ...base.optionalFeatures } as LotteryPolicyOptionalFeatures;
    for (const key of OPTIONAL_KEYS) {
      const edited = optionals[key];
      if (!edited) continue;
      const shape = OPTIONAL_SHAPE[key];
      optionalFeatures[key] = {
        enabled: edited.enabled,
        authorityNote: edited.authorityNote.trim(),
        ...(shape.weight ? { weight: Number(edited.weight) || 1 } : {}),
        ...(shape.cap ? { capPercent: Number(edited.capPercent) || 0 } : {}),
        ...(shape.zone ? { zoneDescription: edited.zoneDescription } : {}),
        ...(shape.note ? { note: edited.note } : {}),
      };
    }

    return {
      ...base,
      weightedTiers: tiers.map((t) => ({
        key: t.key,
        label: t.label,
        weight: Number(t.weight) || 0,
        enabled: t.enabled,
        optional: t.optional,
        source: {
          kind: t.sourceKind,
          field: t.sourceField,
          note: undefined,
        },
        authorityNote: t.authorityNote.trim(),
        ...(t.capPercent.trim() ? { capPercent: Number(t.capPercent) || 0 } : {}),
      })),
      acceptanceWindowDays: Number(acceptanceDays) || 0,
      acceptanceCutoffTime: acceptanceCutoff,
      waitlistOfferWindow: {
        ...base.waitlistOfferWindow,
        days: Number(waitlistDays) || 0,
        cutoffTime: waitlistCutoff,
      },
      waitlistCarryover,
      optionalFeatures,
    };
  }

  function handleSaveDraft() {
    if (!campusId || !current) return;
    const { config: base } = parseLotteryPolicyConfig(current.config);
    if (!base) return;

    const next = buildConfig(base);
    const validation = parseLotteryPolicyConfig(next);
    if (validation.errors.length > 0) {
      setFeedback({ type: "error", message: validation.errors.join(" ") });
      return;
    }

    startTransition(async () => {
      const result = await staffSaveDraftPolicy({
        campus_id: campusId,
        name: editName,
        config: next,
        based_on_version: current.version,
      });
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setEditorOpen(false);
        setFeedback({
          type: "success",
          message: `Draft version ${result.data?.version} saved. It governs nothing until a system admin adopts it.`,
        });
        router.refresh();
      }
    });
  }

  function handleAdopt() {
    if (!adoptTarget) return;
    startTransition(async () => {
      const result = await staffAdoptPolicy({
        policy_id: adoptTarget.id,
        adopted_date: adoptDate,
        adopted_note: adoptNote.trim() || undefined,
        affirmed: adoptAffirmed,
      });
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setAdoptTarget(null);
        setAdoptAffirmed(false);
        setFeedback({
          type: "success",
          message: `Version ${adoptTarget.version} adopted. It now governs every official lottery at this campus.`,
        });
        router.refresh();
      }
    });
  }

  // ── Empty states ─────────────────────────────────────────────────────────

  if (!campusId) {
    return (
      <div className="rounded-[6px] border border-line bg-white px-4 py-8 text-center">
        <p className="text-sm text-stone">
          No campus is selected, so there is no lottery policy to show.
        </p>
      </div>
    );
  }

  const unsourced = parsed.config ? unsourcedWeightedTiers(parsed.config) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Lottery Policy</h1>
        <p className="text-sm text-stone mt-1">
          The board-adopted rules every official lottery at {campusName ?? "this campus"} runs under.
        </p>
      </div>

      {feedback && (
        <div
          className={cn(
            "rounded-[6px] p-3 text-sm",
            feedback.type === "success"
              ? "border border-rooted-green/30 bg-rooted-green/10 text-deep-green"
              : "border border-error/30 bg-error/10 text-error"
          )}
        >
          {feedback.message}
        </div>
      )}

      {versions.length === 0 && (
        <Section title="No policy on file">
          <p className="text-sm text-stone">
            This campus has no lottery policy, adopted or drafted. Until a policy is adopted, lottery
            runs here can be previewed and rehearsed but cannot be finalized as official.
          </p>
          <p className="mt-2 text-xs text-stone">
            If you expected a seeded policy, confirm that supabase/migrations/00047_lottery_policy.sql
            has been applied to this database.
          </p>
        </Section>
      )}

      {!adopted && versions.length > 0 && (
        <div className="rounded-[6px] border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn-text">
          No version has been adopted at this campus. Drafts do not govern anything, and official
          lotteries are blocked until a system admin adopts a version with a board adoption date.
        </div>
      )}

      {current && parsed.config && (
        <>
          <Section
            title={adopted ? "Adopted policy" : "Latest draft"}
            description={`${current.name} — version ${current.version}${
              current.adoptedDate ? `, adopted ${current.adoptedDate}` : ", not adopted"
            }`}
            action={
              isSystemAdmin ? (
                <Button
                  variant="outline"
                  className="rounded-[6px] min-h-[44px]"
                  onClick={() => openEditor(current)}
                >
                  Edit as new draft
                </Button>
              ) : undefined
            }
          >
            {parsed.errors.length > 0 && (
              <div className="mb-4 rounded-[6px] border border-error/30 bg-error/10 p-3 text-sm text-error">
                This configuration has problems and cannot govern a lottery: {parsed.errors.join(" ")}
              </div>
            )}

            {unsourced.length > 0 && (
              <div className="mb-4 rounded-[6px] border border-warn/30 bg-warn/10 p-3 text-sm text-warn-text">
                {unsourced.map((t) => t.label).join(" and ")} {unsourced.length === 1 ? "is" : "are"}{" "}
                weighted by this policy, but the application does not collect the field{" "}
                {unsourced.length === 1 ? "it depends" : "they depend"} on. No applicant can qualify
                for {unsourced.length === 1 ? "that weight" : "those weights"} until the application
                captures it.
              </div>
            )}

            <div className="mb-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="py-2 pr-4 font-medium text-stone">Weighted tier</th>
                    <th className="py-2 pr-4 text-right font-medium text-stone">Entries</th>
                    <th className="py-2 pr-4 font-medium text-stone">Read from</th>
                    <th className="py-2 font-medium text-stone">Authority</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.config.weightedTiers
                    .filter((t) => t.enabled)
                    .map((tier) => (
                      <tr key={tier.key} className="border-b border-line last:border-0 align-top">
                        <td className="py-2 pr-4 text-ink">{tier.label}</td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">{tier.weight}</td>
                        <td className="py-2 pr-4 text-stone-text">
                          {tier.source.kind === "unavailable"
                            ? "Not available"
                            : tier.source.field}
                        </td>
                        <td className="py-2 text-xs text-stone-text">{tier.authorityNote || "—"}</td>
                      </tr>
                    ))}
                  <tr>
                    <td className="py-2 pr-4 text-ink">All other applicants</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">
                      {parsed.config.defaultWeight}
                    </td>
                    <td className="py-2 pr-4 text-stone-text">Default</td>
                    <td className="py-2 text-xs text-stone-text">—</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-5">
              {renderPolicyStatements(parsed.config).map((statement) => (
                <div key={statement.heading}>
                  <p className="text-xs font-medium uppercase tracking-wider text-stone mb-1.5">
                    {statement.heading}
                  </p>
                  <ul className="space-y-1">
                    {statement.lines.map((line, idx) => (
                      <li key={idx} className="text-sm text-ink/80 leading-relaxed">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Version history"
            description="Adopted versions are never edited. Every change creates a new version."
          >
            <ul className="divide-y divide-line">
              {versions.map((version) => (
                <li key={version.id} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      Version {version.version} — {version.name}
                    </p>
                    <p className="mt-0.5 text-xs text-stone">
                      {version.status === "adopted" && version.adoptedDate
                        ? `Adopted ${version.adoptedDate}${
                            version.adoptedByName ? ` by ${version.adoptedByName}` : ""
                          }`
                        : version.status === "superseded"
                          ? `Superseded${version.adoptedDate ? `, adopted ${version.adoptedDate}` : ""}`
                          : "Draft — governs nothing"}
                    </p>
                    {version.adoptedNote && (
                      <p className="mt-1 text-xs text-stone-text">{version.adoptedNote}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Chip status={version.status} />
                    {isSystemAdmin && version.status === "draft" && (
                      <Button
                        variant="outline"
                        className="rounded-[6px] min-h-[44px]"
                        onClick={() => {
                          setAdoptTarget(version);
                          setAdoptDate("");
                          setAdoptNote("");
                          setAdoptAffirmed(false);
                        }}
                      >
                        Adopt
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      {/* ─── Editor ─── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit policy as a new draft</DialogTitle>
            <DialogDescription>
              Saving creates a new draft version. Nothing changes for any lottery until a system
              admin adopts it with the board&apos;s adoption date.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">Policy name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-stone mb-2">
                Weighted tiers
              </p>
              <div className="space-y-3">
                {tiers.map((tier, idx) => (
                  <div key={tier.key} className="rounded-[6px] border border-line p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex min-h-[44px] items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tier.enabled}
                          onChange={(e) =>
                            setTiers((prev) =>
                              prev.map((t, i) =>
                                i === idx ? { ...t, enabled: e.target.checked } : t
                              )
                            )
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-ink">{tier.label || tier.key}</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-stone">Entries</span>
                        <input
                          type="number"
                          min={1}
                          value={tier.weight}
                          onChange={(e) =>
                            setTiers((prev) =>
                              prev.map((t, i) => (i === idx ? { ...t, weight: e.target.value } : t))
                            )
                          }
                          className="w-20 px-2 py-1 border border-line rounded-[6px] text-sm"
                        />
                      </div>
                    </div>
                    {tier.optional && (
                      <>
                        <p className="text-xs text-warn-text">
                          {OPTIONAL_PREFERENCE_STANDING_WARNING}
                        </p>
                        <input
                          type="text"
                          value={tier.authorityNote}
                          placeholder="Authority: state law or board policy citation"
                          onChange={(e) =>
                            setTiers((prev) =>
                              prev.map((t, i) =>
                                i === idx ? { ...t, authorityNote: e.target.value } : t
                              )
                            )
                          }
                          className={fieldClass}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                className="mt-3 rounded-[6px] min-h-[44px]"
                onClick={() =>
                  setTiers((prev) => [
                    ...prev,
                    {
                      key: `custom_${prev.length + 1}`,
                      label: "",
                      weight: "1",
                      enabled: false,
                      optional: true,
                      sourceKind: "unavailable",
                      sourceField: "",
                      authorityNote: "",
                      capPercent: "",
                    },
                  ])
                }
              >
                Add a custom weighted tier
              </Button>
              {tiers.some((t) => t.optional && !t.label.trim()) && (
                <div className="mt-3 space-y-2">
                  {tiers.map((tier, idx) =>
                    tier.optional && !tier.label.trim() ? (
                      <input
                        key={tier.key}
                        type="text"
                        value={tier.label}
                        placeholder="Custom tier label"
                        onChange={(e) =>
                          setTiers((prev) =>
                            prev.map((t, i) => (i === idx ? { ...t, label: e.target.value } : t))
                          )
                        }
                        className={fieldClass}
                      />
                    ) : null
                  )}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-stone mb-2">
                Acceptance and waitlist windows
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">
                    Acceptance window (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={acceptanceDays}
                    onChange={(e) => setAcceptanceDays(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">
                    Acceptance cutoff time
                  </label>
                  <input
                    type="time"
                    value={acceptanceCutoff}
                    onChange={(e) => setAcceptanceCutoff(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">
                    Waitlist offer window (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={waitlistDays}
                    onChange={(e) => setWaitlistDays(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">
                    Waitlist cutoff time
                  </label>
                  <input
                    type="time"
                    value={waitlistCutoff}
                    onChange={(e) => setWaitlistCutoff(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>
              <label className="mt-3 flex min-h-[44px] items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={waitlistCarryover}
                  onChange={(e) => setWaitlistCarryover(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-ink">Waitlists carry over to the next year</span>
              </label>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-stone mb-1">
                Additional preferences
              </p>
              <p className="text-xs text-warn-text mb-3">{OPTIONAL_PREFERENCE_STANDING_WARNING}</p>
              <div className="space-y-3">
                {OPTIONAL_KEYS.map((key) => {
                  const edited = optionals[key];
                  if (!edited) return null;
                  const shape = OPTIONAL_SHAPE[key];
                  return (
                    <div key={key} className="rounded-[6px] border border-line p-3 space-y-2">
                      <label className="flex min-h-[44px] items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={edited.enabled}
                          onChange={(e) =>
                            setOptionals((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], enabled: e.target.checked },
                            }))
                          }
                          className="w-4 h-4"
                        />
                        <span className="text-sm text-ink">{OPTIONAL_FEATURE_LABELS[key]}</span>
                      </label>
                      {key === "boardMemberChildren" && (
                        <p className="text-xs text-error">{BOARD_MEMBER_PREFERENCE_WARNING}</p>
                      )}
                      {shape.weight && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-stone">Entries</span>
                          <input
                            type="number"
                            min={1}
                            value={edited.weight}
                            onChange={(e) =>
                              setOptionals((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], weight: e.target.value },
                              }))
                            }
                            className="w-20 px-2 py-1 border border-line rounded-[6px] text-sm"
                          />
                        </div>
                      )}
                      {shape.cap && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-stone">Cap (percent of seats)</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={edited.capPercent}
                            onChange={(e) =>
                              setOptionals((prev) => ({
                                ...prev,
                                [key]: { ...prev[key], capPercent: e.target.value },
                              }))
                            }
                            className="w-20 px-2 py-1 border border-line rounded-[6px] text-sm"
                          />
                        </div>
                      )}
                      {shape.zone && (
                        <input
                          type="text"
                          value={edited.zoneDescription}
                          placeholder="Which zone, defined how"
                          onChange={(e) =>
                            setOptionals((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], zoneDescription: e.target.value },
                            }))
                          }
                          className={fieldClass}
                        />
                      )}
                      {shape.note && (
                        <input
                          type="text"
                          value={edited.note}
                          placeholder="Exemption note shown to staff"
                          onChange={(e) =>
                            setOptionals((prev) => ({
                              ...prev,
                              [key]: { ...prev[key], note: e.target.value },
                            }))
                          }
                          className={fieldClass}
                        />
                      )}
                      <input
                        type="text"
                        value={edited.authorityNote}
                        placeholder="Authority: state law or board policy citation (required to enable)"
                        onChange={(e) =>
                          setOptionals((prev) => ({
                            ...prev,
                            [key]: { ...prev[key], authorityNote: e.target.value },
                          }))
                        }
                        className={fieldClass}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-[6px] min-h-[44px]"
              onClick={() => setEditorOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              className="rounded-[6px] min-h-[44px]"
              onClick={handleSaveDraft}
              disabled={isPending || !editName.trim()}
            >
              {isPending ? "Saving…" : "Save as new draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Adoption ─── */}
      <Dialog open={!!adoptTarget} onOpenChange={(open) => !open && setAdoptTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adopt this policy version?</DialogTitle>
            <DialogDescription>
              Adopting version {adoptTarget?.version} makes it the rules every official lottery at{" "}
              {campusName ?? "this campus"} runs under, and supersedes the currently adopted version.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Date the governing board adopted this policy
              </label>
              <input
                type="date"
                value={adoptDate}
                onChange={(e) => setAdoptDate(e.target.value)}
                className={fieldClass}
              />
              <p className="mt-1 text-xs text-stone">
                Enter the date of the actual board action. This becomes part of the compliance
                record.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Adoption note (optional)
              </label>
              <input
                type="text"
                value={adoptNote}
                onChange={(e) => setAdoptNote(e.target.value)}
                placeholder="Board meeting reference, motion number, revision context"
                className={fieldClass}
              />
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={adoptAffirmed}
                onChange={(e) => setAdoptAffirmed(e.target.checked)}
                className="mt-1 w-4 h-4"
              />
              <span className="text-sm text-ink">
                This configuration matches the enrollment policy adopted by the governing board and
                applicable state law.
              </span>
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-[6px] min-h-[44px]"
              onClick={() => setAdoptTarget(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              className="rounded-[6px] min-h-[44px]"
              onClick={handleAdopt}
              disabled={isPending || !adoptDate || !adoptAffirmed}
            >
              {isPending ? "Adopting…" : "Adopt policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
