# Vancouver Dummy-Data Test Run — Click-by-Click Script

**Date:** today
**Testers:** Anders Lindgren and Brook Wilkerson
**Admin on call:** Steven Carney
**Site:** https://enroll.rootedschool.org — this is the live production system, not a staging copy
**Campus:** Rooted School Vancouver (RSV)
**Enrollment window:** "Test Window," school year 2027-28, currently open (opened 2026-08-18, closes 2027-02-01)
**Data:** dummy data only, clearly marked (see Ground Rules)

Every button label below was checked against the actual app source code the same day this script was written. If what you see on screen doesn't match a label here, that's worth a note in Pilot feedback — see the BLOCKER checkbox on each step.

---

## Ground rules — read this before you click anything

**1. Every dummy surname starts with TEST.** Family last name, and student last name if it's entered separately, must start with "TEST" — for example "TEST Rivera" or "TEST Lindgren-Demo." This is the only thing that makes cleanup possible: the system admin will find and remove everything this way with a handful of SELECT statements (see Cleanup, at the end). Do not use a name that doesn't start with TEST anywhere in this test run.

**2. Use real inboxes you control. Never invent an email address.** Both of you already have real inboxes: `anders@schoolops.com` / `anderskarllindgren@gmail.com` and `brook@schoolops.com`. For the family-side steps, use an inbox you actually control. If you want several distinct-looking dummy family emails, use "+" addressing on an inbox you own — for example `anderskarllindgren+test1@gmail.com` still delivers to Anders's real Gmail. A made-up address that nobody owns will bounce, and repeated bounces hurt the school's sender reputation with every family's inbox provider. Do not type in a fake address just because a field is required.

**3. Google sign-in for family Gmail accounts is broken right now.** The OAuth consent screen needs a fix from the app owner before "Continue with Google" will work for family logins. Every family-side login step in this script uses email + a verification code instead. If you see a "Continue with Google" button on the family login screen, ignore it for this test — do not try it and then report it as broken, that's already known.

**4. Before you touch anything, check two switches in Staff → Settings:**

   - **Automation health** (a card near the top of the Settings page). It lists each scheduled automation with a status chip: "Ran `<time>` ago" (fine), "Last ran `<time>` ago — overdue," "Last run failed," or "No runs recorded yet." If anything shows overdue or failed before you've done anything, that's a pre-existing condition, not something you caused — note it in Pilot feedback but don't try to fix it.
   - **Welcome messages** toggle (its own card, above the Settings tabs, labeled "Public inquiry form & daily sheet sync"). This is the pause switch for the automatic welcome email/text sent to a brand-new inquiry. Check its position and write down what you saw before you do Phase 1:
     - **On** (no red warning text showing): a new inquiry should trigger an automatic welcome email/text.
     - **Paused** (red text reads "Paused: new families receive no automatic welcome"): a new inquiry should NOT trigger a welcome message, but should still show up normally in Recruitment.
     Phase 1, step 3 below tells you exactly what to expect based on which position you found.

**5. Do not touch Columbia or Cleveland data.** This matters more than it might sound like: both of your staff accounts (`anders@schoolops.com` and `brook@schoolops.com`) are system admins on **all three campuses** — C.R. Neal Academy (Columbia), Rooted Schools Cleveland, and Rooted School Vancouver — not just Vancouver. Nothing in the app stops you from creating or editing data at the wrong campus. Two places this can go wrong:
   - The **Campus** dropdown in the staff header (top of every staff page, once you're logged in). It will often default to "All Campuses." Before you create or touch anything, set it to **Rooted School Vancouver** explicitly. Don't leave it on "All Campuses" and don't select either other campus.
   - Any staff dialog that asks you to pick a campus (creating a lottery run, for instance) has its own campus selector. Double-check it says Rooted School Vancouver every time, even if the header already says so.
   If you ever land on a screen showing C.R. Neal or Cleveland data, stop, don't submit anything, and switch the Campus dropdown back to Rooted School Vancouver.

---

## Phase 1 — Family front door

**1.1 Submit an inquiry as a TEST family**

WHERE: Go to the public site and find the inquiry form (the "Which school interests you?" form on the enrollment homepage or `/inquire`).
WHAT TO DO: Fill in:
- Your first name: any first name
- Your last name: must start with TEST (e.g. "TEST Rivera")
- Phone: a real number you can check
- Email: optional on this form — leave it blank or use a real inbox you control
- Which school interests you?: select **"Rooted School Vancouver — Vancouver, WA"**
- Entering grade: select **9th grade** (or whatever matches the grade you'll use later — stay consistent with Phase 2)
Click **"Send my info."**
WHAT SHOULD HAPPEN: A confirmation screen appears headed "Thank you — we'll be in touch!" with a button labeled **"Apply Now."** Do not click Apply Now yet — that's Phase 2.
☐ If instead you see something else (an error, a blank screen, no confirmation), note it in Pilot feedback with the word BLOCKER.

**1.2 Verify the lead appears in staff Recruitment**

WHERE: Log in to staff (`/staff-login`) as `anders@schoolops.com` or `brook@schoolops.com`. Set the Campus dropdown to Rooted School Vancouver. Go to **Recruitment** in the left sidebar.
WHAT SHOULD HAPPEN: Your TEST family appears in the table (columns: Family, Student, Campus, Source, Stage, Last contact) with Stage **"New."** Click **"View"** on that row to open the lead detail page and confirm the name, phone, and grade match what you entered.
☐ If instead the lead is missing, shows the wrong campus, or shows the wrong stage, note it in Pilot feedback with the word BLOCKER.

**1.3 Verify the welcome email behavior matches the pause-switch position**

WHERE: Check the real inbox/phone you used in step 1.1 (only relevant if you entered an email or the phone can receive SMS). Also check the lead detail page's activity/journey timeline from step 1.2.
WHAT SHOULD HAPPEN, based on what you found in Ground Rule 4:
- If the Welcome messages toggle was **On**: you should receive (or see logged) an automatic welcome message shortly after submitting the inquiry.
- If the Welcome messages toggle was **Paused**: no automatic welcome message should go out. The lead should still appear normally in Recruitment (it does — you just confirmed that in 1.2) with no welcome sent.
☐ If the behavior doesn't match the switch position you recorded, note it in Pilot feedback with the word BLOCKER.

---

## Phase 2 — Family account and application

**2.1 Create/sign in to the family account**

WHERE: `/login` (or click "Apply Now" from the Phase 1 confirmation screen).
WHAT TO DO: There is no separate "sign up" button — the same flow creates the account the first time. Ignore "Continue with Google" (see Ground Rule 3). Under "or sign in with email," enter the real inbox you're using for this TEST family and click **"Send Verification Code."** Check that inbox, retrieve the code, enter it, and click **"Verify Code."**
WHAT SHOULD HAPPEN: You land on the family dashboard/portal, signed in.
☐ If the code never arrives or verification fails, note it in Pilot feedback with the word BLOCKER.

**2.2 Start a new application for grade 9 in the Test Window**

WHERE: From the family portal, go to **Applications** and click **"Start New Application"** (or "Start Application" if the list is empty).
WHAT TO DO on the "Campus & Grade" step:
- Campus: select **Rooted School Vancouver**
- You should NOT see a separate "Enrollment Window" field — Vancouver only has one open window right now (the Test Window), so it's picked automatically. If you do see an Enrollment Window dropdown, select **Test Window** explicitly and note that in Pilot feedback as unexpected (not a BLOCKER by itself, just flag it).
- Grade Level: select **"9th Grade"**
Click through to the next step.
☐ If Vancouver doesn't appear as a campus option, or grade 9 doesn't appear, note it in Pilot feedback with the word BLOCKER.

**2.3 Fill in the student/guardian step, including the sibling and Vancouver-specific questions**

WHERE: The "Student & Guardian" step of the same application form.
WHAT TO DO: Fill in a TEST student (last name starts with TEST) and guardian info using a real phone/email you control. Look for and answer these three checkbox/question items:
- **"This student has a sibling currently attending or enrolled at this campus."** — check or leave unchecked, your choice, but note which you picked (it affects lottery priority).
- **"Is this student the child of a contracted full-time staff member at this school?"** — answer honestly for this dummy record (typically "no" unless you're deliberately testing the staff-child weighting).
- **"Does this student qualify as economically disadvantaged (for example, eligible for free or reduced-price school meals)?"** — same, pick a value and remember what you picked, you'll want to recognize it later in the lottery preflight/weighting.
☐ If any of these three questions is missing from the Vancouver application form, note it in Pilot feedback with the word BLOCKER.

**2.4 Save as a draft, leave, and reopen it**

WHERE: Same form, steps 1-2 only (there's no Save Draft button on the review step).
WHAT TO DO: Click **"Save Draft."** You should see a "Draft saved!" confirmation, then land back on the Applications list where your application shows a **"Continue Application"** button instead of a finished status. Click away entirely (go to the family dashboard), then come back through Applications → **"Continue Application."**
WHAT SHOULD HAPPEN: Every field you filled in, including the sibling checkbox and the two Vancouver-specific question answers, should still show exactly as you left them.
☐ If any answer or checkbox reverts, clears, or flips when you reopen the draft, note it in Pilot feedback with the word BLOCKER — this is one of the most important things to test carefully.

**2.5 Submit the application**

WHERE: The "Review & Submit" step.
WHAT TO DO: Review the summary, then click **"Submit Application."**
WHAT SHOULD HAPPEN: You're taken to the application detail page, which now shows status **"Submitted."**
☐ If submission fails, hangs, or the status doesn't update, note it in Pilot feedback with the word BLOCKER.

---

## Phase 3 — Staff review

**3.1 Verify the application**

WHERE: Staff → **Applications** (Campus set to Rooted School Vancouver). Find your TEST application, open it.
WHAT TO DO: Click **"Verify"** (this is the actual button text — it's the same action referred to elsewhere as "Mark Verified").
WHAT SHOULD HAPPEN: A toast reads "Status updated to Verified," the status badge changes to **"Verified,"** and a green banner appears: "Application Verified — This application is verified and ready to be assigned to a lottery run or given a direct offer."
☐ If the status doesn't change or no confirmation appears, note it in Pilot feedback with the word BLOCKER.

**3.2 Request info from the family**

WHERE: Same application detail page.
WHAT TO DO: Click **"Request info."** In the dialog titled "Request More Information," type a short message (e.g. "Please upload proof of residency") and click **"Send Request."**
WHAT SHOULD HAPPEN: The application status changes to **"Needs Info."**
☐ If the dialog doesn't open or the status doesn't change, note it in Pilot feedback with the word BLOCKER.

**3.3 Family responds with an attachment**

WHERE: Log back in as the TEST family (or switch browser profile/incognito). Go to the application detail page.
WHAT TO DO: You should see an amber card headed **"What the enrollment team needs from you"** showing your staff message verbatim. Type a short reply in **"Your response"** and attach a small file (any PDF or image) using **"Attach a file (optional)."** Click **"Send Response."**
WHAT SHOULD HAPPEN: The response and attachment go through without error.
☐ If the attachment fails to upload or the response doesn't save, note it in Pilot feedback with the word BLOCKER.

**3.4 Approve the document**

WHERE (as staff): Either the application detail page (a "Needs your attention" section with per-document **"Approve"** / **"Reject"** buttons) or the dedicated queue at Staff → **Documents** ("Document Review Queue").
WHAT TO DO: Find the family's uploaded document and click **"Approve"** (on the Documents queue this opens a confirm dialog — click **"Approve Document"** to confirm).
WHAT SHOULD HAPPEN: The document's status moves out of "Pending Review" and a confirmation appears ("Document verified.").
☐ If approval fails or the document stays pending, note it in Pilot feedback with the word BLOCKER.

---

## Phase 4 — Lottery

**4.1 Create a lottery run for grade 9 in the Test Window**

WHERE: Staff → **Seats & Lottery** → **"New Lottery Run."**
WHAT TO DO in the "Create Lottery Run" dialog:
- Campus: **Rooted School Vancouver** — double-check this, it's a separate selector from the header dropdown
- Grade Level: **"Grade 9"** (this dialog labels grades differently than the family application form does — "Grade 9" here, "9th Grade" there; that's expected, not a bug)
- Enrollment Window: **Test Window**
- Total Seats Available: you can leave the suggested number or enter **35** (Vancouver's actual grade 9 capacity)
- Leave the **"Test rehearsal"** checkbox UNCHECKED for now — you'll do a rehearsal run first in step 4.3, but you create it as its own separate run.
Click **"Create Lottery Run."**
☐ If Vancouver or grade 9 aren't selectable, or the run doesn't get created, note it in Pilot feedback with the word BLOCKER.

**4.2 Read the preflight panel**

WHERE: The lottery run's detail page, card headed **"Preflight readiness."**
WHAT TO DO: Read through the checklist rows (Adopted lottery policy, Capacity plan, Applicants entered, Sibling linkage, Duplicate applicants, Email delivery, Text messaging, Offer expiry automation, Weighted entry data). Each row shows a chip: **Ready**, **Check**, or **Blocked.**
WHAT SHOULD HAPPEN: With only your TEST application (and possibly other real applications) in the pool, most checks should read Ready. "Adopted lottery policy" should read Ready since Vancouver has a board-adopted policy on file.
☐ If a check that should clearly pass shows Blocked, or the panel doesn't load, note it in Pilot feedback with the word BLOCKER.

**4.3 Run a TEST REHEARSAL first**

WHERE: Go back and create a second lottery run exactly like step 4.1, same campus/grade/window, but this time CHECK the **"Test rehearsal"** checkbox before clicking **"Create Test Rehearsal."**
WHAT TO DO: On the new run's detail page, you'll see a **"Test rehearsal"** banner and badge. Click **"Run Rehearsal."**
WHAT SHOULD HAPPEN: The rehearsal draws against the real applicant pool and produces a full report, but the banner explicitly promises no family is affected — no application status changes, no offers, no waitlist placements, no notifications. Confirm this run's detail page shows a **"View rehearsal report"** link where the official run would show a "Finalize as Official" button — there should be no Finalize button available on a rehearsal at all.
☐ If a "Finalize as Official" button appears anywhere on a rehearsal run, or if the rehearsal appears to have sent any notification or changed any application's status, note it in Pilot feedback with the word BLOCKER — this is the single most important guardrail to test today.

**4.4 Run the official lottery**

WHERE: Back on the non-rehearsal run you created in step 4.1.
WHAT TO DO: Click **"Run Preview"** (this executes the draw and shows results without finalizing anything). Review the results.
WHAT SHOULD HAPPEN: The run's status becomes "preview" and you can see who was selected.
☐ If the draw fails or results look obviously wrong (e.g. more selected than the seat count), note it in Pilot feedback with the word BLOCKER.

**4.5 Finalize**

WHERE: Same run.
WHAT TO DO: Click **"Finalize as Official"** (this button is disabled until preflight checks pass — if it's greyed out, go back and check the preflight panel from step 4.2 for a Blocked item). Confirm in the "Finalize Lottery" dialog by clicking **"Finalize as Official"** again.
WHAT SHOULD HAPPEN: The run's status becomes "official." This step does not send anything to families yet.
☐ If finalize is unavailable when it shouldn't be, or if it silently sends offers as a side effect, note it in Pilot feedback with the word BLOCKER.

**4.6 Send offers**

WHERE: Same run, now official.
WHAT TO DO: Click **"Send Offers."** In the "Send Enrollment Offers" dialog, set a Response Deadline and confirm by clicking **"Send `<N>` Offers."**
WHAT SHOULD HAPPEN: The application(s) selected move to status "Offered." Also try the companion action **"Waitlist & notify non-selected"** if there are any non-selected applicants in this run, confirming with **"Waitlist & Notify."**
☐ If offers don't send or non-selected families aren't waitlisted, note it in Pilot feedback with the word BLOCKER.

**4.7 Check the notification ledger**

WHERE: Staff → **Communications**, card **"Message History."** (Do not confuse this with Staff → Communications → "Automated messages" — that page is a static read-only preview of message templates, not a log of what was actually sent. "Message History" on the main Communications page is the real ledger.)
WHAT TO DO: Find the rows corresponding to your TEST family's offer/welcome notifications. Click a row to expand it.
WHAT SHOULD HAPPEN: You see channel, recipient, subject, and a status (Queued, Sent, Delivered, Failed, or Bounced) for each message sent to your TEST family during this run.
☐ If your TEST family's notifications don't appear here, or show Failed/Bounced without explanation, note it in Pilot feedback with the word BLOCKER.

---

## Phase 5 — Offer and registration

**5.1 Family accepts the offer**

WHERE (as the TEST family): **Offers**, open the offer, click **"Accept Offer."** Confirm in the "Accept the Offer?" dialog with **"Yes, Accept Offer."**
WHAT SHOULD HAPPEN: You're routed into Registration.
☐ If accept fails, note it in Pilot feedback with the word BLOCKER.

**5.2 Complete registration items**

WHERE: **Registration**, "Welcome to Registration!"
WHAT TO DO: Work through the checklist. Vancouver's required items include things like Emergency Contact Information, Health History & Medical Information, Student & Family Handbook, Discipline Policy, FERPA Directory Information Consent, WA Certificate of Immunization Status, Proof of Residency, Birth Certificate or Proof of Age, Parent/Guardian Photo ID, and Home Language Survey — some are short forms, some are document uploads, some are acknowledgements you sign. You don't have to complete every optional item, but complete every one marked required.
☐ If a required item is missing, mislabeled, or won't save, note it in Pilot feedback with the word BLOCKER.

**5.3 E-signature, in Spanish**

WHERE: Open the **"Student & Family Handbook"** item (an acknowledgement-type item — it will open a dialog with the policy text, a checkbox, and a signature pad).
WHAT TO DO: First, switch the language toggle in the header from **EN** to **ES**. Confirm the dialog re-renders in Spanish (the checkbox agreement text and signature label should now read in Spanish, e.g. "Firme aquí" for "Sign here"). Check the agreement checkbox, then draw a signature in the pad using your mouse or finger, and submit.
WHAT SHOULD HAPPEN: The signature saves and the item shows complete. Switch back to EN afterward for the rest of the test.
☐ If the Spanish translation is missing or broken on this screen, or the signature doesn't save, note it in Pilot feedback with the word BLOCKER.

**5.4 Staff verifies registration items**

WHERE (as staff): The application detail page → **"Registration Items"** section (reached from Staff → Applications, or via Staff → Enrollment → "Review" on the matching row).
WHAT TO DO: For each submitted item, click **"Verify"** to check it off (or **"Skip"** for an optional item the family didn't complete). Click a row first to see what the family actually submitted before verifying it.
WHAT SHOULD HAPPEN: Verified rows show **"Done"** with a checkmark.
☐ If verify doesn't stick, or you can't see what the family submitted, note it in Pilot feedback with the word BLOCKER.

**5.5 Academic audit, enrollment activates**

WHERE: Same application detail page, section **"Academic Audit & Placement"** (this is NOT the same as the separate "Audit Trail" page in the staff sidebar — that's an unrelated compliance/system log; don't go looking for academic audit there).
WHAT TO DO: Once every required item is verified, click **"Complete Audit & Confirm Enrollment."**
WHAT SHOULD HAPPEN: A confirmation reads "Academic audit complete. Student is now fully enrolled," and the application status becomes **"Enrolled."**
☐ If the button is unavailable when it should be ready, or the status doesn't update, note it in Pilot feedback with the word BLOCKER.

---

## Phase 6 — Edges worth testing deliberately

**6.1 Decline an offer, watch waitlist promotion**

WHERE: Use a second TEST application/offer (create another quick TEST family through Phases 2-4 if you don't already have a spare offered/waitlisted pair — or use your rehearsal-adjacent official run if it produced a waitlist).
WHAT TO DO (as the family): Open the offer, click **"Decline Offer,"** confirm with **"Yes, Decline Offer."**
WHAT SHOULD HAPPEN: The decline is automatic in triggering the next step — the system should automatically pull the next eligible waitlisted family for that same grade and campus and create a new offer for them, with no staff action required. Confirm this happened by checking Staff → **Offers & Waitlist** for the newly-promoted family. Also note staff can manually promote someone from that same page using the **"Promote"** button next to a waitlist entry, if you want to test that path too (it opens a "Promote from Waitlist" dialog, confirm with "Send Offer").
☐ If nobody gets auto-promoted after a decline, note it in Pilot feedback with the word BLOCKER.

**6.2 Withdraw**

WHERE: Either side works — as staff, on the application detail page click **"Withdraw"** (dialog "Withdraw Application," confirm with the same label); as the family, the application detail page has its own **"Withdraw"** button with a matching confirm dialog.
WHAT TO DO: Withdraw a TEST application you no longer need for the rest of the test.
WHAT SHOULD HAPPEN: The dialog warns this is final — there's no undo, the family would have to submit a brand-new application to re-apply. Status becomes "Withdrawn."
☐ If withdraw doesn't warn about being irreversible, or the status doesn't update, note it in Pilot feedback with the word BLOCKER.

**6.3 Wrong-file re-upload**

WHERE: As the family, on a document-upload registration item or application document (e.g. Proof of Residency).
WHAT TO DO: First try uploading a file type the system should reject (a plain text file, or anything that isn't a PDF or image) and confirm you get an error like "File type is not supported. Please upload a PDF or image file." Then, as staff, reject a real document upload with a reason (dialog "Reject Document," requires a typed reason before the button enables). As the family, confirm the rejected document now shows **"Needs Re-upload"** with the reason visible, and a **"Re-upload"** button appears. Click it, confirm the re-upload dialog is pre-filled with the same document type, and upload a correct replacement file.
☐ If the wrong-file-type error doesn't appear, or re-upload doesn't preserve the correct document type, note it in Pilot feedback with the word BLOCKER.

**6.4 Campaign detail page**

WHERE (as staff): Staff → **Recruitment**, "Campaigns" card — click any campaign row (the whole row is a link, there's no separate "View" button here).
WHAT TO DO: Open a campaign's detail page.
WHAT SHOULD HAPPEN: You see the campaign name as the heading, a status badge (Complete/Cancelled/Sending), recipient count tiles, a "What was sent" section with Email view/Plain text toggle, and a "Recipients" table showing per-family delivery status (Not sent yet, Failed to send, Sent, Delivered, Opened, Clicked). There is no open-rate or click-rate percentage anywhere on this page — don't go looking for one.
☐ If the page errors or recipient statuses look wrong, note it in Pilot feedback with the word BLOCKER.

**6.5 Editing a journey step and the welcome message**

These are two different screens — don't confuse them.

WHERE (journey step): Staff → **Recruitment** → **Journeys** ("Nurture journeys"), open a journey, then a step. Fields edit inline, there's no separate "Edit" button — just change the **Subject**, **Body (English)**, **Body (Spanish)**, or optional Button label/URL directly, then click **"Save step."**
WHAT SHOULD HAPPEN: A toast confirms the step saved, noting families who haven't reached this step yet will get the new wording.
☐ If changes don't save, note it in Pilot feedback with the word BLOCKER. **When done testing, undo your edit back to the original wording** — this content is live and goes to real families.

WHERE (welcome message content, different screen): Staff → **Settings** → **"Automated messages"** tab, card **"Inquiry welcome."** Edit **Subject (English)**, **Subject (Spanish)**, **Body (English)**, or **Body (Spanish)**, then click **"Save."** A **"Reset to default"** button is available if you want to undo.
WHAT SHOULD HAPPEN: The card's status badge flips from "Standard" to "Customized," and a confirmation toast appears.
☐ If saving fails, or Reset to default doesn't actually reset it, note it in Pilot feedback with the word BLOCKER. **Use Reset to default when you're done** so Vancouver's real welcome message isn't left altered.

**6.6 Pilot feedback submission**

WHERE: Staff → **Pilot feedback** in the sidebar.
WHAT TO DO: This is also where every BLOCKER note from this whole script actually goes. Pick a **Category** (Bug, Confusing, Idea, or Working well), optionally fill in **"Where were you?"**, and write your note in the **Feedback** box. There is no separate severity or priority field — if something is a blocker, type the word BLOCKER directly into the Feedback text itself, in capital letters, so Steven can find it. Click **"Send feedback."**
WHAT SHOULD HAPPEN: A confirmation reads "Feedback sent — Steven reads everything."
☐ If feedback doesn't send, tell Steven directly (Slack/email) since the in-app feedback tool is what's broken.

---

## Cleanup

Cleanup is a system-admin job. **Testers: do not delete anything yourselves.** When you're done testing, tell Steven you're finished and he'll run the cleanup. This section is for Steven (or whoever has service-role/system_admin access) to find every TEST-prefixed record before deleting.

Run these as SELECTs first, review what comes back, and only then convert to DELETEs (in reverse dependency order — documents/entries/offers before applications, applications before students/leads) once satisfied the list only contains dummy Vancouver test data.

```sql
-- Leads created during Phase 1
select id, first_name, last_name, email, phone, stage, campus_id, created_at
from lead
where last_name ilike 'TEST%';

-- Students created during Phase 2+
select id, household_id, first_name, last_name, created_at
from student
where last_name ilike 'TEST%';

-- Guardians tied to TEST households
select g.id, g.household_id, g.first_name, g.last_name, g.email, g.created_at
from guardian g
where g.last_name ilike 'TEST%'
   or g.household_id in (select household_id from student where last_name ilike 'TEST%');

-- Applications tied to TEST students
select a.id, a.student_id, a.campus_id, a.grade_level_id, a.status, a.created_at
from application a
join student s on s.id = a.student_id
where s.last_name ilike 'TEST%';

-- Documents on TEST applications
select d.id, d.application_id, d.document_type, d.status, d.created_at
from document d
where d.application_id in (
  select a.id from application a
  join student s on s.id = a.student_id
  where s.last_name ilike 'TEST%'
);

-- Lottery entries, offers, acceptances, waitlist positions tied to TEST applications
select 'lottery_entry' as t, le.id, le.application_id from lottery_entry le
  where le.application_id in (select a.id from application a join student s on s.id = a.student_id where s.last_name ilike 'TEST%')
union all
select 'offer', o.id, o.application_id from offer o
  where o.application_id in (select a.id from application a join student s on s.id = a.student_id where s.last_name ilike 'TEST%')
union all
select 'acceptance', ac.id, ac.application_id from acceptance ac
  where ac.application_id in (select a.id from application a join student s on s.id = a.student_id where s.last_name ilike 'TEST%');

-- Registration packets and enrollment rows tied to TEST students
select rp.id, rp.enrollment_id, rp.status
from registration_packet rp
join enrollment e on e.id = rp.enrollment_id
join student s on s.id = e.student_id
where s.last_name ilike 'TEST%';

select id, student_id, status, enrolled_at
from enrollment
where student_id in (select id from student where last_name ilike 'TEST%');

-- Any lottery runs you created specifically for this test (rehearsal + official)
-- confirm by run_number / created_at / executed_by rather than name, since
-- lottery_run has no student-linked name of its own:
select id, campus_id, grade_level_id, status, is_rehearsal, run_number, executed_at, notes
from lottery_run
where campus_id = (select id from campus where short_code = 'RSV')
  and executed_at >= '<the date you ran this test>'
order by created_at desc;

-- Communication log / notification rows tied to TEST leads or applications
select cl.id, cl.recipient, cl.status, cl.sent_at
from communication_log cl
where cl.recipient in (select email from lead where last_name ilike 'TEST%')
   or cl.recipient in (select email from guardian where last_name ilike 'TEST%');
```

**Deletion goes through Steven, not the testers.** If you're a tester and you've read this far wondering whether to clean up your own mess: don't. Flag in Pilot feedback (or Slack) that you're done, and Steven will run the deletes himself after reviewing the SELECT output above, in the correct dependency order, and after confirming nothing in the list touches Columbia or Cleveland.
