-- Migration 001: Enum Types
-- All enum types used across the Rooted EMS schema

-- Staff roles (hierarchy: system_admin > enrollment_manager > enrollment_staff > compliance_auditor)
CREATE TYPE staff_role AS ENUM (
  'system_admin',
  'enrollment_manager',
  'enrollment_staff',
  'compliance_auditor'
);

-- Application status (state machine)
CREATE TYPE application_status AS ENUM (
  'draft',
  'submitted',
  'needs_info',
  'verified',
  'lottery_assigned',
  'offered',
  'accepted',
  'waitlisted',
  'registered',
  'declined',
  'expired',
  'withdrawn'
);

-- Enrollment status
CREATE TYPE enrollment_status AS ENUM (
  'pending',
  'active',
  'withdrawn',
  'transferred'
);

-- Offer status
CREATE TYPE offer_status AS ENUM (
  'pending',
  'accepted',
  'declined',
  'expired',
  'revoked'
);

-- Lottery run status
CREATE TYPE lottery_status AS ENUM (
  'draft',
  'preview',
  'official',
  'archived'
);

-- Communication channel
CREATE TYPE comm_channel AS ENUM (
  'email',
  'sms',
  'in_app'
);

-- Communication delivery status
CREATE TYPE comm_status AS ENUM (
  'queued',
  'sent',
  'delivered',
  'failed',
  'bounced'
);

-- Document verification status
CREATE TYPE document_status AS ENUM (
  'pending',
  'verified',
  'rejected',
  'expired'
);

-- Dynamic form field types
CREATE TYPE form_field_type AS ENUM (
  'text',
  'textarea',
  'number',
  'date',
  'email',
  'phone',
  'select',
  'multi_select',
  'checkbox',
  'radio',
  'file_upload',
  'address',
  'signature'
);

-- Grade levels (Rooted serves 6-12)
CREATE TYPE grade_level_code AS ENUM (
  '6', '7', '8', '9', '10', '11', '12'
);

-- Audit action types
CREATE TYPE audit_action AS ENUM (
  'create',
  'update',
  'delete',
  'status_change',
  'login',
  'export'
);

-- Enrollment window status
CREATE TYPE window_status AS ENUM (
  'draft',
  'open',
  'closed',
  'archived'
);

-- Guardian relationship type
CREATE TYPE guardian_relationship AS ENUM (
  'mother',
  'father',
  'stepmother',
  'stepfather',
  'grandmother',
  'grandfather',
  'aunt',
  'uncle',
  'foster_parent',
  'legal_guardian',
  'other'
);
