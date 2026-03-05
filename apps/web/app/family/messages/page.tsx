import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

/* ─── Types ─── */
interface FamilyMessage {
  id: string;
  subject: string;
  preview: string;
  from: string;
  date: string;
  read: boolean;
  category: "enrollment" | "document" | "lottery" | "general" | "action_required";
  relatedStudent: string | null;
}

/* ─── Mock Data ─── */
const MOCK_MESSAGES: FamilyMessage[] = [
  {
    id: "msg-001",
    subject: "Application Received — Marcus Johnson",
    preview:
      "Thank you for submitting your enrollment application for Marcus Johnson. Our team will review it and follow up if we need any additional information.",
    from: "Rooted School Enrollment",
    date: "2026-02-28",
    read: true,
    category: "enrollment",
    relatedStudent: "Marcus Johnson",
  },
  {
    id: "msg-002",
    subject: "Document Verified: Birth Certificate",
    preview:
      "The birth certificate you uploaded for Marcus Johnson has been reviewed and verified by our enrollment team.",
    from: "Document Review Team",
    date: "2026-03-01",
    read: true,
    category: "document",
    relatedStudent: "Marcus Johnson",
  },
  {
    id: "msg-003",
    subject: "Reminder: Complete Ava's Application",
    preview:
      "You have a draft application for Ava Johnson that has not been submitted yet. The enrollment window closes on March 31, 2026.",
    from: "Rooted School Enrollment",
    date: "2026-03-02",
    read: false,
    category: "action_required",
    relatedStudent: "Ava Johnson",
  },
  {
    id: "msg-004",
    subject: "2026-27 Enrollment Window Now Open",
    preview:
      "The enrollment window for the 2026-27 school year is now open at Vancouver WA. Apply today to secure your student's spot.",
    from: "Rooted School Foundation",
    date: "2026-02-15",
    read: true,
    category: "general",
    relatedStudent: null,
  },
  {
    id: "msg-005",
    subject: "Proof of Residency Under Review",
    preview:
      "The proof of residency document you uploaded is currently being reviewed. We will notify you once verification is complete.",
    from: "Document Review Team",
    date: "2026-03-01",
    read: true,
    category: "document",
    relatedStudent: "Marcus Johnson",
  },
];

/* ─── Helpers ─── */
const categoryConfig: Record<
  string,
  { label: string; variant: "default" | "secondary" | "warning" | "success" }
> = {
  enrollment: { label: "Enrollment", variant: "default" },
  document: { label: "Document", variant: "secondary" },
  lottery: { label: "Lottery", variant: "default" },
  general: { label: "General", variant: "secondary" },
  action_required: { label: "Action Required", variant: "warning" },
};

const categoryIcons: Record<string, string> = {
  enrollment: "📝",
  document: "📄",
  lottery: "🎲",
  general: "📢",
  action_required: "⚠️",
};

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ─── Page Component ─── */
export default function FamilyMessagesPage() {
  const unreadCount = MOCK_MESSAGES.filter((m) => !m.read).length;
  const actionRequired = MOCK_MESSAGES.filter((m) => m.category === "action_required" && !m.read);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-sm text-gray-500 mt-1">
            Notifications and updates about your enrollment applications.
          </p>
        </div>
        {unreadCount > 0 && (
          <Badge variant="warning">{unreadCount} unread</Badge>
        )}
      </div>

      {/* Action Required Banner */}
      {actionRequired.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">
                ⚠️
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {actionRequired.length} item{actionRequired.length !== 1 ? "s" : ""} requiring your attention
                </p>
                <div className="mt-2 space-y-1">
                  {actionRequired.map((msg) => (
                    <p key={msg.id} className="text-sm text-gray-700">
                      &bull; {msg.subject}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages list */}
      {MOCK_MESSAGES.length === 0 ? (
        <Card>
          <CardContent>
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
              {MOCK_MESSAGES.length} message{MOCK_MESSAGES.length !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {MOCK_MESSAGES.map((msg) => {
                const cat = categoryConfig[msg.category] ?? categoryConfig.general;
                const icon = categoryIcons[msg.category] ?? "📩";

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 p-3 rounded-md border transition-colors cursor-pointer hover:bg-gray-50 ${
                      !msg.read
                        ? "border-amber-200 bg-amber-50/30"
                        : "border-gray-200"
                    }`}
                  >
                    <span className="text-lg mt-0.5 shrink-0" aria-hidden="true">
                      {icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={`text-sm truncate ${
                                !msg.read
                                  ? "font-semibold text-gray-900"
                                  : "font-medium text-gray-700"
                              }`}
                            >
                              {msg.subject}
                            </p>
                            {!msg.read && (
                              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                            {msg.preview}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {formatDate(msg.date)}
                          </span>
                          <Badge variant={cat.variant} className="text-[10px]">
                            {cat.label}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-gray-400">
                          From: {msg.from}
                        </span>
                        {msg.relatedStudent && (
                          <span className="text-xs text-gray-400">
                            &middot; {msg.relatedStudent}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
