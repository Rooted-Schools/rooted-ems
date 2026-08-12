# Lottery Day

A lottery run moves through three stages: draft, preview, official. Nothing is final and no family is notified until you deliberately finalize.

## 0. Know which rules you are running under

Every lottery runs under a policy your governing board adopted. Open the **Policy** tab in Seats & Lottery to read it: the preferences applied before the draw, the weighted entry tiers, the acceptance deadline, and the waitlist rules, all in plain English. The version and its board adoption date appear at the top.

A run binds to the adopted policy the moment it is created, and carries a frozen copy of it forever. Editing the policy afterward changes nothing about runs already created. If the campus has no adopted policy, you will see "No adopted policy" on the run, and **Finalize as Official is blocked** until a system admin adopts one. That is deliberate: an official lottery is a legal act taken under board-adopted rules.

Only a system admin can adopt a policy, and adopting one requires entering the date of the board action and ticking an affirmation. Never enter a date the board did not actually vote on.

## 1. Create the run

Go to Seats & Lottery, open the Lottery tab, and start a new run: campus, grade level, enrollment window, and total seats available. The dialog shows which policy the run will be governed by before you create it. The run starts in draft status.

## 1a. Rehearse first

Tick **Test rehearsal** when creating a run to hold a full dress rehearsal. A rehearsal runs the complete lottery against the real applicant pool, applies the sibling preference and the weighted entries exactly as the official run will, and produces a full report you can put on a screen for a board observer.

A rehearsal touches nothing a family can see: no application status changes, no offers, no waitlist placements, and no notifications of any kind. Run it as many times as you like. It can never be promoted to official; the official lottery is always a separate, fresh run. Every screen and the report itself are stamped TEST REHEARSAL.

Rehearse before every real lottery. It is the cheapest way to find a wrong seat count, a missing capacity plan, or a duplicate applicant while there is still time to fix it.

## 1b. Clear the preflight panel

The run page shows a **Preflight readiness** panel, re-checked against live data every time you open it. Items marked Blocked stop the lottery from being finalized; items marked Check are warnings you should read but that do not stop you.

The panel checks that an adopted policy exists, that a capacity plan is set and nonzero for the grade, that entries are present and their applications are still in an eligible status, that sibling linkage can actually be resolved, that no duplicate households are outstanding, that email delivery is connected, that text messaging is connected (informational), that the offer-expiry automation is running, and that the fields your weighted tiers depend on are actually collected on the application.

Clear the blockers before lottery day, not during it.

## 2. Check the math with Simulate

While the run is in draft, use **Simulate** to see what-if seat math by priority band. It does not draw, does not apply weighting, and writes nothing, so it is safe to run as often as you like. Simulate answers "how do the seats divide up"; a rehearsal answers "what would actually happen". Use both.

## 3. Draw with Run Preview

When ready to see actual ranked results, click **Run Preview**. This draws a real random order and moves the run to preview status. Nothing has gone to families yet; review the results carefully, including how priority groups landed.

## 4. Re-running preview draws a brand new result

Clicking **Re-run Preview** throws out the current draw and generates a completely new random result. Anyone who looked offered under the old draw can land somewhere different. A confirmation dialog will warn you first. Only re-run for a real reason (a data correction, a seat count change), not to see what else comes up.

## 5. Finalize as Official

Once confident in the preview, click **Finalize as Official**. This locks the run permanently: the random seed and every entry are saved as an unchangeable record, and the action is logged to the Audit Trail. There is no undo. Do not finalize a run you have not reviewed.

## 6. Send Offers

Finalizing does not notify anyone by itself. Click **Send Offers**, and every winning family is notified automatically: in-app, email, and text where opted in. Sending, not finalizing, is what triggers notification.

The response deadline defaults to the acceptance window in your adopted policy, and the dialog says which number that is. You can override it, but the dialog will tell you when you have, because the deadline in a family's email should be the deadline the board set.

Offers are created first and families are notified afterward. If a notification run is interrupted, the run page shows "Notifications: X of Y sent" with a **Resume notifications** button. Resume sends only the families who were not reached; nobody is ever notified twice. If you see that banner, clear it before you leave for the day.

## 7. Waitlist and notify everyone else

Click **Waitlist & Notify Non-Selected** to place everyone not selected onto the waitlist in lottery order and notify them of their position. Do this in the same sitting as sending offers so no family is left wondering where they stand.

## 8. Pull the report carefully

The lottery report hides student names by default, so it is safe to share broadly. A toggle reveals the full roster with names if you need it. Only turn it on when you actually need names, and be thoughtful about who receives the named version.

## Hardest questions

**Can I undo a finalized lottery?** No, by design, so families and your authorizer can trust the result. If something is genuinely wrong with an official run, do not work around it in the app; talk to your system administrator.

**What if I finalize and then realize the seat count was wrong?** Do not quietly fix it by re-running anything; the run is already locked. Document what happened and escalate. A wrong seat count on an official run is a data integrity issue, not a routine fix.

**Do families get anything between "Finalize as Official" and "Send Offers"?** No. That gap is intentional, letting you double check before anyone is contacted. But do not sit in it long: an official run with offers not yet sent is a loose end.

**Can I turn a good rehearsal into the official lottery?** No. A rehearsal can never become official, and the database refuses it even if someone tries to force it. Hold the official lottery as a fresh run. A rehearsal that looked right is evidence your setup is correct, not a result you can keep.

**A weighted tier says the application does not collect its field. What does that mean?** It means your board adopted a preference the application form has no way to capture, so nobody can qualify for it and everyone is drawn at the default weight. It is reported rather than hidden because "nobody qualified" and "we could not tell who qualified" are very different facts. Raise it before lottery day: either the form needs the question, or the policy needs revisiting with counsel.

**Someone claimed a sibling but preflight says it is unverified.** Sibling preference is granted on evidence, not on the box a family ticked: a student sharing a legal guardian with the applicant and actively enrolled at this campus this year. An unverified claim earns nothing until it is verified. Verify it before the draw if it is real; the count is shown so you can work through them.

Only your system administrator can reverse or correct a finalized lottery record; there is no in-app path to do this once a run is official.
