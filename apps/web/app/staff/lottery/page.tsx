export const runtime = "edge";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

const MOCK_LOTTERY_RUNS = [
  {
    id: "lot-001",
    name: "2026–27 Grade 6 Lottery",
    campus: "Vancouver WA",
    grade: "6th Grade",
    status: "draft",
    applicants: 45,
    seats: 30,
    createdAt: "2026-03-01",
  },
  {
    id: "lot-002",
    name: "2026–27 Grade 9 Lottery",
    campus: "Columbia SC",
    grade: "9th Grade",
    status: "official",
    applicants: 62,
    seats: 40,
    createdAt: "2026-02-15",
  },
];

const statusVariants: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" }> = {
  draft: { label: "Draft", variant: "secondary" },
  preview: { label: "Preview", variant: "warning" },
  official: { label: "Official", variant: "success" },
  archived: { label: "Archived", variant: "default" },
};

export default function StaffLotteryPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lottery</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure and run enrollment lotteries when demand exceeds capacity.
          </p>
        </div>
        <Button>New Lottery Run</Button>
      </div>

      {MOCK_LOTTERY_RUNS.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="🎲"
              title="No lottery runs yet"
              description="Create a lottery run when you have more applicants than available seats for a grade level."
            >
              <Button>Create First Lottery</Button>
            </EmptyState>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {MOCK_LOTTERY_RUNS.map((run) => {
            const s = statusVariants[run.status] ?? statusVariants.draft;
            const overSubscribed = run.applicants > run.seats;

            return (
              <Link key={run.id} href={`/staff/lottery/${run.id}`}>
                <Card className="hover:border-gray-300 transition-colors cursor-pointer">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{run.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {run.campus} · {run.grade}
                        </CardDescription>
                      </div>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6 text-sm">
                      <div>
                        <span className="text-gray-500">Applicants:</span>{" "}
                        <span className="font-medium">{run.applicants}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Seats:</span>{" "}
                        <span className="font-medium">{run.seats}</span>
                      </div>
                      {overSubscribed && (
                        <Badge variant="warning">
                          {run.applicants - run.seats} over capacity
                        </Badge>
                      )}
                      <div className="ml-auto text-gray-400 text-xs">
                        Created {run.createdAt}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
