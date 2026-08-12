"use client";

import { cn, displayClass } from "@/lib/utils";
import { IconAlertTriangle, IconCheckCircle, IconBuilding } from "@/components/ui/icons";
import type { NetworkOverview, CampusNetworkRow, ThresholdStatus } from "@/lib/queries/network";

interface NetworkClientProps {
  overview: NetworkOverview;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "—" for a genuinely unavailable number, never a fabricated 0. */
function Num({ value }: { value: number | null }) {
  if (value === null) return <span className="text-stone-text">Not available</span>;
  return <span className="tabular-nums">{value.toLocaleString("en-US")}</span>;
}

// Red here follows funnel-client.tsx's RAG convention (raw red-700), not the
// `error` token — error is reserved for inside-72h urgency (offer deadlines),
// a different semantic than "this rate is below the red threshold".
const THRESHOLD_STYLE: Record<ThresholdStatus, string> = {
  ok: "text-ink",
  amber: "text-warn-text font-semibold",
  red: "text-red-700 font-semibold",
  unavailable: "text-stone-text",
};

function FirstTouchCell({ row }: { row: CampusNetworkRow }) {
  if (row.pct_first_touch_24h === null) {
    return <span className="text-stone-text">{row.pct_first_touch_24h_reason ?? "Not available"}</span>;
  }
  return (
    <span className={THRESHOLD_STYLE[row.pct_first_touch_24h_status]}>
      {row.pct_first_touch_24h}%
    </span>
  );
}

function ContactsCell({ row }: { row: CampusNetworkRow }) {
  if (row.contacts_7d === null) {
    return <span className="text-stone-text">Not available</span>;
  }
  if (row.contacts_7d_amber) {
    return (
      <span className="text-warn-text font-semibold">
        {row.contacts_7d} — No contact activity this week
      </span>
    );
  }
  return <span className="tabular-nums">{row.contacts_7d}</span>;
}

function PolicyCell({ row }: { row: CampusNetworkRow }) {
  const status = row.policy_status;
  if (status.kind === "unavailable") {
    return <span className="text-stone-text">Not available yet</span>;
  }
  return (
    <span className={status.amber ? "text-warn-text font-semibold" : "text-ink"}>{status.label}</span>
  );
}

function AutomationBanner({ automation }: { automation: NetworkOverview["automation"] }) {
  const Icon = automation.ok ? IconCheckCircle : IconAlertTriangle;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-[6px] border px-4 py-2.5 text-sm",
        automation.ok
          ? "border-line bg-white text-ink"
          : "border-warn/40 bg-warn/10 text-warn-text"
      )}
    >
      <Icon size={16} className={automation.ok ? "text-stone" : "text-warn-text"} />
      <span>
        {automation.ok
          ? "Scheduled automation: running normally."
          : `Scheduled automation needs attention: ${automation.detail}.`}
      </span>
      <span className="text-xs text-stone-text">
        (network-wide — heartbeats aren&apos;t recorded per campus)
      </span>
    </div>
  );
}

export function NetworkClient({ overview }: NetworkClientProps) {
  const { rows, automation, computedAt } = overview;

  return (
    <div className="space-y-6">
      <div>
        <h1 className={cn("text-2xl font-bold text-ink", displayClass)}>Network</h1>
        <p className="mt-1 text-sm text-stone">
          Every campus at a glance — the numbers the network answers for.
        </p>
      </div>

      <AutomationBanner automation={automation} />

      {rows.length === 0 ? (
        <div className="rounded-[6px] border border-line bg-white p-8 text-center">
          <IconBuilding size={24} className="mx-auto mb-2 text-stone" />
          <p className="text-sm text-stone">No active campuses found.</p>
        </div>
      ) : (
        <div className="rounded-[6px] border border-line bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-line bg-sunken">
                  <th className="sticky left-0 z-10 bg-sunken px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone">
                    Campus
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone">
                    Leads (total / new 7d)
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone">
                    Contacts (7d)
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone">
                    First touch &lt;24h (30d)
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone">
                    Applications
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone">
                    Seats (registered / total)
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone">
                    Next event
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone">
                    Next window
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-stone">
                    Lottery policy
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.campus_id}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-ink whitespace-nowrap">
                      {row.campus_name}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Num value={row.leads_total} /> <span className="text-stone-text">/</span>{" "}
                      <Num value={row.leads_new_7d} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ContactsCell row={row} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <FirstTouchCell row={row} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Num value={row.apps_total} />{" "}
                      <span className="text-xs text-stone-text">({row.apps_scope})</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Num value={row.seats_registered} /> <span className="text-stone-text">/</span>{" "}
                      <Num value={row.seats_total} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.next_event ? (
                        <>
                          {row.next_event.title}{" "}
                          <span className="text-xs text-stone-text">
                            {formatDateTime(row.next_event.starts_at)}
                          </span>
                        </>
                      ) : (
                        <span className="text-stone-text">No upcoming event</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.next_window ? (
                        row.next_window.label
                      ) : (
                        <span className="text-stone-text">No upcoming window</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <PolicyCell row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-stone-text">
        Last computed just now &middot; {new Date(computedAt).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}
