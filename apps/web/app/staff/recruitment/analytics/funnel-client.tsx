"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { RecruitmentFunnel } from "@/lib/queries";
import { SOURCE_LABELS, PATHWAY_LABELS } from "../recruitment-client";
import { staffRecordSpend } from "./actions";

interface FunnelDashboardProps {
  funnel: RecruitmentFunnel;
  campuses: { id: string; name: string }[];
  activeCampusId: string;
}

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

function download(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Horizontal proportion bar matching the reports page style. */
function Bar({ pct, color = "bg-rooted-green" }: { pct: number; color?: string }) {
  return (
    <div className="w-full bg-rooted-gray rounded-full h-2.5">
      <div className={`h-2.5 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, Math.max(pct, pct > 0 ? 2 : 0))}%` }} />
    </div>
  );
}

export function FunnelDashboardClient({ funnel, campuses, activeCampusId }: FunnelDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [spendOpen, setSpendOpen] = useState(false);
  const [spendAmount, setSpendAmount] = useState("");
  const [spendChannel, setSpendChannel] = useState("ads");
  const [spendMonth, setSpendMonth] = useState("");
  const [spendCampus, setSpendCampus] = useState(activeCampusId !== "all" ? activeCampusId : "");
  const [spendError, setSpendError] = useState<string | null>(null);

  function recordSpend() {
    setSpendError(null);
    startTransition(async () => {
      const r = await staffRecordSpend({
        campus_id: spendCampus,
        channel: spendChannel,
        amount_dollars: parseFloat(spendAmount) || 0,
        period_month: spendMonth || new Date().toISOString().slice(0, 7),
      });
      if (r.error) setSpendError(r.error);
      else {
        setSpendOpen(false);
        setSpendAmount("");
        router.refresh();
      }
    });
  }
  const maxWeek = Math.max(1, ...funnel.weekly_new.map((w) => w.count));
  const maxZip = Math.max(1, ...funnel.top_zips.map((z) => z.count));

  const appliedRate = funnel.total_leads > 0
    ? Math.round((funnel.funnel.find((f) => f.label === "Applied")?.count ?? 0) / funnel.total_leads * 1000) / 10
    : 0;

  function exportAll() {
    const rows: (string | number)[][] = [];
    rows.push(["Funnel stage", "count", "% of leads"]);
    funnel.funnel.forEach((f) => rows.push([f.label, f.count, f.pct]));
    rows.push([]);
    rows.push(["Source", "leads", "applied", "conversion %"]);
    funnel.by_source.forEach((s) => rows.push([SOURCE_LABELS[s.source] ?? s.source, s.leads, s.applied, s.conversion]));
    rows.push([]);
    rows.push(["Zip code", "leads"]);
    funnel.top_zips.forEach((z) => rows.push([z.zip, z.count]));
    download("recruitment-funnel.csv", toCsv([], rows.map((r) => r.length ? r : [""])));
  }

  const FUNNEL_COLORS = ["bg-stone/60", "bg-blue-500", "bg-amber-500", "bg-rooted-green", "bg-deep-green"];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={activeCampusId === "all" ? "/staff/recruitment" : `/staff/recruitment?campus=${activeCampusId}`} className="text-sm text-rooted-green hover:underline">
            &larr; Back to Recruitment
          </Link>
          <h1 className="text-2xl font-bold text-ink mt-1">Recruitment Funnel</h1>
          <p className="text-sm text-stone mt-1">
            Where families come from, and how far they travel with us.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {campuses.length > 1 && (
            <Select
              value={activeCampusId}
              onChange={(e) =>
                router.push(
                  e.target.value === "all"
                    ? "/staff/recruitment/analytics"
                    : `/staff/recruitment/analytics?campus=${e.target.value}`
                )
              }
              className="w-52"
              aria-label="Filter by campus"
            >
              <option value="all">All campuses</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          )}
          <Button variant="outline" onClick={() => { setSpendCampus(activeCampusId !== "all" ? activeCampusId : ""); setSpendError(null); setSpendOpen(true); }}>
            + Ad spend
          </Button>
          <Button variant="outline" onClick={exportAll}>Export CSV</Button>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total leads", value: funnel.total_leads.toLocaleString() },
          { label: "Applied", value: (funnel.funnel.find((f) => f.label === "Applied")?.count ?? 0).toLocaleString(), sub: `${appliedRate}% of leads` },
          { label: "Enrolled", value: (funnel.funnel.find((f) => f.label === "Enrolled")?.count ?? 0).toLocaleString(), accent: true },
          funnel.spend.total_dollars > 0
            ? {
                label: "Cost per enrolled",
                value: funnel.spend.cost_per_enrolled != null
                  ? `$${funnel.spend.cost_per_enrolled.toLocaleString()}`
                  : "—",
                sub: `$${funnel.spend.total_dollars.toLocaleString()} spent`,
                accent: true,
              }
            : {
                label: "Median time to first call",
                value: funnel.response.median_hours_to_first_call === null
                  ? "—"
                  : funnel.response.median_hours_to_first_call < 48
                    ? `${funnel.response.median_hours_to_first_call}h`
                    : `${Math.round(funnel.response.median_hours_to_first_call / 24)}d`,
                sub: funnel.response.contacted_sample > 0 ? `${funnel.response.contacted_sample} contacted` : "no calls logged yet",
              },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4">
              <p className={`text-2xl font-bold ${s.accent ? "text-rooted-green" : "text-ink"}`}>{s.value}</p>
              <p className="text-xs text-stone mt-0.5">{s.label}</p>
              {s.sub && <p className="text-[11px] text-stone/70 mt-0.5">{s.sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Funnel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">The funnel</CardTitle>
          <CardDescription>Lead → enrolled, traced through each family&apos;s real application status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {funnel.funnel.map((stage, i) => (
            <div key={stage.label} className="flex items-center gap-3">
              <span className="text-xs font-medium text-ink/60 w-20 text-right">{stage.label}</span>
              <div className="flex-1"><Bar pct={stage.pct} color={FUNNEL_COLORS[i]} /></div>
              <span className="text-sm font-bold text-ink/80 w-24 text-right tabular-nums">
                {stage.count.toLocaleString()}
                <span className="text-xs font-normal text-stone"> · {stage.pct}%</span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By source */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Where leads come from</CardTitle>
            <CardDescription>And which channels actually produce applications.</CardDescription>
          </CardHeader>
          <CardContent>
            {funnel.by_source.length === 0 ? (
              <p className="text-sm text-stone text-center py-4">No leads yet.</p>
            ) : (
              <div className="space-y-2.5">
                {funnel.by_source.map((s) => (
                  <div key={s.source} className="flex items-center gap-3">
                    <span className="text-xs font-medium text-ink/70 w-28 truncate" title={SOURCE_LABELS[s.source] ?? s.source}>
                      {SOURCE_LABELS[s.source] ?? s.source}
                    </span>
                    <div className="flex-1"><Bar pct={funnel.total_leads > 0 ? (s.leads / funnel.total_leads) * 100 : 0} /></div>
                    <span className="text-xs text-ink/70 w-24 text-right tabular-nums">
                      {s.leads.toLocaleString()}
                      {s.applied > 0 && <span className="text-rooted-green"> · {s.conversion}%→app</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Momentum */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New leads, last 8 weeks</CardTitle>
            <CardDescription>Momentum — updates as the daily sheet sync runs.</CardDescription>
          </CardHeader>
          <CardContent>
            {funnel.weekly_new.length === 0 ? (
              <p className="text-sm text-stone text-center py-4">No recent activity.</p>
            ) : (
              <div className="flex items-end justify-between gap-1.5 h-40 pt-2">
                {funnel.weekly_new.map((w) => (
                  <div key={w.week} className="flex-1 flex flex-col items-center justify-end gap-1">
                    <span className="text-[10px] font-medium text-ink/60">{w.count}</span>
                    <div
                      className="w-full bg-rooted-green/80 rounded-t transition-all"
                      style={{ height: `${Math.max((w.count / maxWeek) * 100, 3)}%` }}
                    />
                    <span className="text-[9px] text-stone whitespace-nowrap">
                      {new Date(w.week + "T00:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reach: zip */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Neighborhoods reached</CardTitle>
            <CardDescription>Top zip codes — where interest is concentrated.</CardDescription>
          </CardHeader>
          <CardContent>
            {funnel.top_zips.length === 0 ? (
              <p className="text-sm text-stone text-center py-4">No zip data captured yet.</p>
            ) : (
              <div className="space-y-2">
                {funnel.top_zips.map((z) => (
                  <div key={z.zip} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-ink/70 w-14">{z.zip}</span>
                    <div className="flex-1"><Bar pct={(z.count / maxZip) * 100} color="bg-amber-500" /></div>
                    <span className="text-xs text-ink/70 w-10 text-right tabular-nums">{z.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reach: pathway */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pathway interest</CardTitle>
            <CardDescription>What draws families in — seeds personalized outreach.</CardDescription>
          </CardHeader>
          <CardContent>
            {funnel.by_pathway.length === 0 ? (
              <p className="text-sm text-stone text-center py-4">No pathway interest captured yet.</p>
            ) : (
              <div className="space-y-2">
                {funnel.by_pathway.map((p) => {
                  const maxPath = Math.max(1, ...funnel.by_pathway.map((x) => x.count));
                  return (
                    <div key={p.pathway} className="flex items-center gap-3">
                      <span className="text-xs font-medium text-ink/70 w-32 truncate">
                        {PATHWAY_LABELS[p.pathway] ?? p.pathway}
                      </span>
                      <div className="flex-1"><Bar pct={(p.count / maxPath) * 100} color="bg-blue-500" /></div>
                      <span className="text-xs text-ink/70 w-10 text-right tabular-nums">{p.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Response speed detail — honest denominator */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Speed to first call</CardTitle>
          <CardDescription>
            {funnel.response.contacted_sample === 0
              ? "No staff calls have been logged yet. Once your team logs calls on leads, response speed will appear here."
              : `Based on the ${funnel.response.contacted_sample} lead${funnel.response.contacted_sample === 1 ? "" : "s"} with a logged staff call. Harmony's evidence: leads that get a call convert 59% higher.`}
          </CardDescription>
        </CardHeader>
        {funnel.response.contacted_sample > 0 && (
          <CardContent>
            <p className="text-sm text-ink/80">
              Median time to first call:{" "}
              <span className="font-semibold">
                {funnel.response.median_hours_to_first_call}h
              </span>
              {funnel.response.within_3_days_pct !== null && (
                <>
                  {" · "}
                  <span className="font-semibold">{funnel.response.within_3_days_pct}%</span> called within 3 days
                </>
              )}
            </p>
          </CardContent>
        )}
      </Card>

      {/* Ad-spend entry (LG-2 cost tracking) */}
      {spendOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" onClick={() => setSpendOpen(false)}>
          <Card className="max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Record ad spend</CardTitle>
              <CardDescription>Feeds cost per enrolled student on this dashboard.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {campuses.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">Campus</label>
                  <Select value={spendCampus} onChange={(e) => setSpendCampus(e.target.value)}>
                    <option value="">Choose…</option>
                    {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">Amount ($)</label>
                  <Input type="number" min="0" step="0.01" value={spendAmount} onChange={(e) => setSpendAmount(e.target.value)} placeholder="500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">Month</label>
                  <Input type="month" value={spendMonth} onChange={(e) => setSpendMonth(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Channel</label>
                <Select value={spendChannel} onChange={(e) => setSpendChannel(e.target.value)}>
                  <option value="ads">Ads (Facebook / Google)</option>
                  <option value="print">Print / flyers</option>
                  <option value="event">Events / tabling</option>
                  <option value="other">Other</option>
                </Select>
              </div>
              {spendError && <p className="text-sm text-red-600">{spendError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setSpendOpen(false)} disabled={isPending}>Cancel</Button>
                <Button size="sm" onClick={recordSpend} disabled={isPending}>{isPending ? "Saving…" : "Record"}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
