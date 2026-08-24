-- A lead is a family (keyed by email). A family can have more than one
-- prospective student, one per grade in the source tracker. lead_student holds
-- those students so the app can count and follow up at the student level while
-- still messaging once per family. Applied to production via the Supabase MCP;
-- recorded here for repo fidelity.
create table lead_student (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references lead(id) on delete cascade,
  grade text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, grade)
);

create index idx_lead_student_lead on lead_student(lead_id);
create index idx_lead_student_grade on lead_student(grade);

alter table lead_student enable row level security;

-- Staff see and manage a student exactly when they can access its family's
-- campus, mirroring the lead table's own RLS. Service role (the sync) bypasses.
create policy lead_student_staff on lead_student for all to authenticated
  using (exists (select 1 from lead l where l.id = lead_student.lead_id and user_has_campus_access(l.campus_id)))
  with check (exists (select 1 from lead l where l.id = lead_student.lead_id and user_has_campus_access(l.campus_id)));

create trigger trg_lead_student_updated_at before update on lead_student
  for each row execute function fn_set_updated_at();
