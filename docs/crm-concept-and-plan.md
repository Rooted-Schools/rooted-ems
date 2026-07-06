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

## The Perla benchmark (Harmony Public Schools)

Steven's north star for this system is Perla — Harmony Public Schools' family-journey platform, built on Salesforce Education Cloud + Marketing Cloud + Mogli SMS + FormAssembly by Elevation Solutions, serving 76 campuses and ~100,000 applications a year. The philosophy to replicate: enrollment is not a series of transactions but one continuous, personalized family journey, where every interaction makes the next interaction smarter and families never feel like they're starting over. (Full analysis: `CR-Neal-Enrollment-Ecosystem-Component-Blueprint.md` and the "C.R. Neal Family Journey System" five-part concept from the July 2026 planning session.)

The Harmony evidence that should drive our build order:

- **Speed-to-lead is the single highest-leverage mechanic.** Auto-text within minutes of an inquiry, then a phone-call task for a named recruiter, then a re-text if the call misses. Harmony saw a ~40% lift in 7-day conversion, and leads that got a human call converted 59% higher. This is the "Response Engine."
- **Referrals were Harmony's best channel** — referred families converted at ~55%. This upgrades our referral engine from "engagement feature" to "primary growth channel."
- **Event machinery matters at volume** — RSVP tracking, QR check-in, and different follow-up branches for attended vs. no-show (6,000+ RSVPs tracked).
- **Campaign seasons work** — Harmony's "Apply" festival season took first-month applications from 11,000 to 24,000.
- **Dynamic family profiles power personalization** — pathway interest, transportation needs, language, channel preference, barriers — feeding interest-tagged content journeys (a healthcare-pathway family gets Prisma Health partnership stories; a tech-pathway family gets different content). The tagged content library is the content-management core of the system.

**Build-vs-buy, resolved by events.** The earlier C.R. Neal blueprint weighed three stacks (Perla-faithful Salesforce, SchoolMint, or lean HubSpot + PowerSchool Enrollment + ParentSquare) because no in-house system existed. That premise has changed: the Rooted EMS is now live in production with an auditable lottery, bilingual family portal, SMS channel, and offer-to-registration pipeline — it already covers everything the blueprint assigned to PowerSchool Enrollment. The CRM therefore gets built on the EMS spine, and the "invisible handoff" the Perla vision calls for becomes trivial: it's the same database. The remaining external handoffs (each campus's SIS, ParentSquare) live at the enrolled end of the journey and stay on the roadmap as integrations, not replacements.

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

- **lead** — a prospective family or student not yet in the pipeline: contact info, campus of interest, entry grade, source, stage, assigned recruiter, and a lead score. Per the Perla model, this is a **dynamic family profile that opens at first inquiry and never closes**: it accrues pathway interest (healthcare, advanced manufacturing, tech), transportation needs, preferred language and channel, questions asked, and any enrollment barrier flagged — the "we know you" layer every other component personalizes from.
- **lead_activity** — the timeline: calls, texts, emails, notes, event attendance, stage changes.
- **event** — open houses, info sessions, tours: date, capacity, campus.
- **rsvp** — a lead's registration for an event plus attendance status.
- **campaign** — a named recruitment push with goals, channels, and associated leads.
- **referral** — referrer, referee, consent status, funnel stage reached, points awarded.
- **task** — a follow-up assigned to a recruiter, with due date and linked lead.
- **points_ledger** — every point earned by any actor (family or staff) for a defined action; the single source of truth for all gamification.
- **challenge** — a recruiter competition: rules, window, participants, scoring.
- **content** — the pathway-tagged content library: stories, FAQs, and proof points tagged by pathway interest, grade band, campus, and common concern, so the same nurture journey sends a healthcare-pathway family different content than a tech-pathway family. This is the content-management / marketing core of the system.

The bridge to the EMS: when a lead applies, the CRM creates or links the EMS `application` and writes `lead_id` onto it, then marks the lead converted. That is the whole handoff, and it is what makes end-to-end attribution possible.

---

## Surfaces to build

**Recruiter workspace (staff):** a lead inbox, a pipeline board, a task and follow-up list, an event manager, a campaign dashboard, and the leaderboard.

**Family and public surfaces:** event RSVP pages, referral landing pages ("you were invited by the Johnson family"), and the ambassador portal. All bilingual from day one, because recruitment is exactly where language access decides whether a family engages.

---

## Recommended sequencing (and a point of view)

The session pitch leads with gamification because that is the exciting part. The build should not. You cannot gamify a process you cannot yet measure, and the foundational value (a lead pipeline wired to enrollment outcomes) pays off even if gamification never ships. So:

- **Phase 0 — Pipeline and handoff.** Lead and activity model, public inquiry form with source tagging and an interest question, manual lead entry, a basic pipeline, and the convert-to-application stitch with attribution. This alone is worth the project.
- **Phase 1 — Response engine (speed-to-lead).** Harmony's highest-leverage piece, promoted ahead of events on their evidence: inquiry triggers a personalized text/email within minutes, routes a call task to the campus recruiter, re-texts if the call misses, and exits when a human conversation happens or an application lands. Includes the gone-quiet re-engagement trigger. Reuses the EMS's notify/SMS plumbing directly.
- **Phase 2 — Events and RSVP.** Event creation, public RSVP pages, QR check-in, attendance tracking, and different follow-up branches for attended vs. registered-but-absent families.
- **Phase 3 — Campaigns, nurture journeys, and the content library.** Campaign objects, the pathway-tagged content library, Push-to-Apply and Keep-the-Seat journeys, bulk outreach, and campaign seasons (Harmony's "Apply" festival model).
- **Phase 4 — Gamification, referrals first.** The referral engine leads (Harmony's best channel at ~55% conversion): unique family codes, consent-gated referee contact, escalating funnel rewards, referral landing pages. Then points ledger, recruiter challenges, leaderboards, ambassador tiers.
- **Phase 5 — Analytics and handoffs.** Source-to-enrollment attribution, campaign ROI, full funnel dashboards (leads by source, speed to first touch, 7-day conversion, referral share), and post-enrollment integrations per campus (SIS, ParentSquare) so the journey never visibly breaks.

---

## What to measure

Funnel conversion at every stage (lead → RSVP → application → offer → enrollment). Attribution of enrollments by source, campaign, and referrer. Quality-weighted recruiter productivity. Referral conversion rate and cost per enrolled student. And time-to-first-contact on new leads, because speed to a fresh lead is one of the strongest predictors of whether it converts.

---

## Principal risks

Gamification that rewards social capital over need, referral outreach without consent, staff gaming activity metrics if scoring is not weighted toward outcomes, PII handling for prospective families, and scope. On scope: resist the temptation to build the whole vision at once. Phase 0 is the product. Everything after it is the engagement layer that makes the product delightful.
