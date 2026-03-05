// TypeScript enums mirroring Postgres enum types

export enum StaffRole {
  SystemAdmin = "system_admin",
  EnrollmentManager = "enrollment_manager",
  EnrollmentStaff = "enrollment_staff",
  ComplianceAuditor = "compliance_auditor",
}

export enum ApplicationStatus {
  Draft = "draft",
  Submitted = "submitted",
  NeedsInfo = "needs_info",
  Verified = "verified",
  LotteryAssigned = "lottery_assigned",
  Offered = "offered",
  Accepted = "accepted",
  Waitlisted = "waitlisted",
  Registered = "registered",
  Declined = "declined",
  Expired = "expired",
  Withdrawn = "withdrawn",
}

export enum EnrollmentStatus {
  Pending = "pending",
  Active = "active",
  Withdrawn = "withdrawn",
  Transferred = "transferred",
}

export enum OfferStatus {
  Pending = "pending",
  Accepted = "accepted",
  Declined = "declined",
  Expired = "expired",
  Revoked = "revoked",
}

export enum LotteryStatus {
  Draft = "draft",
  Preview = "preview",
  Official = "official",
  Archived = "archived",
}

export enum CommChannel {
  Email = "email",
  Sms = "sms",
  InApp = "in_app",
}

export enum CommStatus {
  Queued = "queued",
  Sent = "sent",
  Delivered = "delivered",
  Failed = "failed",
  Bounced = "bounced",
}

export enum DocumentStatus {
  Pending = "pending",
  Verified = "verified",
  Rejected = "rejected",
  Expired = "expired",
}

export enum FormFieldType {
  Text = "text",
  Textarea = "textarea",
  Number = "number",
  Date = "date",
  Email = "email",
  Phone = "phone",
  Select = "select",
  MultiSelect = "multi_select",
  Checkbox = "checkbox",
  Radio = "radio",
  FileUpload = "file_upload",
  Address = "address",
  Signature = "signature",
}

export enum GradeLevelCode {
  Six = "6",
  Seven = "7",
  Eight = "8",
  Nine = "9",
  Ten = "10",
  Eleven = "11",
  Twelve = "12",
}

export enum AuditAction {
  Create = "create",
  Update = "update",
  Delete = "delete",
  StatusChange = "status_change",
  Login = "login",
  Export = "export",
}

export enum WindowStatus {
  Draft = "draft",
  Open = "open",
  Closed = "closed",
  Archived = "archived",
}

export enum GuardianRelationship {
  Mother = "mother",
  Father = "father",
  Stepmother = "stepmother",
  Stepfather = "stepfather",
  Grandmother = "grandmother",
  Grandfather = "grandfather",
  Aunt = "aunt",
  Uncle = "uncle",
  FosterParent = "foster_parent",
  LegalGuardian = "legal_guardian",
  Other = "other",
}
