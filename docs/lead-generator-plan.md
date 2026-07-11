# Rooted Grow: Lead Generation Engine — Plan and Outline

*Status: PLAN ONLY — nothing in this document is built. Companion to `crm-concept-and-plan.md` and `competitive-analysis-and-roadmap.md`. Prepared July 2026.*

---

## 1. The verdict up front

The requested component makes sense — but not as a new system. Three of its six core features are already live in the Recruitment CRM shipped July 2026, one is more than half built, and two are genuinely new. Building this as a separate "lead generator" would duplicate the lead table, split attribution, and break the single-family-record principle the whole system is built on. Building it as the **top-of-funnel layer of the existing EMS** costs roughly a third of a standalone build and inherits security, bilingual support, and attribution for free.

| Requested feature | Status today | What's actually left |
|---|---|---|
| Built-in lead capture & management | **✅ Live** — inquiry form, pipeline, stages, follow-up queue, timeline, dedupe, sheet sync, event RSVPs, referral links | Nothing structural |
| Lead source tracking | **✅ Live** — source + source_detail on every lead; funnel dashboard shows per-channel application conversion | UTM capture + QR generation (small) |
| Customizable dashboards to manage leads | **✅ Live** — recruitment pipeline + funnel analytics, campus filter, CSV export | Saved views / per-user widgets (optional, low value at current team size) |
| Automated drip emails | **🟡 ~60%** — welcome touch, re-engagement touch, batch campaigns with daily pacing and 4 branded templates | True multi-step **journeys** (Day 0/3/7/14 sequences with behavior-based exits) |
| Custom landing page builder per school | **❌ New** — the flagship of this ask | Full build |
| Multiple admin levels | **🟡 Mostly** — system_admin / enrollment_manager / enrollment_staff with campus RLS | A **recruiter tier** that sees leads but never student records (FERPA boundary) |

**Recommendation: build it, scoped to the three genuinely-new subsystems (landing pages, journeys, recruiter tier) plus the connective tissue (UTM/QR, engagement tracking, ad ingestion). Skip the rest — it exists.**

---

## 2. Why this belongs inside the EMS (the architectural argument)

One family = one record, from first click to first day. That is the Perla principle this whole platform follows, and it only works if every capture surface writes to the same `lead` table. A separate lead-gen product — even a well-integrated one — would create the exact seams the system exists to remove: duplicate family records, a sync layer to maintain, attribution that dies at the product boundary, and a second login for staff.

Inside the EMS, every new capture surface (landing page, ad webhook, QR scan) drops into infrastructure that already exists and is already battle-tested with 1,300+ real leads:

- The **response engine** fires automatically (welcome email, staff routing, follow-up date)
- The **attribution stitch** carries source → lead → application → offer → enrollment untouched
- **Campus RLS** scopes everything to the right school with zero extra code
- The **funnel dashboard** picks up every new source with zero extra code
- Bilingual EN/ES, brand components, and the Resend/Twilio channels come free

---

## 3. The build: three new subsystems + connective tissue

### Subsystem A — Landing Page Studio (the flagship)

Per-school, per-campaign landing pages that non-technical staff assemble in minutes, published at `enroll.rootedschool.org/p/[slug]` (e.g., `/p/crneal-healthcare`, `/p/cleveland-open-house`).

**Design decision that matters: block-based, not freeform.** Staff choose and reorder pre-designed, Rooted-branded blocks and edit their *content* — never fonts, colors, or layout. This is what keeps 3 campuses (and someday 10) on-brand without a design review bottleneck, keeps every page fast and mobile-first, and keeps the builder buildable in weeks instead of months. A freeform drag-and-drop builder (Wix-style) is explicitly out of scope: it produces off-brand pages, slow pages, and a maintenance tar pit.

**Block library v1:**
1. **Hero** — headline, subhead, campus logo, photo, CTA button
2. **Inquiry form** — the existing form, embedded; every page IS a capture surface
3. **Pathway highlight** — healthcare/tech/manufacturing cards with partner names (Prisma Health, etc.)
4. **Proof strip** — stats (IBC rates, growth data) in Rooted's evidence-led voice
5. **Testimonial** — family/student quote with photo
6. **Upcoming events** — auto-populated from the live events system, RSVP built in
7. **FAQ accordion** — seeded from the answer-before-they-ask library
8. **Video embed**
9. **Countdown** — application deadline urgency
10. **Bilingual toggle** — every block carries EN/ES content, same as the rest of the platform

**Per-page mechanics:** unique slug; automatic source tagging (every lead from `/p/crneal-healthcare` arrives tagged `landing_page / crneal-healthcare`); auto-generated **QR code** for print (flyers, yard signs, tabling kits — closes the loop with the tabling calendar); page-view counting so the funnel dashboard can show *visits → leads → applications* per page; publish/unpublish; campus-scoped ownership.

**Storage:** a `landing_page` table with a JSONB `blocks` array — no CMS dependency, versioned like everything else.

### Subsystem B — Journey Builder (drip sequences done right)

Upgrade the campaign engine from "one email, paced daily" to **multi-step sequences with exits**. Not a visual flowchart canvas (over-engineering at this scale) — a simple ordered list: *Step 1, Day 0: Welcome → Step 2, Day 3: Pathway story → Step 3, Day 7: Event invite → Step 4, Day 14: Apply nudge.*

**The non-negotiable feature is the exit rule.** A journey stops the moment the family applies, RSVPs, gets a logged staff call, or opts out. This is Steven's "better communication, not more communication" principle in code — nobody gets a "have you thought about applying?" email the day after they applied. (The infrastructure for this is cheap: the attribution stitch and activity timeline already record every one of those exit events.)

**v1 journeys (pre-built, editable):**
- **Push to Apply** — new leads: welcome → pathway content (matched to their stated interest) → event invite → deadline nudge
- **Keep the Seat** — accepted families: congratulations → registration checklist → what-to-expect → first-day countdown (this is the melt-prevention sequence from the Tier 2 roadmap; it lands here)
- **Event follow-up** — attended vs. no-show branches, feeding off the existing attendance tracking

**Engagement tracking (the "every message opened" gap):** enable Resend webhooks → record opens/clicks as `lead_activity` rows → journeys branch on them ("clicked healthcare story → send healthcare event invite") and the lead detail shows real engagement. One webhook endpoint; the timeline UI already exists.

### Subsystem C — Recruiter tier (multiple admin levels, completed)

A new `recruiter` role between "no access" and enrollment_staff: full Recruitment module (leads, events, campaigns, landing pages) for their campus, **zero access to applications, student records, documents, or lottery** — a hard FERPA boundary, enforced in RLS, not UI.

Why it matters: recruitment help is often part-time staff, AmeriCorps members, or parent ambassadors. Today you can't give them the CRM without giving them student records. This role makes the "founding families as recruiters" strategy operationally safe, and it's mostly policy work on the RLS layer that already exists.

### Connective tissue (small, high-leverage)

- **UTM capture** — `?utm_source=facebook&utm_campaign=juneteenth` on any page auto-fills lead source detail; paid ads become traceable to enrollments
- **QR generator** — per landing page and per source tag; downloadable for print; the tabling kit checklist already assumes these exist
- **Ad lead ingestion** — webhook endpoints for Meta Lead Ads and Google lead forms, so ad-platform leads flow straight into the pipeline with the response engine firing (Harmony's two highest-volume channels)
- **Embeddable inquiry widget** — one script tag that puts the inquiry form on the campus Squarespace/marketing sites, finally retiring the Google-Form-→-spreadsheet-→-sync chain for new capture (the sync stays for history)

---

## 4. What I would deliberately NOT build

- **Freeform page builder** — brand risk + maintenance tar pit (argued above)
- **A/B testing engine** — meaningless below ~1,000 visits/page/month; revisit at network scale
- **Per-user dashboard widget customization** — three-campus teams need one great dashboard, not a widget library
- **Marketing-suite creep** (social schedulers, ad buying) — stay a capture-and-nurture engine; buy ads in the ad platforms
- **A separate lead-gen product/database** — the whole argument of section 2

---

## 5. The complete funnel, end to end (what "truly robust" looks like)

```
DISCOVER            CAPTURE              NURTURE               CONVERT              ENROLL              ARRIVE
────────            ───────              ───────               ───────              ──────              ──────
Facebook ad ──┐     Landing pages   →    Push-to-Apply    →    Application     →    Offer + accept →    Keep-the-Seat
Google ad ────┤     Inquiry form         journey               (5 min, mobile,      Waitlist w/         journey
QR on flyer ──┼──→  Ad webhooks     →    Pathway-matched       bilingual)           live position       Registration
Tabling event ┤     Event RSVPs          content          →    Auto-stitch     →    Lottery w/     →    (pre-filled)
Referral link ┤     Embed widget         Event invites         attribution          simulation          Doc nudges
Word of mouth ┘     Walk-in (staff)      Re-engagement                                                  First day 🎓
                          │                    │                     │                    │
                          └────────────────────┴──── ONE FAMILY RECORD ──────────────────┘
                                    Funnel dashboard: visits → leads → apps → enrolled, by source
```

Everything right of CAPTURE already exists in production. This plan builds the left edge and the NURTURE spine.

---

## 6. Phasing and effort (relative to what this week's builds cost)

- **LG-1: Landing Page Studio + QR + UTM** — the flagship; comparable to the campaign engine + events builds combined. Ship first: it's the piece campuses feel immediately and the one that makes every *other* channel (ads, flyers, tabling) measurable.
- **LG-2: Journeys + engagement webhooks** — comparable to the campaign engine build; the Keep-the-Seat journey alone (melt prevention) likely pays for the whole phase in retained enrollments.
- **LG-3: Recruiter tier + ad ingestion + embed widget** — smallest phase; mostly RLS policy work and two webhook endpoints.

Sequencing logic: LG-1 creates the destinations, LG-2 creates the follow-through, LG-3 widens who can work the system and where leads come from.

---

## 7. Risks and honest caveats

1. **Content is the constraint, not software.** The Journey Builder needs pathway stories, testimonials, and FAQ copy written — per campus, bilingual. Software without a content owner per campus becomes empty scaffolding. (Mitigation: v1 ships with network-level default content; campuses override.)
2. **Deliverability scales with volume.** Journeys multiply email volume; the existing pacing infrastructure helps, but at some point `enroll.rootedschool.org` wants a dedicated sending subdomain and list-hygiene discipline.
3. **The follow-up owner problem doesn't go away.** Same as the blueprint's open question #3: this amplifies a human owner at each campus; it doesn't replace one.
4. **Maintenance surface grows.** Every subsystem added is one more thing the (currently one-person) engineering function maintains. The block-based/no-CMS choices above are deliberately boring for this reason.

---

## 8. Decision criteria (is it worth the effort?)

Build it if you believe: (a) campuses will run 3+ distinct campaigns/year each (pathway pushes, event pushes, deadline pushes) — landing pages earn their keep at that cadence; (b) someone at each campus will own content and follow-up; (c) the 2027-28 cycle (C.R. Neal Year 2, Cleveland Year 1) is the target, giving LG-1→LG-3 a comfortable runway this fall.

Don't build it (yet) if: this summer's founding-class push is the only near-term campaign (the existing CRM + campaigns already cover that), or no campus content owner exists.

One more honest note: the highest-ROI single item in this entire plan is probably the **Keep-the-Seat journey** (LG-2), not the landing pages — melt costs enrolled students, and enrolled students are funding. If you build only one thing, build that.
