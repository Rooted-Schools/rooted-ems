# Rooted EMS Runbooks

These are the operating guides for Rooted EMS (enroll.rootedschool.org), written for campus enrollment staff and managers rather than developers. Each runbook covers one piece of the job: what the system does on its own, what you need to do by hand, and what to do when something looks wrong. Read the one that matches what you are about to do, and keep this page as your index. Every runbook ends with the hardest real questions about that topic, answered honestly, and notes what only your system administrator can do.

**Signing in.** The staff console is at **https://enroll.rootedschool.org/staff-login**. Bookmark it. There is deliberately no staff sign-in link on the family-facing pages, so that families are not offered a door that is not theirs. Sign in with your school email and password, or with the Google button if your school account uses Google.

Staff access is granted by an administrator, never self-served. If you see a message that your account is not set up as a staff account, or that it is not assigned to a campus, that is expected until an administrator adds you; contact them rather than trying again.

If you work more than one campus, the "Campus:" selector in the header controls which campus you are looking at everywhere in the app. It remembers your last choice as you move between pages, and it tints the whole screen in that campus's color (green for Vancouver, amber for C.R. Neal, blue for Cleveland), so a glance at the color confirms which campus you are in. Staff with access to only one campus never see this selector; the system shows their campus automatically.

| Runbook | What it covers |
|---|---|
| [daily-rhythm.md](daily-rhythm.md) | The morning walkthrough of the Today page, exception queues, and notifications that keeps a campus from falling behind. |
| [lottery-day.md](lottery-day.md) | Running a lottery from creating the run through finalizing it as official and sending offers. |
| [offer-season.md](offer-season.md) | Managing offers, deadlines, waitlist promotion, and what families are and are not told automatically. |
| [new-school-year-handoff.md](new-school-year-handoff.md) | What staff need to prepare and hand to the system administrator to open a new enrollment cycle. |
| [when-something-breaks.md](when-something-breaks.md) | First checks when automation looks stuck, families report they heard nothing, or someone is locked out, plus who to call. |
| [wrong-message-sent.md](wrong-message-sent.md) | What to do when an offer, document request, or campaign goes to the wrong family, list, or with the wrong content, including what counts as a privacy incident. |
| [email-outage.md](email-outage.md) | How to tell email is actually down, what to do about ticking offer deadlines while it's out, and what not to do once it's back. |
| [auth-and-email-setup.md](auth-and-email-setup.md) | The Supabase and Google dashboard settings behind family and staff sign-in: custom SMTP, the verification code email, Google sign-in, and the privacy policy. |
| [lead-tracker-sync.md](lead-tracker-sync.md) | How C.R. Neal leads flow from the source-of-truth tracker sheet into the app: the weekly sync, the on-demand "Sync leads now" button, the one-record-per-family rule, and how to read the result. |
| [funnel-1-inquiry-recruitment.md](funnel-1-inquiry-recruitment.md) | The inquiry and recruitment stage: what happens automatically, what staff do, and how a family moves forward. |
| [funnel-2-application-review.md](funnel-2-application-review.md) | The application review stage: what happens automatically, what staff do, and how a family moves forward. |
| [funnel-3-lottery.md](funnel-3-lottery.md) | The lottery stage: what happens automatically, what staff do, and how a family moves forward. |
| [funnel-4-offer-waitlist.md](funnel-4-offer-waitlist.md) | The offer and waitlist stage: what happens automatically, what staff do, and how a family moves forward. |
| [funnel-5-registration.md](funnel-5-registration.md) | The registration stage: what happens automatically, what staff do, and how a family moves forward. |
| [funnel-6-enrolled-retention.md](funnel-6-enrolled-retention.md) | The enrolled and retention stage: what happens automatically, what staff do, and how a family moves forward. |
