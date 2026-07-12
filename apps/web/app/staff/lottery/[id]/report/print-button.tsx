"use client";

import { Button } from "@/components/ui/button";

/**
 * Tiny client boundary so the report page itself can stay a server
 * component. window.print() is the only client-only behavior this page
 * needs.
 */
export function PrintReportButton() {
  return (
    <Button onClick={() => window.print()}>
      Print / Save PDF
    </Button>
  );
}
