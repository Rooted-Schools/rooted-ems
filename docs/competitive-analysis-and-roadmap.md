# Rooted EMS — Competitive Analysis and Standout Roadmap

*Market research conducted July 2026 via parallel web research (vendor sites, G2/Capterra/TrustRadius review themes, unified-enrollment press coverage, equity and administrative-burden literature). Companion to `crm-concept-and-plan.md`.*

---

## Part 1 — The market

### The two leaders

**SchoolMint** ("Enroll 3.0," 3,000+ schools; KIPP, IDEA, YES Prep, Achievement First, Charter Schools USA) is the charter incumbent. Its moat is completeness: weighted lotteries with Dynamic Sibling Priority, open-seat tracking, text + email + voice messaging, a parent mobile app, and a recruitment layer (Engage marketing services, Connect CRM, paid ads) no one else bundles. Its soft underbelly, straight from reviews: cost ("the biggest downside"), support that regressed to "one rung better than completely AI," months-long waits for account-manager training, weak reporting, no self-serve data imports, and a parent login flow so bad families must call the school to reset passwords.

**Avela** (founded by MIT economists Parag Pathak and Nobel laureate Joshua Angrist; 18 states, 1,000+ charters; Boston, Newark, New Orleans unified enrollment) is the modern challenger. Its moat is the matching algorithm (strategy-proof Deferred Acceptance with diversity priorities and pre-run "what-if" simulation) plus a genuinely modern family UX: passwordless login by email or phone, 100+ languages, autosave, pre-filled registration that auto-starts when an offer is accepted. Its weaknesses: no recruitment/CRM layer at all, and almost no independent review footprint — a young company with a thin track record.

### The rest of the field

**PowerSchool Enrollment** wins only on native PowerSchool SIS sync; reviewers report hundred-hour implementations, duplicate-record bugs, and form-field caps tied to pricing tier. It has no lottery. **Scribbles/Parchment K12 Enroll** has the best document backbone and automated missing-document follow-up, plus a strong bulk lottery, but is mid-acquisition churn inside Instructure. **Finalsite Enrollment** is a full admissions CRM with billing, aimed at private schools; reporting is its recurring complaint. **Lotterease** is a narrow, dated (Perl CGI) lottery tool whose entire pitch is audit depth and 24/7 parent-visible waitlist position — and schools love it for exactly that. **TADS** is tuition/financial-aid software with fee-stacking complaints.

### The market's confession

No product combines modern family UX + native SMS + real multilingual support + a compliant, explainable lottery + clean data handoff in one system. Every incumbent is punished in reviews for one or more of: implementation pain, support collapse, rigid reporting, login friction, and price. That is the standard the Rooted EMS gets to beat.

---

## Part 2 — What the UX research says wins

Five findings from family pain-point and equity research, each with a direct product implication:

1. **Lottery and waitlist opacity is the #1 emotional pain point.** New Orleans' OneApp generated seasonal social-media anger even though research showed the algorithm worked as intended — the anger came from scarcity plus opacity. Systems that explain *why* an outcome happened and *what happens next* absorb less blame. → Explain the lottery in plain language; show families their live waitlist position.
2. **Smartphone dependence is the design constraint.** 28% of adults in sub-$30K households have a smartphone but no home broadband. Desktop-assuming flows structurally exclude the exact families Rooted exists to serve. → Every family flow must be phone-complete, including document capture by camera.
3. **Administrative burden research (FAFSA, SNAP/GetCalFresh):** every extra field, document, or step cuts completion, steepest for the lowest-income applicants. GetCalFresh cut a 45-minute application to under 10 by going mobile-first with minimal typing and phone-camera uploads. → Keep the application short; defer documents to post-offer registration wherever compliance allows.
4. **SMS beats email ~98% to ~20% on open rates.** Healthcare and college-melt research (Castleman & Page: automated personalized texting at ~$7/student significantly raised follow-through) proves text nudges move outcomes. → SMS is not a nice-to-have; it is the primary channel for deadline-critical moments.
5. **Staff pain is exception-hunting:** registrars drown in packet-by-packet verification, duplicate records, and re-keying into the SIS. The excellence bar is exception-based queues ("12 docs need review," "8 families stalled 5+ days"), household-level records, and verify-don't-re-enter re-enrollment.

---

## Part 3 — Where the Rooted EMS already stands

Honest inventory against the market, post-hardening (July 2026):

**Already at or above market standard:** passwordless OTP login (Avela's headline differentiator — SchoolMint parents literally phone the school for password resets); bilingual EN/ES throughout the family flow; auto-save drafts with resume; per-child journey timeline; per-campus reply-to email; atomic offer expiry with automatic waitlist promotion; offer-deadline reminder cron; staff-submitted applications on behalf of families (both leaders tout this); bulk actions; audit page; **an equity dashboard, which no commercial product ships**; seeded deterministic lottery with sibling priority and a reproducible audit trail; campus-scoped security (RLS) that most incumbents approximate with application code; zero per-student licensing cost.

**Confirmed gaps (verified in code, not assumed):**
- No SMS anywhere — email and in-app only.
- Waitlist position exists in the DB and staff view, but **families cannot see their own number**.
- Lottery has two priority tiers (sibling / non-sibling) — no configurable weights (e.g., staff children, geographic zone, Title I), no pre-run simulation.
- Registration does not pre-fill from the application — families re-enter known data.
- No automated missing-document follow-up (Scribbles' signature feature).
- No lottery explainer for families — results arrive without the "why" or "what's next."
- Staff dashboard is surface-organized (17 routes), not exception-organized.
- No SIS integration beyond CSV export.
- No tour/event scheduling (planned in the CRM concept, campus-scoped).
- No post-enrollment melt prevention (summer melt runs 10–20%, up to 40% for low-income students).

---

## Part 4 — The roadmap

Ordered by leverage: what most changes family outcomes per unit of effort. Three tiers.

### Tier 1 — Close the table-stakes gaps (do these first)

**1.1 Family-visible waitlist position.** The data already exists (`waitlist_position.position_number`). Surface it on the family dashboard and offer pages: "Maya is #4 on the waitlist at Rooted School Vancouver," with a notification (email now, SMS once 1.2 ships) every time the position improves. Lotterease built an entire company on this one feature. *Effort: small. Impact: the #1 opacity complaint, answered.*

**1.2 SMS via Twilio (or similar).** One-way first: application received, offer made, offer expiring in 48h, document missing, registration complete. Reuse the notify.ts fan-out pattern; store phone + SMS consent on the guardian profile; per-campus sender or shared shortcode with campus name in body. Spanish templates from day one. *Effort: medium. Impact: the single highest-leverage channel change; deadline-critical messages currently ride a ~20%-open-rate channel.*

**1.3 Registration pre-fill ("verify, don't re-enter").** On offer acceptance, seed the registration record from application data; family confirms or corrects instead of retyping. Avela markets exactly this. *Effort: small-medium. Impact: directly cuts the compliance-cost burden that research says drives abandonment.*

**1.4 Missing-document auto-nudge.** A cron (pattern already exists for offer expiry) that finds registrations stalled on missing documents for N days and sends a bilingual nudge with a one-tap upload link. Scribbles' most-praised feature, and trivially achievable on the current stack. *Effort: small.*

**1.5 Configurable lottery priority tiers + pre-run simulation.** Generalize `priority_tier` from the hardcoded sibling/non-sibling pair into campus-configurable ordered tiers (sibling, children of staff, geographic preference, etc. — whatever each authorizer permits), and add a "simulate" mode that runs the seeded lottery against current applicants without writing results, so staff can sanity-check seat math before the real run. Avela charges for this; the deterministic-seed architecture already built makes simulation nearly free. *Effort: medium.*

### Tier 2 — The standout layer (what makes Rooted EMS *better* than the market)

**2.1 The lottery, explained.** A plain-language, bilingual "How our lottery works" page plus per-family outcome explanations: what tier you were in, what number you drew, why you landed where you did, what happens next and by when. No commercial vendor does this well, the research says opacity — not outcomes — drives the anger, and it costs almost nothing to build. This is the most Rooted-shaped feature on the list: transparency as equity.

**2.2 Enrollment-to-first-day melt prevention.** After registration completes, the family's journey doesn't end — a scheduled bilingual nudge sequence (SMS + email) carries them to the first day: "school starts in 3 weeks — here's your supply list," "orientation is Tuesday," "reply if your plans changed." Castleman & Page's research pegs melt at 10–20% (40% low-income) and shows ~$7/student texting moves it. No EMS on the market owns this window. For a school network whose funding follows enrolled-and-attending students, this feature pays for the whole system.

**2.3 Exception-based staff home.** Reframe the staff dashboard from "17 places to look" into one work queue: documents awaiting review, families stalled 5+ days, offers expiring within 48h, waitlist seats to release, duplicate-suspect records. Every item deep-links to the action. The 17 routes stay; the dashboard becomes the registrar's morning triage. *Also consider consolidating the three staff communication surfaces (inbox, messages, communications) into one — three entry points for one job is incumbents' mistake, not ours.*

**2.4 Household model.** Second-child applications inherit guardian/household data; staff get sibling-linkage visibility and duplicate-household detection. Cuts family re-entry burden and the staff-side duplicate problem that plagues PowerSchool.

**2.5 Camera-first document capture.** On phones, the document upload opens the camera directly with framing guidance ("lay the document flat"), client-side compression, and multi-page capture. GetCalFresh-proven pattern for the smartphone-only families in Part 2.

### Tier 3 — Later, when scale justifies it

**3.1 SIS sync.** Nightly or on-enrollment push to each campus's SIS (API where available, structured CSV where not). Kills the re-keying complaint. Requires knowing each campus's SIS first.
**3.2 OCR document pre-verification.** Phone photo → extraction → type/expiry/address checks → auto-approve or route to human review. Vendors report ~90% verification-time cuts. Human-in-the-loop always; FERPA review before any third-party OCR vendor touches documents.
**3.3 Bilingual family chatbot** for FAQ deflection (hours, deadlines, "what does waitlisted mean") — grounded strictly on Rooted's own content.
**3.4 Tour/event scheduling** — already scoped in the CRM concept (campus-owned, per Steven).
**3.5 Additional languages** beyond EN/ES, driven by actual campus demographics (e.g., Vancouver's language mix) rather than a vanity "100+ languages" claim.

### Remove / resist

- **Don't build a parent mobile app.** SchoolMint's app is table stakes for them because their web UX is weak; a fast, phone-complete web app with SMS deep links is better and half the maintenance.
- **Don't chase Deferred Acceptance matching.** That algorithm matters for *unified multi-district* enrollment (ranking many schools). Rooted families apply to a campus; a transparent seeded lottery with clear tiers is the right tool. Adopt Avela's *transparency*, not its algorithm.
- **Don't add billing/tuition.** Charter = free. TADS-style fee-stacking is the anti-pattern.
- **Consolidate, don't multiply, communication surfaces** (see 2.3).

---

## Part 4b — Blueprint reconciliation (July 2026)

Steven's C.R. Neal Enrollment Ecosystem blueprint (Perla-derived, see `crm-concept-and-plan.md` for the benchmark detail) was compared against this roadmap. Findings: the blueprint's back half (application → first day) is already live in the EMS and exceeds the blueprint in three places (auditable in-house lottery with simulation vs. outsourcing to PowerSchool; waitlist transparency; registration pre-fill + nudges). The blueprint's front half (lead capture → application) maps to the CRM phases. Its stack question (Salesforce vs. SchoolMint vs. HubSpot) is retired: the EMS spine is Option D and satisfies the network-level requirement. Adopted from the blueprint into the CRM concept: stage-timed FAQ sequences, QR-code source generation for print materials, Harmony's benchmark metrics (7-day conversion, speed to first touch, referral share), and zip/home-language funnel disaggregation on the equity dashboard.

**CRM Phase 0 + 1 shipped July 2026** on that basis: lead + activity schema (campus-scoped RLS), public bilingual inquiry form at `/inquire` with pathway-interest and source capture, response engine (instant bilingual welcome email/SMS, staff routing notification, next-day follow-up date), gone-quiet re-engagement cron (one automated touch, then it's a human's job), staff Recruitment surface (follow-up queue, stage pipeline, lead detail with journey timeline, call/note logging with one-tap follow-up scheduling), and the automatic lead→application attribution stitch keyed on guardian email + campus.

## Part 5 — The positioning sentence

Every incumbent makes schools choose: SchoolMint's breadth with collapsing support and painful logins, Avela's elegant UX with no recruitment layer and no track record, or point tools that solve one step. The Rooted EMS's play is the combination none of them ships: **a phone-complete, bilingual, SMS-first family experience with a transparent, explainable lottery and an equity lens built in — at zero per-student cost, with the recruitment CRM (campus-owned) growing on the same spine.**

The order of operations: Tier 1 makes Rooted EMS competitive with anything on the market. Tier 2 — especially the explained lottery and melt prevention — makes it something the market doesn't have.
