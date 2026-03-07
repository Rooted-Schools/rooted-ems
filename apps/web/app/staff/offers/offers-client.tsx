"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { staffRevokeOffer, staffExpireOffer } from "./actions";

interface OfferRow {
  id: string;
  status: string;
  student_name: string;
  grade: string;
  campus_name: string;
  offered_at: string;
  expires_at: string;
}

interface OfferStats {
  total: number;
  pending: number;
  accepted: number;
  declined_or_expired: number;
}

const offerStatusConfig: Record<string, { label: string; variant: "default" | "success" | "destructive" | "warning" | "outline" }> = {
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
}: {
  offers: OfferRow[];
  stats: OfferStats;
  staffUserId: string;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRevoke(offerId: string) {
    setLoading(offerId);
    setError(null);
    const result = await staffRevokeOffer(offerId, staffUserId, "Revoked by staff.");
    if (result.error) setError(result.error);
    setLoading(null);
  }

  async function handleExpire(offerId: string) {
    setLoading(offerId);
    setError(null);
    const result = await staffExpireOffer(offerId);
    if (result.error) setError(result.error);
    setLoading(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Offers</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage seat offers sent to accepted applicants.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

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
            <p className="text-2xl font-bold text-gray-400">{stats.declined_or_expired}</p>
          </CardContent>
        </Card>
      </div>

      {offers.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon="🎫"
              title="No offers yet"
              description="Offers will appear here after a lottery is run and seats are assigned."
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
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {offers.map((offer) => {
                  const cfg = offerStatusConfig[offer.status] ?? offerStatusConfig.pending;
                  const isPending = offer.status === "pending";
                  const isLoading = loading === offer.id;
                  return (
                    <TableRow key={offer.id}>
                      <TableCell className="font-medium">{offer.student_name}</TableCell>
                      <TableCell>{offer.grade}</TableCell>
                      <TableCell>{offer.campus_name}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-500">{offer.offered_at}</TableCell>
                      <TableCell className="text-gray-500">{offer.expires_at}</TableCell>
                      <TableCell>
                        {isPending && (
                          <div className="flex gap-1">
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
                          </div>
                        )}
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
  );
}
