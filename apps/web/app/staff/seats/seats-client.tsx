"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconPenLine } from "@/components/ui/icons";
import { staffUpdateCapacity } from "./actions";

interface SeatRow {
  id: string;
  campus_name: string;
  grade: string;
  total_seats: number;
  seats_offered: number;
  seats_accepted: number;
  seats_registered: number;
  available: number;
  fill_pct: number;
}

interface SeatsClientProps {
  rows: SeatRow[];
}

export function SeatsClient({ rows }: SeatsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Summary KPIs
  const totalSeats = rows.reduce((a, r) => a + r.total_seats, 0);
  const totalOffered = rows.reduce((a, r) => a + r.seats_offered, 0);
  const totalAccepted = rows.reduce((a, r) => a + r.seats_accepted, 0);
  const totalRegistered = rows.reduce((a, r) => a + r.seats_registered, 0);
  const totalAvailable = rows.reduce((a, r) => a + r.available, 0);

  // Group by campus
  const campusMap: Record<string, SeatRow[]> = {};
  for (const row of rows) {
    if (!campusMap[row.campus_name]) campusMap[row.campus_name] = [];
    campusMap[row.campus_name].push(row);
  }

  function handleEdit(row: SeatRow) {
    setEditingId(row.id);
    setEditValue(row.total_seats);
    setFeedback(null);
  }

  function handleCancel() {
    setEditingId(null);
    setEditValue(0);
  }

  function handleSave(rowId: string) {
    if (editValue < 0) return;
    startTransition(async () => {
      const result = await staffUpdateCapacity(rowId, editValue);
      if (result.error) {
        setFeedback({ type: "error", message: result.error });
      } else {
        setFeedback({ type: "success", message: "Capacity updated." });
        setEditingId(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Seat Management</h1>
        <p className="text-sm text-stone mt-1">
          {/* Item 13: scope description to what the user actually sees */}
          {Object.keys(campusMap).length === 1
            ? `Capacity planning and seat availability for ${Object.keys(campusMap)[0]}`
            : "Capacity planning and real-time seat availability across your campuses"}
        </p>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-sm ${
            feedback.type === "success"
              ? "bg-green-50 border border-green-200 text-green-800"
              : "bg-red-50 border border-red-200 text-red-800"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-t-4 border-t-rooted-green">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-stone uppercase tracking-wider">
              Total Seats
            </p>
            <p className="text-3xl font-bold text-rooted-green mt-1">{totalSeats}</p>
            <p className="text-xs text-stone mt-1">across all grades</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-blue-500">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-stone uppercase tracking-wider">
              Offered
            </p>
            <p className="text-3xl font-bold text-blue-600 mt-1">
              {totalOffered}
            </p>
            <p className="text-xs text-stone mt-1">pending acceptance</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-amber-500">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-stone uppercase tracking-wider">
              Accepted
            </p>
            <p className="text-3xl font-bold text-amber-600 mt-1">
              {totalAccepted}
            </p>
            <p className="text-xs text-stone mt-1">completing registration</p>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-emerald-500">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-stone uppercase tracking-wider">
              Registered
            </p>
            <p className="text-3xl font-bold text-emerald-600 mt-1">
              {totalRegistered}
            </p>
            <p className="text-xs text-stone mt-1">
              {totalSeats > 0
                ? `${Math.round((totalRegistered / totalSeats) * 100)}% fill rate`
                : "fully enrolled"}
            </p>
          </CardContent>
        </Card>
        <Card className={`border-t-4 ${totalAvailable <= 5 ? "border-t-red-500" : "border-t-stone"}`}>
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-stone uppercase tracking-wider">
              Available
            </p>
            <p className={`text-3xl font-bold mt-1 ${totalAvailable <= 0 ? "text-red-600" : totalAvailable <= 5 ? "text-amber-600" : "text-ink/60"}`}>
              {totalAvailable}
            </p>
            <p className="text-xs text-stone mt-1">
              {totalAvailable <= 0 ? "at capacity" : "seats remaining"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Capacity by Campus */}
      {Object.entries(campusMap).map(([campusName, campusRows]) => {
        const campusTotal = campusRows.reduce((a, r) => a + r.total_seats, 0);
        const campusReg = campusRows.reduce(
          (a, r) => a + r.seats_registered,
          0
        );
        const campusFill =
          campusTotal > 0 ? Math.round((campusReg / campusTotal) * 100) : 0;

        return (
          <Card key={campusName}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{campusName}</CardTitle>
                  <CardDescription>
                    {campusTotal} total seats &middot; {campusFill}% filled
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-32 h-3 bg-rooted-gray rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        campusFill >= 90
                          ? "bg-red-500"
                          : campusFill >= 70
                          ? "bg-amber-500"
                          : "bg-rooted-green"
                      }`}
                      style={{ width: `${campusFill}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-ink/60">
                    {campusFill}%
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone/20">
                      <th className="text-left py-2 text-xs font-medium text-stone">
                        Grade
                      </th>
                      <th className="text-right py-2 text-xs font-medium text-stone">
                        Total
                      </th>
                      <th className="text-right py-2 text-xs font-medium text-stone">
                        Offered
                      </th>
                      <th className="text-right py-2 text-xs font-medium text-stone">
                        Accepted
                      </th>
                      <th className="text-right py-2 text-xs font-medium text-stone">
                        Registered
                      </th>
                      <th className="text-right py-2 text-xs font-medium text-stone">
                        Available
                      </th>
                      <th className="text-right py-2 text-xs font-medium text-stone">
                        Fill
                      </th>
                      <th className="text-right py-2 text-xs font-medium text-stone w-20">
                        Edit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {campusRows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-rooted-gray last:border-0"
                      >
                        <td className="py-2.5 font-medium text-ink">
                          Grade {row.grade}
                        </td>
                        <td className="py-2.5 text-right">
                          {editingId === row.id ? (
                            <input
                              type="number"
                              value={editValue}
                              onChange={(e) =>
                                setEditValue(parseInt(e.target.value) || 0)
                              }
                              min={0}
                              max={999}
                              className="w-16 px-2 py-1 text-right border border-stone/30 rounded text-sm focus:outline-none focus:ring-2 focus:ring-rooted-green/50"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSave(row.id);
                                if (e.key === "Escape") handleCancel();
                              }}
                            />
                          ) : (
                            <span className="text-ink/60">
                              {row.total_seats}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right text-blue-600">
                          {row.seats_offered}
                        </td>
                        <td className="py-2.5 text-right text-amber-600">
                          {row.seats_accepted}
                        </td>
                        <td className="py-2.5 text-right text-rooted-green">
                          {row.seats_registered}
                        </td>
                        <td className="py-2.5 text-right">
                          <Badge
                            variant={
                              row.available <= 0
                                ? "destructive"
                                : row.available <= 5
                                ? "warning"
                                : "success"
                            }
                          >
                            {row.available}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-2 bg-rooted-gray rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  row.fill_pct >= 90
                                    ? "bg-red-500"
                                    : row.fill_pct >= 70
                                    ? "bg-amber-500"
                                    : "bg-rooted-green"
                                }`}
                                style={{ width: `${row.fill_pct}%` }}
                              />
                            </div>
                            <span className="text-xs text-stone w-8 text-right">
                              {row.fill_pct}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          {editingId === row.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCancel}
                                disabled={isPending}
                                className="h-7 px-2 text-xs"
                              >
                                ✕
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleSave(row.id)}
                                disabled={isPending}
                                className="h-7 px-2 text-xs"
                              >
                                {isPending ? "…" : "✓"}
                              </Button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleEdit(row)}
                              className="text-xs text-stone hover:text-rooted-green transition-colors"
                              title="Edit total seats"
                            >
                              <IconPenLine size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {rows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-stone">
              No capacity plans configured. Add capacity plans in Settings.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
