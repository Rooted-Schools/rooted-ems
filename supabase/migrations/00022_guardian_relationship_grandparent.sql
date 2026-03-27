-- Add 'grandparent' to guardian_relationship enum
-- The form uses this gender-neutral value; the original enum only had
-- grandmother/grandfather which forces an unnecessary gender choice.
ALTER TYPE guardian_relationship ADD VALUE IF NOT EXISTS 'grandparent';
