export const runtime = "edge";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const MOCK_DOCUMENTS = [
  {
    id: "doc-001",
    name: "Birth Certificate — Marcus Johnson",
    type: "proof_of_age",
    status: "verified",
    uploadedAt: "2026-02-28",
    fileSize: "1.2 MB",
  },
  {
    id: "doc-002",
    name: "Immunization Record — Marcus Johnson",
    type: "immunization",
    status: "verified",
    uploadedAt: "2026-02-28",
    fileSize: "845 KB",
  },
  {
    id: "doc-003",
    name: "Proof of Residency — Utility Bill",
    type: "residency",
    status: "verified",
    uploadedAt: "2026-02-28",
    fileSize: "2.1 MB",
  },
  {
    id: "doc-004",
    name: "Birth Certificate — Ava Johnson",
    type: "proof_of_age",
    status: "pending",
    uploadedAt: "2026-03-03",
    fileSize: "1.4 MB",
  },
];

const docStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  pending: { label: "Pending Review", variant: "warning" },
  verified: { label: "Verified", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
  expired: { label: "Expired", variant: "secondary" },
};

export default function FamilyDocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Uploaded documents for your enrollment applications.
          </p>
        </div>
        <Button>Upload Document</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your Documents</CardTitle>
          <CardDescription>
            All documents uploaded as part of your enrollment applications.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {MOCK_DOCUMENTS.map((doc) => {
              const cfg = docStatusConfig[doc.status] ?? docStatusConfig.pending;
              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-md border border-gray-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl" aria-hidden="true">
                      📄
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {doc.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {doc.fileSize} &middot; Uploaded {doc.uploadedAt}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    <Button variant="outline" size="sm">
                      View
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
