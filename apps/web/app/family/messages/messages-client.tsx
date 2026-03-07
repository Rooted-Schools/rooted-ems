"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { markNotificationsRead } from "./actions";

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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const unreadCount = messages.filter((m) => !m.is_read).length;
  const unreadIds = messages.filter((m) => !m.is_read).map((m) => m.id);

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
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-sm text-gray-500 mt-1">
            Notifications and updates about your enrollment applications.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <>
              <Badge variant="warning">{unreadCount} unread</Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={isPending}
              >
                {isPending ? "Marking..." : "Mark all read"}
              </Button>
            </>
          )}
        </div>
      </div>

      {messages.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon="📬"
              title="No messages yet"
              description="You will receive notifications here when there are updates to your enrollment applications."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Messages</CardTitle>
            <CardDescription>
              {messages.length} message{messages.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
                    !msg.is_read
                      ? "border-amber-200 bg-amber-50/30"
                      : "border-gray-200"
                  }`}
                >
                  <span className="text-lg mt-0.5 shrink-0" aria-hidden="true">
                    {!msg.is_read ? "📩" : "📧"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-sm truncate ${
                              !msg.is_read
                                ? "font-semibold text-gray-900"
                                : "font-medium text-gray-700"
                            }`}
                          >
                            {msg.title}
                          </p>
                          {!msg.is_read && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          )}
                        </div>
                        {msg.body && (
                          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                            {msg.body}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {msg.time_ago}
                        </span>
                        {!msg.is_read && (
                          <button
                            onClick={() => handleMarkRead(msg.id)}
                            disabled={isPending}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                            title="Mark as read"
                          >
                            ✓
                          </button>
                        )}
                      </div>
                    </div>
                    {msg.link && (
                      <a
                        href={msg.link}
                        className="text-xs text-rooted-green hover:underline mt-1 inline-block"
                        onClick={() => {
                          if (!msg.is_read) handleMarkRead(msg.id);
                        }}
                      >
                        View Details →
                      </a>
                    )}
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
