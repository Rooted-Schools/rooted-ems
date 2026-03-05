import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function FamilyDashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome to Rooted EMS
        </h1>
        <Link href="/family/applications/new">
          <Button>Start New Application</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Applications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">
            You have no applications yet. Start a new application to enroll your
            child at a Rooted School campus.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
