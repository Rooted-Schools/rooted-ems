// TypeScript interfaces for all database entities

import {
  ApplicationStatus,
  CommChannel,
  CommStatus,
  DocumentStatus,
  EnrollmentStatus,
  FormFieldType,
  GradeLevelCode,
  GuardianRelationship,
  LotteryStatus,
  OfferStatus,
  StaffRole,
  WindowStatus,
  AuditAction,
} from "./enums";

// ============================================
// Organization Hierarchy
// ============================================

export interface Organization {
  id: string;
  name: string;
  legal_name: string | null;
  ein: string | null;
  website: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Region {
  id: string;
  organization_id: string;
  name: string;
  state_code: string;
  created_at: string;
  updated_at: string;
}

export interface Campus {
  id: string;
  organization_id: string;
  region_id: string;
  name: string;
  short_code: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Program {
  id: string;
  campus_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SchoolYear {
  id: string;
  organization_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface GradeLevel {
  id: string;
  campus_id: string;
  school_year_id: string;
  grade: GradeLevelCode;
  created_at: string;
  updated_at: string;
}

// ============================================
// People
// ============================================

export interface UserProfile {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_language: string;
  avatar_url: string | null;
  is_staff: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCampusRole {
  id: string;
  user_id: string;
  campus_id: string;
  role: StaffRole;
  assigned_by: string | null;
  assigned_at: string;
  created_at: string;
  updated_at: string;
}

export interface Household {
  id: string;
  user_id: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  primary_language: string;
  created_at: string;
  updated_at: string;
}

export interface Guardian {
  id: string;
  household_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  relationship: GuardianRelationship;
  email: string | null;
  phone: string | null;
  phone_secondary: string | null;
  employer: string | null;
  is_primary: boolean;
  is_emergency_contact: boolean;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  household_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  date_of_birth: string | null;
  gender: string | null;
  race_ethnicity: string[] | null;
  primary_language: string | null;
  home_language: string | null;
  birth_country: string | null;
  previous_school_name: string | null;
  previous_school_address: string | null;
  previous_school_dates: string | null;
  has_iep: boolean;
  has_504: boolean;
  special_services_notes: string | null;
  medical_allergies: string | null;
  medical_medications: string | null;
  medical_conditions: string | null;
  emergency_contact_1_name: string | null;
  emergency_contact_1_phone: string | null;
  emergency_contact_1_relationship: string | null;
  emergency_contact_2_name: string | null;
  emergency_contact_2_phone: string | null;
  emergency_contact_2_relationship: string | null;
  created_at: string;
  updated_at: string;
}

export interface GuardianStudent {
  id: string;
  guardian_id: string;
  student_id: string;
  relationship: GuardianRelationship;
  is_legal_guardian: boolean;
  created_at: string;
}

// ============================================
// Applications
// ============================================

export interface EnrollmentWindow {
  id: string;
  campus_id: string;
  school_year_id: string;
  name: string;
  status: WindowStatus;
  open_date: string;
  close_date: string;
  late_deadline: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormTemplate {
  id: string;
  campus_id: string | null;
  name: string;
  description: string | null;
  version: number;
  fields: FormFieldDefinition[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  enrollment_window_id: string;
  student_id: string;
  campus_id: string;
  grade_level_id: string;
  form_template_id: string | null;
  guardian_id: string;
  status: ApplicationStatus;
  submitted_at: string | null;
  locked_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  has_sibling_enrolled: boolean;
  sibling_student_id: string | null;
  disciplinary_statement: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationAnswer {
  id: string;
  application_id: string;
  field_key: string;
  value: unknown;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  application_id: string | null;
  student_id: string | null;
  document_type: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string;
  status: DocumentStatus;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationStatusHistory {
  id: string;
  application_id: string;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus;
  changed_by: string | null;
  reason: string | null;
  created_at: string;
}

export interface Signature {
  id: string;
  application_id: string;
  signer_id: string;
  signature_type: string;
  signature_data: string | null;
  ip_address: string | null;
  signed_at: string;
  created_at: string;
}

export interface VerificationItem {
  id: string;
  application_id: string;
  item_name: string;
  is_required: boolean;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Lottery
// ============================================

export interface LotteryRuleSet {
  id: string;
  campus_id: string;
  name: string;
  version: number;
  priority_tiers: unknown[];
  sibling_preference: boolean;
  geographic_preference: boolean;
  rules: Record<string, unknown>;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LotteryRun {
  id: string;
  enrollment_window_id: string;
  lottery_rule_set_id: string;
  campus_id: string;
  grade_level_id: string | null;
  status: LotteryStatus;
  run_number: number;
  random_seed: string | null;
  total_applicants: number;
  total_seats: number;
  executed_by: string | null;
  executed_at: string | null;
  finalized_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface LotteryEntry {
  id: string;
  lottery_run_id: string;
  application_id: string;
  priority_tier: number;
  random_number: number | null;
  final_rank: number | null;
  is_selected: boolean;
  created_at: string;
  updated_at: string;
}

export interface LotteryEntrySnapshot {
  id: string;
  lottery_run_id: string;
  lottery_entry_id: string;
  application_id: string;
  student_name: string;
  grade: GradeLevelCode;
  priority_tier: number;
  random_number: number;
  final_rank: number;
  is_selected: boolean;
  snapshot_data: unknown;
  created_at: string;
}

// ============================================
// Offers & Waitlist
// ============================================

export interface Offer {
  id: string;
  application_id: string;
  lottery_entry_id: string | null;
  campus_id: string;
  grade_level_id: string;
  status: OfferStatus;
  offered_at: string;
  expires_at: string;
  responded_at: string | null;
  offered_by: string | null;
  revoked_by: string | null;
  revoke_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Acceptance {
  id: string;
  offer_id: string;
  application_id: string;
  accepted_at: string;
  accepted_by: string;
  conditions_met: boolean;
  conditions_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Waitlist {
  id: string;
  campus_id: string;
  grade_level_id: string;
  school_year_id: string;
  enrollment_window_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WaitlistPosition {
  id: string;
  waitlist_id: string;
  application_id: string;
  position_number: number;
  added_at: string;
  promoted_at: string | null;
  removed_at: string | null;
  removal_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Capacity & Enrollment
// ============================================

export interface CapacityPlan {
  id: string;
  campus_id: string;
  grade_level_id: string;
  school_year_id: string;
  total_seats: number;
  seats_offered: number;
  seats_accepted: number;
  seats_registered: number;
  created_at: string;
  updated_at: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  campus_id: string;
  grade_level_id: string;
  school_year_id: string;
  acceptance_id: string | null;
  application_id: string | null;
  status: EnrollmentStatus;
  enrolled_at: string | null;
  withdrawn_at: string | null;
  withdrawal_reason: string | null;
  sis_student_id: string | null;
  sis_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Communications & Misc
// ============================================

export interface MessageTemplate {
  id: string;
  campus_id: string | null;
  name: string;
  subject: string | null;
  body: string;
  channel: CommChannel;
  merge_fields: string[];
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunicationLog {
  id: string;
  campus_id: string | null;
  template_id: string | null;
  recipient_user_id: string | null;
  recipient_address: string;
  channel: CommChannel;
  subject: string | null;
  body: string;
  status: CommStatus;
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface PathwayInterest {
  id: string;
  student_id: string;
  campus_id: string;
  pathway_name: string;
  interest_level: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  entity_type: string;
  entity_id: string;
  campus_id: string | null;
  content: string;
  is_internal: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  campus_id: string | null;
  name: string;
  color: string | null;
  created_at: string;
}

export interface ApplicationTag {
  id: string;
  application_id: string;
  tag_id: string;
  created_by: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  table_name: string;
  record_id: string | null;
  action: AuditAction;
  actor_id: string | null;
  campus_id: string | null;
  old_data: unknown;
  new_data: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Setting {
  id: string;
  campus_id: string | null;
  key: string;
  value: unknown;
  created_at: string;
  updated_at: string;
}

// Re-export FormFieldDefinition from forms.ts
import type { FormFieldDefinition } from "./forms";
export type { FormFieldDefinition };
