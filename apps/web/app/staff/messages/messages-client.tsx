"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconMail, IconMailOpen } from "@/components/ui/icons";
import { markStaffNotificationsRead } from "./actions";

interface StaffMessage {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  time_ago: string;
}

interface StaffMessagesClientProps {
  messages: StaffMessage[];
}

export function StaffMessagesClient({ messages }: StaffMessagesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const unreadCount = messages.filter((m) => !m.is_read).length;
  const readCount = messages.filter((m) => m.is_read).length;
  const unreadIds = messages.filter((m) => !m.is_read).map((m) => m.id);

  const displayed = filter === "unread" ? messages.filter((m) => !m.is_read) : messages;

  function handleMarkAllRead() {
    if (unreadIds.length === 0) return;
    startTransition(async () => {
      await markStaffNotificationsRead(unreadIds);
      router.refresh();
    });
  }

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markStaffNotificationsRead([id]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Notifications</h1>
          <p className="text-sm text-stone mt-1">
            Updates on family activity — applications, document uploads, registrations, and offer responses.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isPending}
          >
            {isPending ? "Marking..." : "Mark all read"}
          </Button>
        )}
      </div>

      {/* Summary tiles */}
      {messages.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card
            className={`cursor-pointer transition-all ${
              filter === "unread" && unreadCount > 0
                ? "ring-2 ring-amber-400/50 border-amber-300"
                : ""
            }`}
            onClick={() =>
              setFilter(unreadCount > 0 ? (filter === "unread" ? "all" : "unread") : "all")
            }
          >
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <IconMail size={20} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{unreadCount}</p>
                  <p className="text-xs text-stone">Unread</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rooted-gray flex items-center justify-center shrink-0">
                  <IconMailOpen size={20} className="text-ink/60" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-ink/60">{readCount}</p>
                  <p className="text-xs text-stone">Read</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {messages.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <EmptyState
              icon={<IconMail size={40} />}
              title="No notifications yet"
              description="You will receive notifications here when families take action — submitting applications, uploading documents, accepting offers, or completing registration."
            />
          </CardContent>
        </Card>
      ) : displayed.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-stone">All caught up! No unread notifications.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setFilter("all")}>
              Show all
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {filter === "unread" ? "Unread Notifications" : "All Notifications"}
                </CardTitle>
                <CardDescription>
                  {displayed.length} notification{displayed.length !== 1 ? "s" : ""}
                  {filter === "unread" && (
                    <button
                      onClick={() => setFilter("all")}
                      className="ml-2 text-rooted-green hover:underline"
                    >
                      Show all
                    </button>
                  )}
                </CardDescription>
              </div>
              {filter === "all" && unreadCount > 0 && (
                <Badge variant="warning">{unreadCount} unread</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {displayed.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 p-3.5 rounded-lg border transition-all ${
                    !msg.is_read
                      ? "border-amber-200 bg-amber-50/40 shadow-sm"
                      : "border-rooted-gray hover:border-stone/20"
                  }`}
                >
                  {/* Status indicator */}
                  <div className="relative shrink-0 mt-0.5">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        !msg.is_read ? "bg-amber-100" : "bg-rooted-gray-light"
                      }`}
                    >
                      <span className="shrink-0" aria-hidden="true">
                        {!msg.is_read ? <IconMail size={16} /> : <IconMailOpen size={16} />}
                      </span>
                    </div>
                    {!msg.is_read && (
                      <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-amber-500 border-2 border-white" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm ${
                            !msg.is_read
                              ? "font-semibold text-ink"
                              : "font-medium text-ink/70"
                          }`}
                        >
                          {msg.title}
                        </p>
                        {msg.body && (
                          <p className="text-sm text-stone mt-0.5 line-clamp-2">{msg.body}</p>
                        )}
                      </div>
                      <span className="text-xs text-stone whitespace-nowrap mt-0.5 shrink-0">
                        {msg.time_ago}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-2">
                      {msg.link && (
                        <a
                          href={msg.link}
                          className="text-xs font-medium text-rooted-green hover:underline"
                          onClick={() => {
                            if (!msg.is_read) handleMarkRead(msg.id);
                          }}
                        >
                          View Details &rarr;
                        </a>
                      )}
                      {!msg.is_read && (
                        <button
                          onClick={() => handleMarkRead(msg.id)}
                          disabled={isPending}
                          className="text-xs text-stone hover:text-ink/60 transition-colors"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
