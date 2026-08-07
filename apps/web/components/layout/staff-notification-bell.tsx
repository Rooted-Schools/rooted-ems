"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FamilyMessageRow } from "@/lib/queries";
import {
  markAllStaffNotificationsRead,
  markStaffNotificationsRead,
} from "@/app/staff/messages/actions";

interface StaffNotificationBellProps {
  unreadCount?: number;
  /** Most recent notifications for the dropdown preview (newest first) */
  notifications?: FamilyMessageRow[];
}

/**
 * Notification bell with unread badge and a dropdown preview of the last
 * ~10 notifications.  Mirrors the family header bell's visual language;
 * full history lives at /staff/messages.
 */
export function StaffNotificationBell({
  unreadCount = 0,
  notifications = [],
}: StaffNotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape (returning focus to the bell) or tap outside
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointerDown(e: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // Clears every unread staff notification, not just the ~10 in this preview
  // — otherwise the badge keeps a count the user has no way to reach.
  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllStaffNotificationsRead();
      router.refresh();
    });
  }

  function handleItemClick(notification: FamilyMessageRow) {
    setOpen(false);
    if (!notification.is_read) {
      startTransition(async () => {
        await markStaffNotificationsRead([notification.id]);
        router.refresh();
      });
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-rooted-gray-light transition-colors"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="staff-notification-panel"
      >
        <svg
          className="w-4.5 h-4.5 text-stone"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none px-0.5">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="staff-notification-panel"
          className="absolute right-0 top-full mt-1 w-80 max-w-[calc(100vw-2rem)] bg-white border border-stone/20 rounded-lg shadow-lg z-50"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone/10">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {/* Driven by the badge count, not the preview: unread items past
                the first ten still need a way to be cleared. */}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs text-rooted-green hover:text-deep-green font-medium transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-stone text-center">
              No notifications yet.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-stone/10">
              {notifications.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.link ?? "/staff/messages"}
                    onClick={() => handleItemClick(n)}
                    className={`flex gap-2.5 px-4 py-2.5 transition-colors hover:bg-rooted-gray-light ${
                      n.is_read ? "" : "bg-amber-50/60"
                    }`}
                  >
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                        n.is_read ? "bg-transparent" : "bg-rooted-green"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span
                        className={`block text-sm truncate ${
                          n.is_read ? "text-ink/70" : "text-ink font-semibold"
                        }`}
                      >
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="block text-xs text-stone line-clamp-2">
                          {n.body}
                        </span>
                      )}
                      <span className="block text-[11px] text-stone/80 mt-0.5">
                        {n.time_ago}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-stone/10">
            <Link
              href="/staff/messages"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-center text-sm text-rooted-green hover:text-deep-green font-medium transition-colors"
            >
              View all messages
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
