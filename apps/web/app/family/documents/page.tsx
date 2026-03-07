export const runtime = "edge";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createServerClient } from "@rooted-ems/database/server";
import { getFamilyDocuments } from "@/lib/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const docStatusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  pending: { label: "Pending Review", variant: "warning" },
  verified: { label: "Verified", variant: "success" },
  rejected: { label: "Needs Re-upload", variant: "destructive" },
  expired: { label: "Expired", variant: "secondary" },
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDocType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function FamilyDocumentsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const documents = await getFamilyDocuments(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Uploaded documents for your enrollment applications.
          </p>
        </div>
        <Button disabled>Upload Document</Button>
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon="📄"
              title="No documents yet"
              description="Documents uploaded as part of your enrollment applications will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Documents</CardTitle>
            <CardDescription>
              {documents.length} document{documents.length !== 1 ? "s" : ""} across your applications.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {documents.map((doc) => {
                const cfg = docStatusConfig[doc.status] ?? docStatusConfig.pending;
                const sizeStr = formatFileSize(doc.file_size);
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-md border border-gray-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xl shrink-0" aria-hidden="true">
                        📄
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {doc.file_name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatDocType(doc.document_type)}
                          {sizeStr && <> &middot; {sizeStr}</>}
                          {" "}&middot; Uploaded {formatDate(doc.created_at)}
                          {" "}&middot; {doc.student_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      <Button variant="outline" size="sm" disabled>
                        View
                      </Button>
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
