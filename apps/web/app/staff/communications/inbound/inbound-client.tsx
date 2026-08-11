"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { IconInbox } from "@/components/ui/icons";
import type { InboundEmailRow } from "@/lib/queries";

interface InboundEmailClientProps {
  messages: InboundEmailRow[];
}

function formatReceivedAt(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function InboundEmailClient({ messages }: InboundEmailClientProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Inbound email</h1>
        <p className="text-sm text-stone mt-1">
          Replies families send back to a campus address. Matched senders link to their family
          record; everything else lands here so staff can still see and act on it. Read-only —
          reply from your regular inbox.
        </p>
      </div>

      {messages.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<IconInbox size={40} />}
              title="No inbound email yet"
              description="Replies from families appear here the moment they arrive."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Received messages</CardTitle>
            <CardDescription>Newest first. Click a row to read the full message.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Family</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((msg) => {
                  const isExpanded = expandedId === msg.id;
                  const hasBody = Boolean(msg.body_text && msg.body_text.trim().length > 0);
                  return (
                    <>
                      <TableRow
                        key={msg.id}
                        className={`cursor-pointer hover:bg-rooted-gray-light ${isExpanded ? "bg-rooted-gray-light" : ""}`}
                        onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                      >
                        <TableCell className="text-stone text-sm whitespace-nowrap">
                          {formatReceivedAt(msg.received_at)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-ink/80">{msg.from_email}</span>
                          {msg.campus_name && (
                            <span className="block text-[11px] text-stone">{msg.campus_name}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          {msg.subject ?? "—"}
                        </TableCell>
                        <TableCell>
                          {msg.family_link ? (
                            <Link
                              href={msg.family_link}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs font-medium text-rooted-green hover:underline"
                            >
                              {msg.family_name ?? "View family"} &rarr;
                            </Link>
                          ) : msg.family_name ? (
                            <span className="text-xs text-ink/70">{msg.family_name}</span>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              No matching family
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${msg.id}-detail`}>
                          <TableCell colSpan={4} className="bg-rooted-gray-light/70 px-6 py-3">
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-stone">
                                <span>
                                  <span className="text-stone-text">To:</span>{" "}
                                  {msg.to_email ?? "—"}
                                </span>
                                <span>
                                  <span className="text-stone-text">Forwarded to campus:</span>{" "}
                                  {msg.forwarded_at ? formatReceivedAt(msg.forwarded_at) : "No"}
                                </span>
                              </div>
                              {hasBody ? (
                                <pre className="whitespace-pre-wrap rounded-[6px] bg-white border border-line p-3 font-mono text-[12.5px] leading-relaxed text-ink/80">
                                  {msg.body_text}
                                </pre>
                              ) : (
                                <p className="rounded-[6px] bg-white border border-line p-3 text-sm text-stone italic">
                                  Message text unavailable &mdash; see the provider dashboard.
                                </p>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
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
