-- Migration 009: Indexes
-- Comprehensive indexes for all major query patterns

-- Organization hierarchy
CREATE INDEX idx_region_organization ON region(organization_id);
CREATE INDEX idx_campus_organization ON campus(organization_id);
CREATE INDEX idx_campus_region ON campus(region_id);
CREATE INDEX idx_program_campus ON program(campus_id);
CREATE INDEX idx_school_year_org ON school_year(organization_id);
CREATE INDEX idx_grade_level_campus_year ON grade_level(campus_id, school_year_id);

-- People
CREATE INDEX idx_user_campus_role_user ON user_campus_role(user_id);
CREATE INDEX idx_user_campus_role_campus ON user_campus_role(campus_id);
CREATE INDEX idx_user_campus_role_composite ON user_campus_role(user_id, campus_id);
CREATE INDEX idx_household_user ON household(user_id);
CREATE INDEX idx_guardian_household ON guardian(household_id);
CREATE INDEX idx_guardian_user ON guardian(user_id);
CREATE INDEX idx_student_household ON student(household_id);
CREATE INDEX idx_guardian_student_guardian ON guardian_student(guardian_id);
CREATE INDEX idx_guardian_student_student ON guardian_student(student_id);

-- Applications
CREATE INDEX idx_enrollment_window_campus ON enrollment_window(campus_id);
CREATE INDEX idx_enrollment_window_campus_year ON enrollment_window(campus_id, school_year_id);
CREATE INDEX idx_enrollment_window_status ON enrollment_window(status);
CREATE INDEX idx_form_template_campus ON form_template(campus_id);
CREATE INDEX idx_application_window ON application(enrollment_window_id);
CREATE INDEX idx_application_student ON application(student_id);
CREATE INDEX idx_application_campus ON application(campus_id);
CREATE INDEX idx_application_status ON application(status);
CREATE INDEX idx_application_campus_status ON application(campus_id, status);
CREATE INDEX idx_application_window_status ON application(enrollment_window_id, status);
CREATE INDEX idx_application_student_campus ON application(student_id, campus_id);
CREATE INDEX idx_application_answer_app ON application_answer(application_id);
CREATE INDEX idx_application_answer_field ON application_answer(application_id, field_key);
CREATE INDEX idx_document_application ON document(application_id);
CREATE INDEX idx_document_student ON document(student_id);
CREATE INDEX idx_document_status ON document(status);
CREATE INDEX idx_status_history_app ON application_status_history(application_id);
CREATE INDEX idx_signature_app ON signature(application_id);
CREATE INDEX idx_verification_app ON verification_item(application_id);

-- GIN index for JSONB queries on application answers
CREATE INDEX idx_application_answer_value ON application_answer USING GIN (value);

-- Lottery
CREATE INDEX idx_lottery_run_window ON lottery_run(enrollment_window_id);
CREATE INDEX idx_lottery_run_campus ON lottery_run(campus_id);
CREATE INDEX idx_lottery_run_status ON lottery_run(status);
CREATE INDEX idx_lottery_entry_run ON lottery_entry(lottery_run_id);
CREATE INDEX idx_lottery_entry_app ON lottery_entry(application_id);
CREATE INDEX idx_lottery_entry_rank ON lottery_entry(lottery_run_id, final_rank);
CREATE INDEX idx_lottery_snapshot_run ON lottery_entry_snapshot(lottery_run_id);

-- Offers & Waitlist
CREATE INDEX idx_offer_application ON offer(application_id);
CREATE INDEX idx_offer_campus ON offer(campus_id);
CREATE INDEX idx_offer_status ON offer(status);
CREATE INDEX idx_offer_expires ON offer(expires_at) WHERE status = 'pending';
CREATE INDEX idx_acceptance_offer ON acceptance(offer_id);
CREATE INDEX idx_acceptance_application ON acceptance(application_id);
CREATE INDEX idx_waitlist_campus_grade ON waitlist(campus_id, grade_level_id);
CREATE INDEX idx_waitlist_position_waitlist ON waitlist_position(waitlist_id);
CREATE INDEX idx_waitlist_position_app ON waitlist_position(application_id);
CREATE INDEX idx_waitlist_position_number ON waitlist_position(waitlist_id, position_number);

-- Capacity & Enrollment
CREATE INDEX idx_capacity_plan_composite ON capacity_plan(campus_id, school_year_id, grade_level_id);
CREATE INDEX idx_enrollment_student ON enrollment(student_id);
CREATE INDEX idx_enrollment_campus ON enrollment(campus_id);
CREATE INDEX idx_enrollment_status ON enrollment(status);
CREATE INDEX idx_enrollment_campus_year ON enrollment(campus_id, school_year_id);

-- Communications
CREATE INDEX idx_comm_log_campus ON communication_log(campus_id);
CREATE INDEX idx_comm_log_recipient ON communication_log(recipient_user_id);
CREATE INDEX idx_comm_log_status ON communication_log(status);
CREATE INDEX idx_notification_user ON notification(user_id);
CREATE INDEX idx_notification_unread ON notification(user_id, is_read) WHERE is_read = false;

-- Misc
CREATE INDEX idx_pathway_student ON pathway_interest(student_id);
CREATE INDEX idx_pathway_campus ON pathway_interest(campus_id);
CREATE INDEX idx_note_entity ON note(entity_type, entity_id);
CREATE INDEX idx_note_campus ON note(campus_id);
CREATE INDEX idx_application_tag_app ON application_tag(application_id);
CREATE INDEX idx_application_tag_tag ON application_tag(tag_id);
CREATE INDEX idx_audit_event_table ON audit_event(table_name);
CREATE INDEX idx_audit_event_record ON audit_event(record_id);
CREATE INDEX idx_audit_event_actor ON audit_event(actor_id);
CREATE INDEX idx_audit_event_campus ON audit_event(campus_id);
CREATE INDEX idx_audit_event_created ON audit_event(created_at);
CREATE INDEX idx_setting_campus_key ON setting(campus_id, key);
