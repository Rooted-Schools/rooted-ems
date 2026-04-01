"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { familyAcceptReenrollment, familyDeclineReenrollment } from "./actions";

interface ReenrollmentActionsProps {
  applicationId: string;
}

export function ReenrollmentActions({ applicationId }: ReenrollmentActionsProps) {
  const [accepting, setAccepting] = React.useState(false);
  const [declining, setDeclining] = React.useState(false);
  const [done, setDone] = React.useState<"accepted" | "declined" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    const result = await familyAcceptReenrollment(applicationId);
    setAccepting(false);
    if (result.error) {
      setError(result.error);
    } else {
      setDone("accepted");
    }
  }

  async function handleDecline() {
    setDeclining(true);
    setError(null);
    const result = await familyDeclineReenrollment(applicationId);
    setDeclining(false);
    if (result.error) {
      setError(result.error);
    } else {
      setDone("declined");
    }
  }

  if (done === "accepted") {
    return (
      <div className="bg-rooted-green/10 border border-rooted-green/30 rounded-lg px-4 py-3">
        <p className="text-sm font-medium text-rooted-green">
          Re-enrollment accepted. Your registration packet will be ready shortly.
        </p>
      </div>
    );
  }

  if (done === "declined") {
    return (
      <div className="bg-stone/10 border border-stone/20 rounded-lg px-4 py-3">
        <p className="text-sm text-stone">
          You have declined this re-enrollment offer.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          onClick={handleAccept}
          disabled={accepting || declining}
          className="bg-rooted-green hover:bg-rooted-green/90 text-white"
        >
          {accepting ? "Accepting..." : "Accept Re-enrollment"}
        </Button>
        <Button
          variant="outline"
          onClick={handleDecline}
          disabled={accepting || declining}
        >
          {declining ? "Declining..." : "Decline"}
        </Button>
      </div>
    </div>
  );
}
