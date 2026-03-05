import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const REPORTS = [
  {
    id: "rpt-pipeline",
    title: "Pipeline Summary",
    description: "Application counts by status, grade, and campus with conversion rates.",
    icon: "📊",
  },
  {
    id: "rpt-demographics",
    title: "Demographics Report",
    description: "Applicant demographics by race/ethnicity, language, and grade level.",
    icon: "👥",
  },
  {
    id: "rpt-capacity",
    title: "Capacity Utilization",
    description: "Seats offered, accepted, and registered vs. total capacity by grade.",
    icon: "📈",
  },
  {
    id: "rpt-lottery",
    title: "Lottery Audit Report",
    description: "Full lottery results with random seeds, priority tiers, and final ranks.",
    icon: "🎲",
  },
  {
    id: "rpt-compliance",
    title: "Compliance Export",
    description: "State-required enrollment data in the mandated reporting format.",
    icon: "📋",
  },
  {
    id: "rpt-audit",
    title: "Audit Trail",
    description: "All system actions with timestamps, users, and change details.",
    icon: "🔍",
  },
];

export default function StaffReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate reports for compliance, analytics, and audit purposes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((report) => (
          <Card key={report.id} className="hover:border-gray-300 transition-colors">
            <CardHeader>
              <div className="flex items-start gap-3">
                <span className="text-2xl" aria-hidden="true">
                  {report.icon}
                </span>
                <div>
                  <CardTitle className="text-base">{report.title}</CardTitle>
                  <CardDescription className="mt-1">
                    {report.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Preview
                </Button>
                <Button variant="outline" size="sm">
                  Export CSV
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
