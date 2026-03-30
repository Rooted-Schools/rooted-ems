-- Migration 024: Add placement_review and enrolled to application_status enum
-- These statuses represent the post-registration phase of the enrollment lifecycle:
--   registered → placement_review (all registration items verified by staff)
--   placement_review → enrolled (academic audit complete)

ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'placement_review' AFTER 'registered';
ALTER TYPE application_status ADD VALUE IF NOT EXISTS 'enrolled' AFTER 'placement_review';
