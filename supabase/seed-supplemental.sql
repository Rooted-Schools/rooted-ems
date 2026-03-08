-- =============================================
-- Rooted EMS — Supplemental Seed Data
-- Adds inquiries, notes, audit events, and more
-- Run via Supabase SQL Editor on the hosted DB
-- Idempotent: uses ON CONFLICT DO NOTHING
-- =============================================

-- Fix any guardian_student rows missing relationship
UPDATE guardian_student SET relationship = 'parent', is_legal_guardian = true
WHERE relationship IS NULL;

-- ─── Inquiries (lead capture from interest forms) ──────
INSERT INTO inquiry (id, student_first_name, student_last_name, grade_applying, guardian_name, guardian_email, guardian_phone, source, status, campus_id, notes, created_at) VALUES
  ('00000000-0000-0000-0050-000000000001', 'Jayden', 'Moore', '9', 'Tanya Moore', 'tanya.moore@example.com', '(360) 555-4001', 'website', 'new', '00000000-0000-0000-0002-000000000001', 'Found us through Google search', NOW() - INTERVAL '2 days'),
  ('00000000-0000-0000-0050-000000000002', 'Aaliyah', 'Jackson', '6', 'Keisha Jackson', 'keisha.j@example.com', '(803) 555-4002', 'referral', 'contacted', '00000000-0000-0000-0002-000000000002', 'Referred by current parent Maria Garcia', NOW() - INTERVAL '5 days'),
  ('00000000-0000-0000-0050-000000000003', 'Diego', 'Hernandez', '10', 'Rosa Hernandez', 'rosa.h@example.com', '(216) 555-4003', 'social_media', 'new', '00000000-0000-0000-0002-000000000003', 'Saw Facebook ad about career pathways', NOW() - INTERVAL '1 day'),
  ('00000000-0000-0000-0050-000000000004', 'Zoe', 'Patel', '9', 'Priya Patel', 'priya.patel@example.com', '(360) 555-4004', 'community_event', 'applied', '00000000-0000-0000-0002-000000000001', 'Met at community fair', NOW() - INTERVAL '14 days'),
  ('00000000-0000-0000-0050-000000000005', 'Marcus', 'Robinson', '7', 'Angela Robinson', 'angela.r@example.com', '(803) 555-4005', 'website', 'new', '00000000-0000-0000-0002-000000000002', NULL, NOW() - INTERVAL '3 hours'),
  ('00000000-0000-0000-0050-000000000006', 'Lily', 'Nguyen', '11', 'Tran Nguyen', 'tran.nguyen@example.com', '(216) 555-4006', 'referral', 'contacted', '00000000-0000-0000-0002-000000000003', 'Referred by school counselor', NOW() - INTERVAL '7 days'),
  ('00000000-0000-0000-0050-000000000007', 'Isaiah', 'Stewart', '6', 'Darius Stewart', 'darius.s@example.com', '(803) 555-4007', 'website', 'lost', '00000000-0000-0000-0002-000000000002', 'No response after 3 attempts', NOW() - INTERVAL '30 days'),
  ('00000000-0000-0000-0050-000000000008', 'Chloe', 'Kim', '9', 'Min-Jun Kim', 'minjun.kim@example.com', '(360) 555-4008', 'open_house', 'new', '00000000-0000-0000-0002-000000000001', 'Attended January open house', NOW() - INTERVAL '6 hours')
ON CONFLICT (id) DO NOTHING;

-- ─── Contact Logs (outreach history) ───────────────────
INSERT INTO contact_log (id, inquiry_id, staff_id, channel, direction, notes, created_at) VALUES
  ('00000000-0000-0000-0051-000000000001', '00000000-0000-0000-0050-000000000002', NULL, 'phone', 'outbound', 'Called to discuss enrollment. Parent very interested. Scheduled school tour for next week.', NOW() - INTERVAL '4 days'),
  ('00000000-0000-0000-0051-000000000002', '00000000-0000-0000-0050-000000000002', NULL, 'email', 'outbound', 'Sent enrollment packet and campus brochure.', NOW() - INTERVAL '3 days'),
  ('00000000-0000-0000-0051-000000000003', '00000000-0000-0000-0050-000000000006', NULL, 'phone', 'outbound', 'Left voicemail. Will try again tomorrow.', NOW() - INTERVAL '6 days'),
  ('00000000-0000-0000-0051-000000000004', '00000000-0000-0000-0050-000000000006', NULL, 'email', 'outbound', 'Parent replied — wants to know about IEP support. Connected with SPED coordinator.', NOW() - INTERVAL '5 days'),
  ('00000000-0000-0000-0051-000000000005', '00000000-0000-0000-0050-000000000007', NULL, 'phone', 'outbound', 'No answer — first attempt.', NOW() - INTERVAL '28 days'),
  ('00000000-0000-0000-0051-000000000006', '00000000-0000-0000-0050-000000000007', NULL, 'phone', 'outbound', 'No answer — second attempt.', NOW() - INTERVAL '21 days'),
  ('00000000-0000-0000-0051-000000000007', '00000000-0000-0000-0050-000000000007', NULL, 'email', 'outbound', 'Sent follow-up email. No response. Marking as lost.', NOW() - INTERVAL '14 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Notes (staff annotations on applications) ─────────
INSERT INTO note (id, entity_type, entity_id, content, is_internal, created_at) VALUES
  ('00000000-0000-0000-0055-000000000001', 'application', '00000000-0000-0000-0020-000000000001', 'Application looks complete. All documents uploaded.', true, NOW() - INTERVAL '3 days'),
  ('00000000-0000-0000-0055-000000000002', 'application', '00000000-0000-0000-0020-000000000003', 'Proof of address document is blurry — requested re-upload from guardian.', true, NOW() - INTERVAL '2 days'),
  ('00000000-0000-0000-0055-000000000003', 'application', '00000000-0000-0000-0020-000000000003', 'Called guardian Sarah Johnson — she will re-upload by Friday.', true, NOW() - INTERVAL '1 day'),
  ('00000000-0000-0000-0055-000000000004', 'application', '00000000-0000-0000-0020-000000000006', 'Lucas Martinez family accepted offer promptly. Very enthusiastic about career pathways program.', true, NOW() - INTERVAL '10 days'),
  ('00000000-0000-0000-0055-000000000005', 'application', '00000000-0000-0000-0020-000000000008', 'Sibling of current student at another campus. Priority consideration for lottery.', true, NOW() - INTERVAL '4 days'),
  ('00000000-0000-0000-0055-000000000006', 'application', '00000000-0000-0000-0020-000000000010', 'Offer sent 5 days ago — expires in 9 days. Guardian acknowledged receipt.', true, NOW() - INTERVAL '4 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Documents (uploaded by families) ──────────────────
INSERT INTO document (id, application_id, student_id, document_type, file_name, file_size, mime_type, status, uploaded_at) VALUES
  ('00000000-0000-0000-0060-000000000001', '00000000-0000-0000-0020-000000000001', '00000000-0000-0000-0012-000000000001', 'birth_certificate', 'sofia-garcia-birth-cert.pdf', 245000, 'application/pdf', 'verified', NOW() - INTERVAL '7 days'),
  ('00000000-0000-0000-0060-000000000002', '00000000-0000-0000-0020-000000000001', '00000000-0000-0000-0012-000000000001', 'proof_of_address', 'garcia-utility-bill.pdf', 180000, 'application/pdf', 'verified', NOW() - INTERVAL '7 days'),
  ('00000000-0000-0000-0060-000000000003', '00000000-0000-0000-0020-000000000001', '00000000-0000-0000-0012-000000000001', 'immunization_record', 'sofia-immunizations.pdf', 320000, 'application/pdf', 'pending', NOW() - INTERVAL '5 days'),
  ('00000000-0000-0000-0060-000000000004', '00000000-0000-0000-0020-000000000003', '00000000-0000-0000-0012-000000000003', 'birth_certificate', 'olivia-johnson-birth-cert.pdf', 220000, 'application/pdf', 'verified', NOW() - INTERVAL '6 days'),
  ('00000000-0000-0000-0060-000000000005', '00000000-0000-0000-0020-000000000003', '00000000-0000-0000-0012-000000000003', 'proof_of_address', 'johnson-address-proof.jpg', 1500000, 'image/jpeg', 'rejected', NOW() - INTERVAL '5 days'),
  ('00000000-0000-0000-0060-000000000006', '00000000-0000-0000-0020-000000000004', '00000000-0000-0000-0012-000000000004', 'birth_certificate', 'liam-brown-birth-cert.pdf', 210000, 'application/pdf', 'verified', NOW() - INTERVAL '8 days'),
  ('00000000-0000-0000-0060-000000000007', '00000000-0000-0000-0020-000000000004', '00000000-0000-0000-0012-000000000004', 'proof_of_address', 'brown-lease-agreement.pdf', 450000, 'application/pdf', 'verified', NOW() - INTERVAL '8 days'),
  ('00000000-0000-0000-0060-000000000008', '00000000-0000-0000-0020-000000000004', '00000000-0000-0000-0012-000000000004', 'immunization_record', 'liam-immunizations.pdf', 280000, 'application/pdf', 'verified', NOW() - INTERVAL '7 days'),
  ('00000000-0000-0000-0060-000000000009', '00000000-0000-0000-0020-000000000007', '00000000-0000-0000-0012-000000000007', 'birth_certificate', 'ava-anderson-birth-cert.pdf', 195000, 'application/pdf', 'pending', NOW() - INTERVAL '3 days'),
  ('00000000-0000-0000-0060-000000000010', '00000000-0000-0000-0020-000000000008', '00000000-0000-0000-0012-000000000008', 'birth_certificate', 'mason-taylor-birth-cert.pdf', 230000, 'application/pdf', 'verified', NOW() - INTERVAL '5 days'),
  ('00000000-0000-0000-0060-000000000011', '00000000-0000-0000-0020-000000000008', '00000000-0000-0000-0012-000000000008', 'proof_of_address', 'taylor-proof-of-address.pdf', 175000, 'application/pdf', 'verified', NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Verification Items ────────────────────────────────
INSERT INTO verification_item (id, application_id, label, is_completed) VALUES
  ('00000000-0000-0000-0061-000000000001', '00000000-0000-0000-0020-000000000002', 'Birth certificate verified', true),
  ('00000000-0000-0000-0061-000000000002', '00000000-0000-0000-0020-000000000002', 'Proof of address verified', true),
  ('00000000-0000-0000-0061-000000000003', '00000000-0000-0000-0020-000000000002', 'Immunization records current', true),
  ('00000000-0000-0000-0061-000000000004', '00000000-0000-0000-0020-000000000002', 'Parent contact confirmed', true),
  ('00000000-0000-0000-0061-000000000005', '00000000-0000-0000-0020-000000000004', 'Birth certificate verified', true),
  ('00000000-0000-0000-0061-000000000006', '00000000-0000-0000-0020-000000000004', 'Proof of address verified', true),
  ('00000000-0000-0000-0061-000000000007', '00000000-0000-0000-0020-000000000004', 'Immunization records current', true),
  ('00000000-0000-0000-0061-000000000008', '00000000-0000-0000-0020-000000000004', 'Parent contact confirmed', true),
  ('00000000-0000-0000-0061-000000000009', '00000000-0000-0000-0020-000000000008', 'Birth certificate verified', true),
  ('00000000-0000-0000-0061-000000000010', '00000000-0000-0000-0020-000000000008', 'Proof of address verified', true),
  ('00000000-0000-0000-0061-000000000011', '00000000-0000-0000-0020-000000000008', 'Immunization records current', false),
  ('00000000-0000-0000-0061-000000000012', '00000000-0000-0000-0020-000000000008', 'Parent contact confirmed', true)
ON CONFLICT (id) DO NOTHING;

-- ─── Waitlist (for oversubscribed grades) ──────────────
INSERT INTO waitlist (id, campus_id, grade_level_id, school_year_id) VALUES
  ('00000000-0000-0000-0070-000000000001', '00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0004-000000000101', '00000000-0000-0000-0003-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─── Message Templates ─────────────────────────────────
INSERT INTO message_template (id, campus_id, name, channel, subject, body) VALUES
  ('00000000-0000-0000-0080-000000000001', '00000000-0000-0000-0002-000000000001', 'Application Received', 'email', 'Your application has been received', 'Dear {{guardian_name}},\n\nThank you for submitting an application for {{student_name}} at Rooted School Vancouver. We have received your application and will review it shortly.\n\nBest regards,\nRooted School Vancouver Enrollment Team'),
  ('00000000-0000-0000-0080-000000000002', '00000000-0000-0000-0002-000000000001', 'Missing Documents', 'email', 'Action needed: Missing documents for your application', 'Dear {{guardian_name}},\n\nWe are reviewing the application for {{student_name}} and need the following documents:\n\n{{missing_documents}}\n\nPlease upload these documents through your family portal.\n\nThank you,\nRooted School Vancouver'),
  ('00000000-0000-0000-0080-000000000003', '00000000-0000-0000-0002-000000000001', 'Offer Letter', 'email', 'Enrollment Offer for {{student_name}}', 'Dear {{guardian_name}},\n\nCongratulations! We are pleased to offer {{student_name}} a seat at Rooted School Vancouver for the {{school_year}} school year.\n\nPlease accept or decline this offer by {{deadline}}.\n\nWe look forward to welcoming your family!\n\nRooted School Vancouver'),
  ('00000000-0000-0000-0080-000000000004', NULL, 'Welcome to Rooted', 'sms', NULL, 'Welcome to rootedschools! Your application for {{student_name}} has been received. Log in to your family portal to track your status.'),
  ('00000000-0000-0000-0080-000000000005', NULL, 'Deadline Reminder', 'sms', NULL, 'Reminder: Your offer for {{student_name}} at rootedschool expires on {{deadline}}. Log in to accept: {{portal_link}}')
ON CONFLICT (id) DO NOTHING;
