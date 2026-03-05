"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function StaffSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage campus configuration, enrollment windows, and system preferences.
        </p>
      </div>

      <Tabs defaultValue="campus">
        <TabsList>
          <TabsTrigger value="campus">Campus</TabsTrigger>
          <TabsTrigger value="enrollment">Enrollment Windows</TabsTrigger>
          <TabsTrigger value="forms">Form Templates</TabsTrigger>
          <TabsTrigger value="users">Staff Users</TabsTrigger>
        </TabsList>

        <TabsContent value="campus">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campus Information</CardTitle>
              <CardDescription>
                Basic information about the current campus.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Campus Name
                </label>
                <Input defaultValue="Vancouver WA" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <Input defaultValue="1234 Main St, Vancouver, WA 98660" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Email
                </label>
                <Input type="email" defaultValue="enrollment@rootedschool.org" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Phone
                </label>
                <Input type="tel" defaultValue="(360) 555-0100" />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enrollment">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Enrollment Windows</CardTitle>
                  <CardDescription>
                    Define when families can submit applications.
                  </CardDescription>
                </div>
                <Button>Create Window</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md border border-gray-200">
                  <div>
                    <p className="font-medium text-sm">2026–27 Open Enrollment</p>
                    <p className="text-xs text-gray-500">Jan 15, 2026 — Mar 31, 2026</p>
                  </div>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800">
                    Open
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-gray-200">
                  <div>
                    <p className="font-medium text-sm">2025–26 Late Enrollment</p>
                    <p className="text-xs text-gray-500">Aug 1, 2025 — Aug 31, 2025</p>
                  </div>
                  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-gray-100 text-gray-900">
                    Closed
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forms">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Form Templates</CardTitle>
                  <CardDescription>
                    Define the fields families fill out when applying.
                  </CardDescription>
                </div>
                <Button>Create Template</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md border border-gray-200">
                  <div>
                    <p className="font-medium text-sm">Standard Application Form</p>
                    <p className="text-xs text-gray-500">32 fields · Last updated Feb 15, 2026</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-gray-200">
                  <div>
                    <p className="font-medium text-sm">Registration Packet</p>
                    <p className="text-xs text-gray-500">18 fields · Last updated Jan 20, 2026</p>
                  </div>
                  <Button variant="outline" size="sm">
                    Edit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Staff Users</CardTitle>
                  <CardDescription>
                    Manage staff access and role assignments for this campus.
                  </CardDescription>
                </div>
                <Button>Invite User</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-md border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-rooted-green/10 flex items-center justify-center text-rooted-green text-sm font-medium">
                      SC
                    </div>
                    <div>
                      <p className="font-medium text-sm">Steven Carney</p>
                      <p className="text-xs text-gray-500">steven@rootedschool.org</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-gray-500">System Admin</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-sm font-medium">
                      JD
                    </div>
                    <div>
                      <p className="font-medium text-sm">Jane Doe</p>
                      <p className="text-xs text-gray-500">jane@rootedschool.org</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-gray-500">Enrollment Manager</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
