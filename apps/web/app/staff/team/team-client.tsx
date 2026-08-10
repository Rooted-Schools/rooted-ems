"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { TeamMember } from "./page";
import {
  addTeamMember,
  updateTeamMemberRole,
  removeCampusFromMember,
  inviteStaffMember,
} from "./actions";

const ROLES = [
  { value: "compliance_auditor", label: "Compliance Auditor" },
  { value: "enrollment_staff", label: "Enrollment Staff" },
  { value: "enrollment_manager", label: "Enrollment Manager" },
  { value: "system_admin", label: "System Admin" },
];

const ROLE_COLORS: Record<string, string> = {
  system_admin: "bg-purple-100 text-purple-700 border-purple-200",
  enrollment_manager: "bg-blue-100 text-blue-700 border-blue-200",
  enrollment_staff: "bg-green-100 text-green-700 border-green-200",
  compliance_auditor: "bg-stone-100 text-stone-600 border-stone-200",
};

interface Campus {
  id: string;
  name: string;
}

interface TeamClientProps {
  members: TeamMember[];
  campuses: Campus[];
}

// ─── Add Member Form ──────────────────────────────────────────────────────────

function AddMemberForm({
  campuses,
  onDone,
}: {
  campuses: Campus[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [assignments, setAssignments] = useState<{ campusId: string; role: string }[]>([
    { campusId: campuses[0]?.id ?? "", role: "enrollment_staff" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function addRow() {
    setAssignments((prev) => [
      ...prev,
      { campusId: campuses[0]?.id ?? "", role: "enrollment_staff" },
    ]);
  }

  function removeRow(i: number) {
    setAssignments((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, field: "campusId" | "role", value: string) {
    setAssignments((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row))
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addTeamMember(email.trim(), assignments);
      if (result.error) {
        setError(result.error);
      } else {
        toast({
          variant: "success",
          title: "Staff member added",
          description: `${email.trim()} now has access to the assigned campuses.`,
        });
        onDone();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-ink/70 mb-1">
          Email address
        </label>
        <Input
          type="email"
          placeholder="staff@rootedschool.org"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <p className="text-xs text-stone mt-1">
          The person must have signed in at the staff login at least once before you can add them.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink/70 mb-2">
          Campus assignments
        </label>
        <div className="space-y-2">
          {assignments.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Select
                value={row.campusId}
                onChange={(e) => updateRow(i, "campusId", e.target.value)}
                className="flex-1"
              >
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select
                value={row.role}
                onChange={(e) => updateRow(i, "role", e.target.value)}
                className="flex-1"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
              {assignments.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-stone hover:text-red-500 text-lg leading-none px-1"
                  aria-label="Remove campus"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="mt-2 text-xs text-rooted-green hover:underline"
        >
          + Add another campus
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isPending || !email}
          className="bg-rooted-green hover:bg-rooted-green/90 text-white"
        >
          {isPending ? "Adding…" : "Add Staff Member"}
        </Button>
      </div>
    </form>
  );
}

// ─── Invite Staff Member Dialog ────────────────────────────────────────────────
// Adds someone who has never signed in before. The server action creates
// their Supabase Auth account and emails them an invite, or — if they
// already have an account under this email — just grants the role(s)
// directly with no email sent.

function InviteMemberDialog({ campuses }: { campuses: Campus[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [assignments, setAssignments] = useState<{ campusId: string; role: string }[]>([
    { campusId: campuses[0]?.id ?? "", role: "enrollment_staff" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function resetForm() {
    setEmail("");
    setFirstName("");
    setLastName("");
    setAssignments([{ campusId: campuses[0]?.id ?? "", role: "enrollment_staff" }]);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  function addRow() {
    setAssignments((prev) => [
      ...prev,
      { campusId: campuses[0]?.id ?? "", role: "enrollment_staff" },
    ]);
  }

  function removeRow(i: number) {
    setAssignments((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, field: "campusId" | "role", value: string) {
    setAssignments((prev) =>
      prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row))
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    startTransition(async () => {
      const result = await inviteStaffMember(
        trimmedEmail,
        firstName.trim(),
        lastName.trim(),
        assignments
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.outcome === "invited") {
        toast({
          variant: "success",
          title: "Invite sent",
          description: `Invite sent to ${trimmedEmail}. They set their password from the email link.`,
        });
      } else {
        toast({
          variant: "success",
          title: "Staff member added",
          description: "Added: they already had an account.",
        });
      }
      handleOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="min-h-[44px]">
          Invite staff member
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-[6px]">
        <DialogHeader>
          <DialogTitle>Invite staff member</DialogTitle>
          <DialogDescription>
            They do not need to have signed in before. We will email them a link to set a
            password, or add the role directly if they already have an account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                First name
              </label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="min-h-[44px]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink/70 mb-1">
                Last name
              </label>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="min-h-[44px]"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink/70 mb-1">
              Email address
            </label>
            <Input
              type="email"
              placeholder="staff@rootedschool.org"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-[44px]"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink/70 mb-2">
              Role and campus
            </label>
            <div className="space-y-2">
              {assignments.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Select
                    value={row.role}
                    onChange={(e) => updateRow(i, "role", e.target.value)}
                    className="flex-1 min-h-[44px]"
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={row.campusId}
                    onChange={(e) => updateRow(i, "campusId", e.target.value)}
                    className="flex-1 min-h-[44px]"
                  >
                    {campuses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  {assignments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center text-stone hover:text-red-500 text-lg leading-none"
                      aria-label="Remove campus"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="mt-2 text-xs text-rooted-green hover:underline"
            >
              + Add another campus
            </button>
          </div>

          {error && (
            <p className="text-sm text-warn-text bg-warn/10 border border-warn/40 rounded-[6px] px-3 py-2">
              {error}
            </p>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="min-h-[44px] bg-rooted-green hover:bg-rooted-green/90 text-white"
              disabled={isPending || !email || !firstName || !lastName || assignments.length === 0}
            >
              {isPending ? "Sending invite..." : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Member Row ───────────────────────────────────────────────────────────────

function MemberRow({
  member,
  campuses,
}: {
  member: TeamMember;
  campuses: Campus[];
}) {
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  function startEdit(rowId: string, currentRole: string) {
    setEditingRowId(rowId);
    setEditRole(currentRole);
    setError(null);
  }

  function cancelEdit() {
    setEditingRowId(null);
    setError(null);
  }

  function saveRole(rowId: string) {
    startTransition(async () => {
      const result = await updateTeamMemberRole(rowId, editRole);
      if (result.error) {
        setError(result.error);
      } else {
        toast({ variant: "success", title: "Role updated" });
        setEditingRowId(null);
      }
    });
  }

  function removeRow(rowId: string) {
    if (!confirm("Remove this campus assignment? If it's their last one, they'll lose staff access.")) return;
    startTransition(async () => {
      const result = await removeCampusFromMember(rowId, member.user_id);
      if (result.error) setError(result.error);
      else toast({ variant: "success", title: "Campus assignment removed" });
    });
  }

  return (
    <div className="border border-stone/15 rounded-lg p-4 space-y-3 bg-white">
      {/* Person header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-rooted-green/15 flex items-center justify-center text-sm font-semibold text-deep-green shrink-0">
          {member.initials || "?"}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-ink truncate">
              {member.full_name !== "Unknown" ? member.full_name : member.email}
            </p>
            {member.invited && (
              <span
                className="shrink-0 inline-flex items-center rounded-[6px] border border-warn/40 bg-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-warn-text"
                title="Invited but has not signed in yet"
              >
                Invited
              </span>
            )}
          </div>
          <p className="text-xs text-stone truncate">{member.email}</p>
        </div>
      </div>

      {/* Campus role rows */}
      <div className="space-y-1.5 pl-12">
        {member.campusRoles.map((cr) => (
          <div key={cr.row_id} className="flex items-center gap-2">
            <span className="text-xs text-stone w-40 truncate">{cr.campus_name}</span>

            {editingRowId === cr.row_id ? (
              <>
                <Select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="text-xs h-7 py-0 flex-1"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                <button
                  onClick={() => saveRole(cr.row_id)}
                  disabled={isPending}
                  className="text-xs text-rooted-green hover:underline disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={cancelEdit}
                  className="text-xs text-stone hover:text-ink"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${
                    ROLE_COLORS[cr.role] ?? "bg-stone-100 text-stone-600"
                  }`}
                >
                  {ROLES.find((r) => r.value === cr.role)?.label ?? cr.role}
                </span>
                <button
                  onClick={() => startEdit(cr.row_id, cr.role)}
                  className="text-[11px] text-stone hover:text-ink ml-auto"
                >
                  Edit
                </button>
                <button
                  onClick={() => removeRow(cr.row_id)}
                  disabled={isPending}
                  className="text-[11px] text-stone hover:text-red-500 disabled:opacity-50"
                >
                  Remove
                </button>
              </>
            )}
          </div>
        ))}

        {error && (
          <p className="text-xs text-red-600 mt-1">{error}</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Client ──────────────────────────────────────────────────────────────

export function TeamClient({ members, campuses }: TeamClientProps) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Team</h1>
          <p className="text-sm text-stone mt-0.5">
            {members.length} staff member{members.length !== 1 ? "s" : ""} across all campuses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <InviteMemberDialog campuses={campuses} />
          {!showAdd && (
            <Button
              onClick={() => setShowAdd(true)}
              className="min-h-[44px] bg-rooted-green hover:bg-rooted-green/90 text-white"
            >
              + Add Staff Member
            </Button>
          )}
        </div>
      </div>

      {showAdd && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add Staff Member</CardTitle>
          </CardHeader>
          <CardContent>
            <AddMemberForm campuses={campuses} onDone={() => setShowAdd(false)} />
          </CardContent>
        </Card>
      )}

      {members.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-stone">
            No staff members yet. Add the first one above.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((m) => (
            <MemberRow key={m.user_id} member={m} campuses={campuses} />
          ))}
        </div>
      )}
    </div>
  );
}
