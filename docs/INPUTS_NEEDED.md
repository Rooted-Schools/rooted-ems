# Rooted EMS: Inputs Needed From Steven

Fill in the blanks and hand this back. Everything here is something I cannot answer myself, either because the information lives outside the system or because it is a decision that is yours to make.

Prepared 2026-08-13, after the full red team. Nothing below is blocking the app today. The deadlines are real, though: most of it comes due when the Columbia and Cleveland windows open on **26 October 2026**.

---

## A. Before families see the site

### A1. Campus phone numbers

All three campus phone numbers in the database were fictional 555 numbers from seed data, displayed on the campus landing pages where families would have dialed them. I cleared them, so the phone line is now simply absent rather than wrong. The pages hide it cleanly.

| Campus | Old (fake) value I removed | Real number |
|---|---|---|
| Rooted School Vancouver | (360) 555-0100 | |
| C.R. Neal Academy | (803) 555-0200 | |
| Rooted Schools Cleveland | (216) 555-0300 | |

If a campus genuinely has no public number yet, write "none yet" and I will leave it hidden.

### A2. Campus email addresses

These are in the database and shown to families. You confirmed the Cleveland one previously; the other two I have never verified.

| Campus | Address on file | Correct? (yes / replace with) |
|---|---|---|
| Rooted School Vancouver | info@rootedschoolvancouver.org | |
| C.R. Neal Academy | info@rootedschoolcola.org | |
| Rooted Schools Cleveland | info@rootedschoolcle.org | |

---

## B. Before any family signs anything

### B1. Spanish legal text review

**This is the highest-priority item on the list.**

Nine legal documents that families read and electronically sign (FERPA rights, discipline, anti-bullying, dress code, technology use, media release, internet safety, field trips, handbook acknowledgment) existed in English only, with no translation path in the code at all. I added Spanish for all 27 campus variants, clause for clause, preserving statute citations and campus details.

I am not a certified translator and this has had no legal review. A family signing the Spanish version is agreeing to something no qualified human has read.

- Who will review it? ________________________________
- By when? ________________________________
- Until then, should Spanish-speaking families be shown the English text with a note, or the Spanish as-is? ________________________________

### B2. FRL question and counsel

Vancouver's board adopted a 3:1 preference for economically disadvantaged applicants, so the application now asks a yes/no self-attestation. It never asks for income amounts or documents, and it appears only for campuses whose board adopted a policy declaring that tier, so Columbia and Cleveland do not show it.

This intersects your deliberate posture of keeping income data out of lottery-adjacent tables.

- Has counsel signed off on asking this on the application? (yes / no / not yet) ________________________________
- If not yet, should I hide the question until they do? ________________________________

---

## C. Before the lottery can run

### C1. Board adoption of lottery policies

Vancouver's policy is adopted and governs its lottery. Columbia and Cleveland hold **drafts**, and the system correctly refuses to run an official lottery without an adopted policy. This is a hard gate, not a warning.

| Campus | Board meeting date | Adopted? | Any changes from the RSV policy? |
|---|---|---|---|
| C.R. Neal Academy | | | |
| Rooted Schools Cleveland | | | |

If either board intends to differ from Vancouver on preferences, weights, or deadlines, note it here and I will encode it before adoption rather than after.

### C2. Grade cohorts

The campus pages now say "Now enrolling entering grades 6 and 9" for Columbia and Cleveland, built from real grade rows rather than the static 6-12 range.

- Is grades 6 and 9 correct for the 2027-28 cycle at both? ________________________________

---

## D. Operational decisions

### D1. Backup verification

`docs/runbook-backup-restore.md` documents the restore procedure, but its own one-time verification checklist has never been checked off. It is therefore not confirmed from anything I can see that daily backups are actually running. This is the single biggest unknown in your disaster recovery posture and takes about five minutes in the Supabase dashboard.

- Daily backups listed and running? (yes / no) ________________________________
- Retention window shown: ________________________________
- Turn on point-in-time recovery? (yes / no / cost first) ________________________________

### D2. Data processing agreements

Three vendors handle student and guardian personal information. I found no documentation either way, and the family consent text does not disclose them.

| Vendor | What it handles | DPA in place? |
|---|---|---|
| Resend | All family email, including inbound replies | |
| Twilio | Text messages (built, not yet active) | |
| Sentry | Error reports (configured to exclude personal data) | |

- Should the family consent text name these processors? ________________________________

### D3. Retention schedule

Never-converted leads purge automatically after 24 months. Once a lead becomes an application there is **no deletion path at all**, and no retention policy exists. A family who withdraws, is declined, or later asks to be removed cannot be.

- How long should records be kept for a family who never enrolled? ________________________________
- For a student who enrolled and later left? ________________________________
- Should I build a staff-facing deletion request flow, or handle it case by case for now? ________________________________

### D4. The paused nurture journey

The Push to Apply journey is paused with 20 active enrollments, 14 of which have steps already past due. When it resumes, those 14 families get a burst of catch-up messages at once.

- Resume date: ________________________________
- Reset the overdue steps so nobody gets a burst, or let them send? ________________________________

### D5. Twilio

Every text message path is built and dormant because the credentials are not configured. Nothing breaks; the code degrades cleanly to email and in-app only.

- Activate for the pilot? (yes / no / later) ________________________________
- If yes, you add the credentials in Vercel yourself. I never handle them.

---

## E. Loose ends

### E1. The inaccessible Drive PDF

When you sent Vancouver's enrollment policy you included a second link I could not open. I built from the document I could read.

- What was it, and does it change anything? ________________________________

### E2. Anything I got wrong

If anything I shipped contradicts how you actually work, say so here and I will change it rather than defend it.

________________________________________________________________

________________________________________________________________

---

## For reference: what I already changed in production

So nothing here surprises you later.

- Cleared the three fake campus phone numbers (values recorded in A1 above).
- Applied migrations 00048, 00049 and 00050: per-campus document access, family write protections, year-scoped seat counters, email event scoping, and the audit metadata column.
- Deleted 17 orphaned files from the documents bucket: 13 placeholder test documents for a fictional student and 4 personal photos from a deleted account. None had a matching record.
- Removed the staff sign-in links from all family-facing pages. Staff go to enroll.rootedschool.org/staff-login directly.
- Created and destroyed a temporary database branch to verify audit attribution. Cost about two cents.
