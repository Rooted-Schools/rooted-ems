"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  staffSendOffer,
  staffRevokeOffer,
  staffExpireOffer,
  staffConvertToEnrollment,
  staffPromoteFromWaitlist,
  staffRemoveFromWaitlist,
} from "./actions";

interface OfferRow {
  id: string;
  status: string;
  student_name: string;
  grade: string;
  campus_name: string;
  offered_at: string;
  expires_at: string;
  application_id: string;
  campus_id: string;
  grade_level_id: string;
  student_id: string;
  school_year_id: string;
  has_enrollment: boolean;
}

interface OfferStats {
  total: number;
  pending: number;
  accepted: number;
  declined_or_expired: number;
}

interface EligibleApplicant {
  application_id: string;
  student_name: string;
  campus_id: string;
  campus_name: string;
  grade_level_id: string;
  grade: string;
  status: string;
  school_year_id: string;
}

interface WaitlistEntry {
  id: string;
  position: number;
  student_name: string;
  grade: string;
  campus_name: string;
  added_at: string;
}

interface CampusCount {
  campus_name: string;
  count: number;
}

const offerStatusConfig: Record<
  string,
  { label: string; variant: "default" | "success" | "destructive" | "warning" | "outline" }
> = {
  pending: { label: "Pending", variant: "warning" },
  accepted: { label: "Accepted", variant: "success" },
  declined: { label: "Declined", variant: "destructive" },
  expired: { label: "Expired", variant: "outline" },
  revoked: { label: "Revoked", variant: "destructive" },
};

export function OffersClient({
  offers,
  stats,
  staffUserId,
  eligibleApplicants = [],
  waitlistEntries = [],
  waitlistCampusCounts = [],
}: {
  offers: OfferRow[];
  stats: OfferStats;
  staffUserId: string;
  eligibleApplicants?: EligibleApplicant[];
  waitlistEntries?: WaitlistEntry[];
  waitlistCampusCounts?: CampusCount[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Auto-clear success/error messages after 5 seconds
  useEffect(() => {
    if (!success && !error) return;
    const timer = setTimeout(() => { setSuccess(null); setError(null); }, 5000);
    return () => clearTimeout(timer);
  }, [success, error]);

  // Create Offer form state
  const [selectedAppId, setSelectedAppId] = useState("");
  const [expiresIn, setExpiresIn] = useState("14");
  const [creatingOffer, setCreatingOffer] = useState(false);

  async function handleRevoke(offerId: string) {
    setLoading(offerId);
    setError(null);
    setSuccess(null);
    const result = await staffRevokeOffer(offerId, staffUserId, "Revoked by staff.");
    if (result.error) setError(result.error);
    else { setSuccess("Offer revoked."); router.refresh(); }
    setLoading(null);
  }

  async function handleExpire(offerId: string) {
    setLoading(offerId);
    setError(null);
    setSuccess(null);
    const result = await staffExpireOffer(offerId);
    if (result.error) setError(result.error);
    else { setSuccess("Offer expired."); router.refresh(); }
    setLoading(null);
  }

  async function handleEnroll(offer: OfferRow) {
    setLoading(offer.id);
    setError(null);
    setSuccess(null);
    const result = await staffConvertToEnrollment(
      offer.student_id,
      offer.campus_id,
      offer.grade_level_id,
      offer.school_year_id,
      offer.application_id
    );
    if (result.error) setError(result.error);
    else { setSuccess(`${offer.student_name} has been enrolled.`); router.refresh(); }
    setLoading(null);
  }

  async function handleCreateOffer() {
    if (!selectedAppId || !expiresIn) return;
    const applicant = eligibleApplicants.find((a) => a.application_id === selectedAppId);
    if (!applicant) return;

    setCreatingOffer(true);
    setError(null);
    setSuccess(null);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(expiresIn, 10));

    const result = await staffSendOffer(
      applicant.application_id,
      applicant.campus_id,
      applicant.grade_level_id,
      expiresAt.toISOString(),
      staffUserId
    );

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(`Offer sent to ${applicant.student_name}.`);
      setDialogOpen(false);
      setSelectedAppId("");
      setExpiresIn("14");
      router.refresh();
    }
    setCreatingOffer(false);
  }

  // Waitlist actions
  async function handlePromote(positionId: string) {
    setLoading(positionId);
    setError(null);
    setSuccess(null);
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const result = await staffPromoteFromWaitlist(positionId, staffUserId, expiresAt);
    if (result.error) setError(result.error);
    else { setSuccess("Student promoted from waitlist — offer sent."); router.refresh(); }
    setLoading(null);
  }

  async function handleRemove(positionId: string) {
    if (!confirm("Are you sure you want to remove this student from the waitlist?")) return;
    setLoading(positionId);
    setError(null);
    setSuccess(null);
    const result = await staffRemoveFromWaitlist(positionId, "Removed by staff.");
    if (result.error) setError(result.error);
    else { setSuccess("Student removed from waitlist."); router.refresh(); }
    setLoading(null);
  }

  const totalWaitlisted = waitlistCampusCounts.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offers & Waitlist</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage seat offers and waitlisted students.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button disabled={eligibleApplicants.length === 0}>
              Send Offer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Offer</DialogTitle>
              <DialogDescription>
                Send a seat offer to a verified applicant. They will have the specified number of days to respond.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Applicant
                </label>
                <select
                  value={selectedAppId}
                  onChange={(e) => setSelectedAppId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                >
                  <option value="">Select an applicant...</option>
                  {eligibleApplicants.map((a) => (
                    <option key={a.application_id} value={a.application_id}>
                      {a.student_name} — {a.campus_name} Grade {a.grade} ({a.status === "verified" ? "Verified" : "Lottery Assigned"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Response Deadline
                </label>
                <select
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                >
                  <option value="7">7 days</option>
                  <option value="10">10 days</option>
                  <option value="14">14 days</option>
                  <option value="21">21 days</option>
                  <option value="30">30 days</option>
                </select>
              </div>
              {selectedAppId && (() => {
                const a = eligibleApplicants.find((x) => x.application_id === selectedAppId);
                if (!a) return null;
                const expDate = new Date();
                expDate.setDate(expDate.getDate() + parseInt(expiresIn, 10));
                return (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm">
                    <p className="font-medium text-gray-900">{a.student_name}</p>
                    <p className="text-gray-500">
                      {a.campus_name} · Grade {a.grade}
                    </p>
                    <p className="text-gray-500 mt-1">
                      Offer expires: {expDate.toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                );
              })()}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateOffer}
                disabled={creatingOffer || !selectedAppId}
              >
                {creatingOffer ? "Sending..." : "Send Offer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

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

      <Tabs defaultValue="offers">
        <TabsList>
          <TabsTrigger value="offers">
            Offers
            {stats.total > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-rooted-gray text-[10px] font-semibold">
                {stats.total}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="waitlist">
            Waitlist
            {totalWaitlisted > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-rooted-gray text-[10px] font-semibold">
                {totalWaitlisted}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ─── Offers Tab ─── */}
        <TabsContent value="offers">
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Offers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending Response
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Accepted
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-600">{stats.accepted}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Declined / Expired
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-gray-400">
                    {stats.declined_or_expired}
                  </p>
                </CardContent>
              </Card>
            </div>

            {offers.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <EmptyState
                    icon="🎫"
                    title="No offers yet"
                    description={
                      eligibleApplicants.length > 0
                        ? `You have ${eligibleApplicants.length} eligible applicant${eligibleApplicants.length !== 1 ? "s" : ""} ready for offers. Click "Send Offer" to get started.`
                        : "Offers will appear here after applicants are verified and seats are assigned."
                    }
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6 px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Campus</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Offered</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="w-44">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {offers.map((offer) => {
                        const cfg =
                          offerStatusConfig[offer.status] ?? offerStatusConfig.pending;
                        const isPending = offer.status === "pending";
                        const isAccepted = offer.status === "accepted";
                        const isLoading = loading === offer.id;
                        return (
                          <TableRow key={offer.id}>
                            <TableCell className="font-medium">
                              {offer.student_name}
                            </TableCell>
                            <TableCell>{offer.grade}</TableCell>
                            <TableCell>{offer.campus_name}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Badge variant={cfg.variant}>{cfg.label}</Badge>
                                {isAccepted && offer.has_enrollment && (
                                  <Badge variant="outline" className="text-[10px]">
                                    Enrolled
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-gray-500">
                              {offer.offered_at}
                            </TableCell>
                            <TableCell className="text-gray-500">
                              {offer.expires_at}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                {isPending && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={isLoading}
                                      onClick={() => handleRevoke(offer.id)}
                                    >
                                      {isLoading ? "..." : "Revoke"}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      disabled={isLoading}
                                      onClick={() => handleExpire(offer.id)}
                                    >
                                      Expire
                                    </Button>
                                  </>
                                )}
                                {isAccepted && !offer.has_enrollment && (
                                  <Button
                                    size="sm"
                                    disabled={isLoading}
                                    onClick={() => handleEnroll(offer)}
                                    className="bg-rooted-green hover:bg-rooted-green/90 text-white"
                                  >
                                    {isLoading ? "..." : "Enroll"}
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ─── Waitlist Tab ─── */}
        <TabsContent value="waitlist">
          <div className="space-y-4">
            {waitlistCampusCounts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {waitlistCampusCounts.map((cc) => (
                  <Card key={cc.campus_name}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {cc.campus_name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className={`text-2xl font-bold ${cc.count === 0 ? "text-gray-300" : ""}`}>
                        {cc.count}
                      </p>
                      <p className="text-xs text-gray-400">students waiting</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {waitlistEntries.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <EmptyState
                    icon="📋"
                    title="No students on waitlist"
                    description="Students will be added to the waitlist after a lottery when there are more applicants than seats."
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">All Waitlisted Students</CardTitle>
                  <CardDescription>
                    When a seat opens, promote the next student from the waitlist to send them an offer.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Position</TableHead>
                        <TableHead>Student</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Campus</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead className="w-40">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {waitlistEntries.map((entry) => {
                        const isLoading = loading === entry.id;
                        return (
                          <TableRow key={entry.id}>
                            <TableCell>
                              <Badge variant="outline">#{entry.position}</Badge>
                            </TableCell>
                            <TableCell className="font-medium">
                              {entry.student_name}
                            </TableCell>
                            <TableCell>{entry.grade}</TableCell>
                            <TableCell>{entry.campus_name}</TableCell>
                            <TableCell className="text-gray-500">
                              {entry.added_at}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button
                                  variant="default"
                                  size="sm"
                                  disabled={isLoading}
                                  onClick={() => handlePromote(entry.id)}
                                >
                                  {isLoading ? "..." : "Promote"}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isLoading}
                                  onClick={() => handleRemove(entry.id)}
                                >
                                  Remove
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
