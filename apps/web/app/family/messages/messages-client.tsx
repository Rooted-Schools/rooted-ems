"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { markNotificationsRead } from "./actions";
import { useLocale } from "@/lib/i18n/locale-context";

interface FamilyMessage {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  time_ago: string;
}

interface MessagesClientProps {
  messages: FamilyMessage[];
}

export function MessagesClient({ messages }: MessagesClientProps) {
  const { t } = useLocale();
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
      await markNotificationsRead(unreadIds);
      router.refresh();
    });
  }

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificationsRead([id]);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{t("nav.messages")}</h1>
          <p className="text-sm text-stone mt-1">
            Notifications and updates about your enrollment applications.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={isPending}
          >
            {isPending ? t("msgs.marking") : t("msgs.markAllRead")}
          </Button>
        )}
      </div>

      {/* Summary banner */}
      {messages.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card
            className={`cursor-pointer transition-all ${
              filter === "unread" && unreadCount > 0
                ? "ring-2 ring-amber-400/50 border-amber-300"
                : ""
            }`}
            onClick={() => setFilter(unreadCount > 0 ? (filter === "unread" ? "all" : "unread") : "all")}
          >
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <span className="text-lg" aria-hidden="true">📩</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600">{unreadCount}</p>
                  <p className="text-xs text-stone">{t("msgs.unread")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rooted-gray flex items-center justify-center shrink-0">
                  <span className="text-lg" aria-hidden="true">📧</span>
                </div>
                <div>
                  <p className="text-2xl font-bold text-ink/60">{readCount}</p>
                  <p className="text-xs text-stone">{t("msgs.read")}</p>
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
              icon="📬"
              title={t("msgs.noMessages")}
              description="You will receive notifications here when there are updates to your enrollment applications — like status changes, document requests, or seat offers."
            />
          </CardContent>
        </Card>
      ) : displayed.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-stone">{t("msgs.allCaughtUp")}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setFilter("all")}>
              {t("msgs.showAll")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  {filter === "unread" ? t("msgs.unreadMessages") : t("msgs.allMessages")}
                </CardTitle>
                <CardDescription>
                  {displayed.length} message{displayed.length !== 1 ? "s" : ""}
                  {filter === "unread" && (
                    <button
                      onClick={() => setFilter("all")}
                      className="ml-2 text-rooted-green hover:underline"
                    >
                      {t("msgs.showAll")}
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
                      <span className="text-base" aria-hidden="true">
                        {!msg.is_read ? "📩" : "📧"}
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
                          <p className="text-sm text-stone mt-0.5 line-clamp-2">
                            {msg.body}
                          </p>
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
                          {t("msgs.markRead")}
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
