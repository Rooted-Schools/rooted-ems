# Rooted Recruitment CRM — Concept and Plan

*Companion module to the Rooted Enrollment Management System (EMS). Working codename: "Rooted Grow." Status: concept only, not built.*

---

## The one-sentence idea

The EMS manages families after they apply. The CRM manages the relationship before they apply, and turns recruitment into a game that families and staff actually want to play, while giving Rooted the first clear line of sight from a recruitment touchpoint all the way to an enrolled student.

---

## Why this belongs next to the EMS, not somewhere else

Right now the EMS is a system of record for people who have already committed enough to fill out an application. That is the narrow end of the funnel. Everything upstream of it (the open house someone attended, the parent a current family told at church, the flyer that got scanned, the tour that never got a follow-up call) lives in spreadsheets, inboxes, and memory. When those threads drop, they drop silently, and no one can say which recruitment efforts actually produced enrolled students.

A CRM closes that gap. It owns the top of the funnel: leads, prospects, events, referrals, and follow-up. The moment a lead applies, the CRM hands off to the EMS and the application carries the lead's origin with it. That single stitch (lead_id stamped on the application) is the most valuable thing in this entire concept, because it lets Rooted answer a question it almost certainly cannot answer today: which campaigns, which events, and which referrers produce not just applications, but enrollments.

Build it as a module in the existing monorepo. It shares the Supabase project, the auth and staff-role system, the row-level security patterns we just hardened, the bilingual EN/ES layer, the component library, the toast and pagination systems, and (importantly) the Resend email integration with per-campus reply-to that we finished this session. A campaign blast, an RSVP confirmation, and a follow-up nudge all reuse `lib/notify.ts` and `lib/email.ts` as they stand. This makes the CRM dramatically cheaper to build than a standalone product and keeps families inside one coherent Rooted experience.

---

## The two audiences and the two game engines

The session description names two groups to energize: families and staff. They need different mechanics.

### Family and community engine: referral and belonging

The core loop is a point-based referral system where rewards escalate as a referred family moves deeper into the funnel. A current family refers a prospective family. The referrer earns a small number of points when the referee RSVPs to an event, more when they submit an application, and the most when they enroll. Escalating the reward down the funnel aligns everyone's incentive with the outcome Rooted actually cares about, and it discourages spraying names that never convert.

On top of the referral loop sits a belonging layer: RSVP and attendance points, ambassador tiers for families who bring others into the community, public recognition and celebration of milestones, and a simple family-facing portal where a referrer can see how the families they invited are doing.

### Staff and recruiter engine: challenges and healthy competition

Recruiters get a leaderboard and time-boxed challenges (for example, "most tour RSVPs booked this month" or "fastest average time-to-first-contact"). Scoring is weighted toward quality, meaning conversions and enrollments count far more than raw activity like calls logged. Cross-campus team challenges create friendly rivalry between C.R. Neal, Cleveland, and Vancouver without pitting individual recruiters against each other in a way that damages morale.

---

## Where equity has to be designed in, not bolted on

Two failure modes would betray Rooted's mission, and both are avoidable.

First, a referral program rewards families who already have social capital. Families with large, connected networks rack up points and prizes; families new to the area or without those networks get nothing, and enrollment starts to look like a popularity contest. The guardrail: rewards are recognition and community-building, never cash or scarce goods that privilege the already-connected, and every referral cycle runs alongside deliberate direct outreach to under-networked families and neighborhoods. The referral engine supplements equitable recruitment. It never replaces it.

Second, consent. A family "referring" another family cannot mean Rooted starts contacting a stranger because someone typed their phone number. The referral flow must capture the prospective family's own opt-in before they enter any outreach sequence. These are prospective minors and their guardians, so the CRM handles real PII and needs the same discipline as the EMS even though leads are not yet students.

---

## Operating model: campus-owned, network-visible

Each campus runs its own recruitment (confirmed by Steven, July 2026). The CRM therefore follows the same campus-scoping the EMS already enforces: every lead, event, campaign, referral, and task belongs to a campus, recruiters see only their campus by default, and leaderboards and challenges score within a campus. RSF gets a network roll-up view for oversight and cross-campus comparison, but the day-to-day operating surface is campus-level. Cross-campus recruiter challenges remain possible as opt-in events between campuses, not a default shared pool.

## Data model (new tables, same Supabase project)

- **lead** — a prospective family or student not yet in the pipeline: contact info, campus of interest, entry grade, source, stage, assigned recruiter, and a lead score.
- **lead_activity** — the timeline: calls, texts, emails, notes, event attendance, stage changes.
- **event** — open houses, info sessions, tours: date, capacity, campus.
- **rsvp** — a lead's registration for an event plus attendance status.
- **campaign** — a named recruitment push with goals, channels, and associated leads.
- **referral** — referrer, referee, consent status, funnel stage reached, points awarded.
- **task** — a follow-up assigned to a recruiter, with due date and linked lead.
- **points_ledger** — every point earned by any actor (family or staff) for a defined action; the single source of truth for all gamification.
- **challenge** — a recruiter competition: rules, window, participants, scoring.

The bridge to the EMS: when a lead applies, the CRM creates or links the EMS `application` and writes `lead_id` onto it, then marks the lead converted. That is the whole handoff, and it is what makes end-to-end attribution possible.

---

## Surfaces to build

**Recruiter workspace (staff):** a lead inbox, a pipeline board, a task and follow-up list, an event manager, a campaign dashboard, and the leaderboard.

**Family and public surfaces:** event RSVP pages, referral landing pages ("you were invited by the Johnson family"), and the ambassador portal. All bilingual from day one, because recruitment is exactly where language access decides whether a family engages.

---

## Recommended sequencing (and a point of view)

The session pitch leads with gamification because that is the exciting part. The build should not. You cannot gamify a process you cannot yet measure, and the foundational value (a lead pipeline wired to enrollment outcomes) pays off even if gamification never ships. So:

- **Phase 0 — Pipeline and handoff.** Lead and activity model, manual lead entry, a basic pipeline, and the convert-to-application stitch with attribution. This alone is worth the project.
- **Phase 1 — Events and RSVP.** Event creation, public RSVP pages, attendance tracking, confirmations through the existing email system.
- **Phase 2 — Campaigns and follow-up.** Campaign objects, the task engine, and bulk outreach.
- **Phase 3 — Gamification v1.** Points ledger, referral tracking with consent, and family referral landing pages.
- **Phase 4 — Gamification v2.** Recruiter challenges, leaderboards, ambassador tiers, and rewards.
- **Phase 5 — Analytics.** Source-to-enrollment attribution, campaign ROI, and full funnel conversion dashboards.

---

## What to measure

Funnel conversion at every stage (lead → RSVP → application → offer → enrollment). Attribution of enrollments by source, campaign, and referrer. Quality-weighted recruiter productivity. Referral conversion rate and cost per enrolled student. And time-to-first-contact on new leads, because speed to a fresh lead is one of the strongest predictors of whether it converts.

---

## Principal risks

Gamification that rewards social capital over need, referral outreach without consent, staff gaming activity metrics if scoring is not weighted toward outcomes, PII handling for prospective families, and scope. On scope: resist the temptation to build the whole vision at once. Phase 0 is the product. Everything after it is the engagement layer that makes the product delightful.
