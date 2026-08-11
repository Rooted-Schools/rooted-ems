"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import type { JourneySummary } from "@/lib/queries/journeys";

interface JourneysClientProps {
  journeys: JourneySummary[];
  campuses: { id: string; name: string; short_code: string }[];
  activeCampusId: string;
}

export function JourneysClient({ journeys, campuses, activeCampusId }: JourneysClientProps) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/staff/recruitment" className="text-sm text-rooted-green hover:underline">
            &larr; Back to Recruitment
          </Link>
          <h1 className="text-2xl font-bold text-ink mt-1">Nurture journeys</h1>
          <p className="text-sm text-stone mt-1">
            Automated email sequences that run themselves — and stop the moment a family applies, RSVPs, or you log a
            call. Pause a journey to stop every send; resume to pick back up where each family left off.
          </p>
        </div>
        {campuses.length > 1 && (
          <Select
            value={activeCampusId}
            onChange={(e) =>
              router.push(
                e.target.value === "all"
                  ? "/staff/recruitment/journeys"
                  : `/staff/recruitment/journeys?campus=${e.target.value}`
              )
            }
            className="sm:w-56"
            aria-label="Filter by campus"
          >
            <option value="all">All campuses</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        )}
      </div>

      {journeys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-stone text-sm">
              No journeys exist yet. Journeys are set up directly in the database for now — ask engineering to add
              one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {journeys.map((j) => {
            const total = j.active + j.completed + j.exited;
            return (
              <Link key={j.id} href={`/staff/recruitment/journeys/${j.id}`}>
                <Card className="hover:border-rooted-green/40 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{j.name}</CardTitle>
                          <Badge variant={j.is_active ? "success" : "secondary"}>
                            {j.is_active ? "Active" : "Paused"}
                          </Badge>
                        </div>
                        {j.description && <CardDescription className="mt-1">{j.description}</CardDescription>}
                        <p className="text-xs text-stone mt-1">
                          {j.campus_name ?? "All campuses (network default)"}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <span className="text-rooted-green font-semibold">{j.active} active</span>
                      <span className="text-stone">{j.completed} completed</span>
                      <span className="text-stone">{j.exited} exited</span>
                      <span className="text-stone-text text-xs ml-auto">{total} enrolled ever</span>
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
