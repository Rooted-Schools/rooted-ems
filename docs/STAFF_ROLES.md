# Staff Roles and Permissions

What each role can actually do in Rooted EMS, read out of the code that enforces it rather than from intent. Verified 2026-08-17.

---

## How access works

**Roles are granted per campus, not globally.** A person holds a role on a specific campus (`user_campus_role`). Being a system admin at Cleveland grants nothing at C.R. Neal. Someone can hold different roles at different campuses.

**Roles are ranked, and each includes everything below it.**

| Level | Role | Shorthand |
|---|---|---|
| 1 | `compliance_auditor` | Reviewer |
| 2 | `enrollment_staff` | Coordinator |
| 3 | `enrollment_manager` | Enrollment lead |
| 4 | `system_admin` | Campus administrator |

**Network access is earned, not assigned.** There is no separate CMO role. Holding system admin on two or more campuses grants the Network view and network-wide reporting. This is why Steven sees it and Tim and Lalah do not.

**No roles means no access.** A staff account with zero campus assignments is refused at sign in. An empty role list is never treated as "sees everything."

**Hiding is not blocking.** The sidebar hides sections a role cannot use, but the guard is enforced on the page and on every action behind it. A hidden page reached by URL still refuses.

---

## What each role can do

### Level 1: Compliance auditor

Despite the name, this is not a read-only role. It can:

- View applications, the pipeline, documents, enrollment, recruitment, communications, lottery results and the lottery report
- Change an application's status, including withdrawing it
- Approve or reject uploaded documents
- Verify or waive registration items, complete the academic audit, confirm a packet complete
- Add notes to an application
- **Extend a seat offer** from the application screen
- Change statuses in bulk from the applications list

It cannot reach Seats and Lottery, Insights (audit trail, equity, reports), Settings, or Team.

### Level 2: Enrollment staff

Everything above, plus:

- Create an application on a family's behalf
- Send messages and campaigns to families
- Work leads, events and RSVPs in Recruitment

### Level 3: Enrollment manager

Everything above, plus:

- **The whole Seats and Lottery section**: create and run a lottery, finalize it as official, send offers, manage the waitlist, adjust seat capacity
- **Insights**: audit trail, equity reporting, compliance exports
- **Settings**: enrollment windows, capacity plans, registration requirements
- Start re-enrollment for returning families
- Fast track enrollment, which seats a student without a lottery
- Manage nurture journeys and trigger lead and event syncs

This is the role that runs enrollment for a campus day to day.

### Level 4: System admin

Everything above, plus:

- **Team**: invite, add, edit and remove staff, and set their roles, on campuses where they are themselves a system admin
- **Adopt a lottery policy**, the act that binds a board decision to every official lottery run at that campus
- Create school years, grade levels and new capacity plans

---

## Two things worth deciding

### 1. The lowest role is not read-only, and its name says otherwise

"Compliance auditor" reads like an observer. In practice it can withdraw an application and extend a seat offer. If this role is ever handed to a board member, an external reviewer or an authorizer contact, that is not what they would expect to be able to do, and nothing in the interface warns them.

Options: rename it to match its powers (something like "Enrollment reviewer"), or narrow it to genuine read plus notes and move the state-changing actions up to enrollment staff. The second is more work and is the safer answer if anyone outside the enrollment team will ever hold it.

### 2. The same action has two different bars

Extending a seat offer requires enrollment manager on the Offers page, and in bulk from the applications list. From the application detail screen it requires only compliance auditor. Same consequence for the family, three different bars depending on the screen.

Recommendation: raise the application-screen offer action to enrollment manager so the requirement matches everywhere.

---

## Suggested assignments

| Person | Suggested role | Why |
|---|---|---|
| School leader running enrollment (Tim, Lalah) | System admin on their campus | They need Team, Settings and policy adoption without waiting on the network |
| Enrollment coordinator | Enrollment manager | Runs the lottery, offers and seats without being able to change staff access |
| Front desk or admin assistant | Enrollment staff | Enters applications and talks to families, cannot run a lottery |
| Board member, external reviewer, authorizer contact | Compliance auditor, **but read finding 1 first** | Today this role can still change records |
| Network leadership | System admin on two or more campuses | This is what grants the Network view |
