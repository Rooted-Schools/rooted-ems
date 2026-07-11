# Rooted Grow: Lead Generation Engine — Plan and Outline

*Status: PLAN ONLY — nothing in this document is built. Companion to `crm-concept-and-plan.md` and `competitive-analysis-and-roadmap.md`. Prepared July 2026; revised after red-team review to cover prerequisites, per-campus strategy, and governance gaps.*

---

## 1. The verdict up front

The requested component makes sense — but not as a new system. Three of its six core features are already live in the Recruitment CRM shipped July 2026, one is more than half built, and two are genuinely new. Building this as a separate "lead generator" would duplicate the lead table, split attribution, and break the single-family-record principle the whole system is built on. Building it as the **top-of-funnel layer of the existing EMS** costs roughly a third of a standalone build and inherits security, bilingual support, and attribution for free.

| Requested feature | Status today | What's actually left |
|---|---|---|
| Built-in lead capture & management | **✅ Live** — inquiry form, pipeline, stages, follow-up queue, timeline, dedupe, sheet sync, event RSVPs, referral links | Nothing structural |
| Lead source tracking | **✅ Live** — source + source_detail on every lead; funnel dashboard shows per-channel application conversion | UTM capture + QR generation (small) |
| Customizable dashboards to manage leads | **✅ Live** — recruitment pipeline + funnel analytics, campus filter, CSV export | Cost-per-enrollment tracking (ad spend entry); saved views optional |
| Automated drip emails | **🟡 ~60%** — welcome touch, re-engagement touch, batch campaigns with daily pacing and 4 branded templates | True multi-step **journeys** (Day 0/3/7/14 sequences with behavior-based exits) — and the LG-0 compliance layer below |
| Custom landing page builder per school | **❌ New** — the flagship of this ask | Full build |
| Multiple admin levels | **🟡 Mostly** — system_admin / enrollment_manager / enrollment_staff with campus RLS | A **recruiter tier** that sees leads but never student records (FERPA boundary) |

**Recommendation: build it — but in this order: LG-0 (prerequisites that gate everything, including work already live), then per-campus (conversion machinery for Columbia, generation machinery for Cleveland), scoped to the three genuinely-new subsystems plus connective tissue. Skip the rest — it exists.**

---

## 2. The strategic frame: two campuses, two different problems

Run the funnel backward before building anything. **C.R. Neal already holds 1,263 leads.** Against a founding class of roughly 150–200 seats, even a weak 10–15% lead-to-enrollment rate fills the school from the existing pipeline. **Columbia's bottleneck is conversion, not generation** — the reintroduction campaign, the Push-to-Apply journey, and disciplined human follow-up are worth more there than any new capture surface.

**Cleveland is the true lead-generation case:** 30 leads, opening fall 2027, an entire funnel to build. Landing pages, ad ingestion, QR-tagged tabling, and referral mechanics are exactly what a pre-opening year needs.

So the plan phases **per campus, not per feature**:

- **Columbia (now → opening day):** LG-0 prerequisites → reintroduction campaign → Push-to-Apply + Keep-the-Seat journeys. Landing pages are optional polish here.
- **Cleveland (fall 2026 → 2027 season):** full LG-1 → LG-3 build, giving Tim's team a complete generation engine a year before doors open — and producing the documented Enrollment & Recruitment playbook for every campus after.

**The one number that sharpens this plan: seats per grade at each campus.** With it, the funnel dashboard can show "leads needed vs. leads held" per grade — turning recruitment from a volume instinct into arithmetic.

---

## 3. LG-0 — Prerequisites (these gate everything, including what's already live)

Red-team findings. None of these are optional, and several matter before the *existing* campaign engine sends its first big batch.

1. **Unsubscribe, suppression, and bounce handling.** Today's campaigns carry a "reply to opt out" line with no one-click unsubscribe link, no suppression list, and no bounce processing. CAN-SPAM expects a functioning, automatically-honored opt-out; Gmail/Yahoo bulk-sender rules expect an RFC-8058 one-click unsubscribe header; and bounced addresses that keep receiving sends are how a sending domain's reputation dies. Build: a tokenized unsubscribe link on every campaign/journey email, a `suppressed` flag every sender checks, and a Resend bounce/complaint webhook that marks addresses invalid. **This gates the 1,263-family reintroduction campaign regardless of any other decision.**
2. **Staff enablement — adoption before construction.** The teams this engine serves don't yet know the Recruitment tab exists (Columbia's enrollment manager account has never signed in). Before LG-anything: a walkthrough for Lalah's and Tim's teams, a one-page quick-start, and codification as the **Enrollment & Recruitment chapter of the 22-playbook framework** — which is also how this replicates to future campuses. Software without adoption is the most expensive kind of shelf-ware.
3. **Media-release governance.** Testimonial blocks and photos of students/families require signed media releases, and quotes about enrolled students brush against FERPA. Rule: no testimonial or photo publishes without a release on file; each campus names an owner for that file.
4. **Rate limiting on public endpoints.** The inquiry and RSVP forms have honeypots but no rate limits; a spam flood would pollute the pipeline and fire real emails. Add per-IP throttling before adding more public capture surfaces.
5. **Data retention policy.** Leads who never convert are marketing PII with no defined lifecycle. Adopt a purge-or-anonymize window (e.g., 24 months after last activity), documented and automated.
6. **Backup/recovery verification.** Confirm the Supabase project's point-in-time recovery configuration and write the one-page restore runbook. Twenty minutes of diligence protecting all of it.

LG-0 is small — days, not weeks — and most of it hardens systems already in production.

---

## 4. Why this belongs inside the EMS (the architectural argument)

One family = one record, from first click to first day. That principle only works if every capture surface writes to the same `lead` table. A separate lead-gen product — even well-integrated — creates the seams the system exists to remove: duplicate family records, a sync layer, attribution that dies at the product boundary, a second login.

Inside the EMS, every new capture surface (landing page, ad webhook, QR scan) drops into infrastructure already battle-tested with 1,300+ real leads: the response engine fires automatically; the attribution stitch carries source → lead → application → offer → enrollment untouched; campus RLS scopes everything with zero extra code; the funnel dashboard picks up every new source automatically; bilingual EN/ES, brand components, and the email/SMS channels come free.

---

## 5. The build: three new subsystems + connective tissue

### Subsystem A — Landing Page Studio (the flagship; Cleveland-first)

Per-school, per-campaign landing pages that non-technical staff assemble in minutes, published at `enroll.rootedschool.org/p/[slug]` (e.g., `/p/cleveland-open-house`, `/p/crneal-healthcare`).

**Design decision that matters: block-based, not freeform.** Staff choose and reorder pre-designed, Rooted-branded blocks and edit their *content* — never fonts, colors, or layout. This keeps every campus on-brand without a design-review bottleneck, keeps pages fast and mobile-first, and keeps the builder buildable in weeks instead of months. A freeform Wix-style builder is explicitly out of scope: off-brand pages, slow pages, maintenance tar pit.

**Block library v1:** Hero · Inquiry form (embedded — every page is a capture surface) · Pathway highlight cards (healthcare/tech/manufacturing with partner names) · Proof strip (evidence-led stats) · Testimonial (**publishes only with a media release on file — see LG-0.3**) · Upcoming events (live, RSVP built in) · FAQ accordion · Video · Deadline countdown. Every block carries EN/ES content.

**Per-page mechanics:** unique slug; automatic source tagging; auto-generated **QR code** for print (flyers, yard signs, tabling kits — the tabling kit checklist already assumes these); page-view counting so the dashboard shows *visits → leads → applications* per page; publish/unpublish; campus-scoped ownership. Pages must meet WCAG accessibility — enforced by the blocks themselves, which is another argument for block-based.

**Storage:** a `landing_page` table with a JSONB blocks array — no CMS dependency.

### Subsystem B — Journey Builder (drip sequences done right; Columbia-first)

Upgrade the campaign engine from "one email, paced daily" to **multi-step sequences with exits**. Not a visual flowchart canvas — a simple ordered list: *Day 0: Welcome → Day 3: Pathway story → Day 7: Event invite → Day 14: Apply nudge.*

**The non-negotiable feature is the exit rule.** A journey stops the moment the family applies, RSVPs, gets a logged staff call, unsubscribes, or is suppressed (LG-0.1). "Better communication, not more communication," in code.

**v1 journeys (pre-built, editable):**
- **Push to Apply** — new leads: welcome → pathway content matched to stated interest → event invite → deadline nudge
- **Keep the Seat** — accepted families: congratulations → registration checklist → what-to-expect → first-day countdown. *The melt-prevention sequence; it lands here.*
- **Event follow-up** — attended vs. no-show branches, off existing attendance tracking

**Engagement tracking:** Resend open/click webhooks → `lead_activity` rows → journeys branch on them, and the lead timeline shows real engagement. Closes the "every message opened makes the next message smarter" gap from the Perla vision.

### Subsystem C — Recruiter tier (multiple admin levels, completed)

A new `recruiter` role between "no access" and enrollment_staff: full Recruitment module (leads, events, campaigns, landing pages) for their campus, **zero access to applications, student records, documents, or lottery** — a hard FERPA boundary enforced in RLS, not UI. Makes part-time recruiters, AmeriCorps members, and parent ambassadors operationally safe.

### Connective tissue (small, high-leverage)

- **UTM capture** — ad parameters auto-fill lead source detail
- **QR generator** — per landing page and per source tag, downloadable for print
- **Ad lead ingestion** — webhook endpoints for Meta Lead Ads and Google lead forms, response engine firing on arrival
- **Embeddable inquiry widget** — one script tag for the campus marketing sites, retiring the Google-Form → spreadsheet chain for new capture
- **Cost-per-enrollment tracking** — a simple ad-spend entry per campaign/channel so the funnel dashboard can answer the board's actual question: *what does an enrolled student cost, by channel?* Counts without dollars can't justify a marketing budget.

---

## 6. What I would deliberately NOT build

- **Freeform page builder** — brand risk + maintenance tar pit
- **A/B testing engine** — meaningless below ~1,000 visits/page/month; revisit at network scale
- **Per-user dashboard widgets** — three-campus teams need one great dashboard, not a widget library
- **Marketing-suite creep** (social schedulers, ad buying) — stay a capture-and-nurture engine
- **A separate lead-gen product/database** — the whole argument of section 4

---

## 7. The complete funnel, end to end

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
              Funnel dashboard: visits → leads → apps → enrolled — by source, with cost per enrollment
```

Everything right of CAPTURE already exists in production. This plan builds the left edge and the NURTURE spine — under the LG-0 compliance layer.

---

## 8. Phasing and effort

- **LG-0: Prerequisites** — unsubscribe/suppression/bounce, staff enablement + playbook chapter, media-release governance, rate limiting, retention policy, backup verification. *Days of work; gates everything, including the reintroduction campaign.*
- **LG-1: Landing Page Studio + QR + UTM** — comparable to the campaign engine + events builds combined. **Cleveland-first**: it's the pre-opening campus that needs generation machinery.
- **LG-2: Journeys + engagement webhooks + cost tracking** — comparable to the campaign engine build. **Columbia-first**: Push-to-Apply converts the 1,263; Keep-the-Seat protects the founding class. Likely pays for itself in retained enrollments.
- **LG-3: Recruiter tier + ad ingestion + embed widget** — smallest phase; mostly RLS policy work and two webhook endpoints.

Sequencing logic: LG-0 makes it safe, LG-2 converts what Columbia already holds, LG-1 generates what Cleveland doesn't yet have, LG-3 widens who can work the system.

---

## 9. Risks and honest caveats

1. **Content is the constraint, not software.** Journeys and pages need pathway stories, testimonials (with releases), and FAQ copy — per campus, bilingual. Software without a content owner per campus is empty scaffolding. *Mitigation: v1 ships with network-level default content; campuses override; the media-release file is part of the content owner's job.*
2. **The engine has no fuel line without ad budget.** Landing pages + UTM + ad webhooks assume paid spend exists. Without it, the layer serves organic traffic only (QR, tabling, referrals) — still useful, but a fraction of projected value. *A per-campus marketing budget and an ads owner are decision inputs, not afterthoughts.*
3. **Deliverability scales with volume.** Journeys multiply email; beyond LG-0's hygiene, plan a dedicated sending subdomain as volume grows.
4. **The follow-up owner problem doesn't go away.** This amplifies a human owner at each campus; it doesn't replace one.
5. **Maintenance lands on a one-person engineering function.** Every subsystem is one more thing to maintain — hence the deliberately boring choices (block-based, no CMS, no flowchart canvas). Each phase ships with a runbook, and the playbook chapter documents operations so the bus factor is a known, written-down risk rather than an unspoken one.

---

## 10. Is it worth the effort? (decision criteria)

**Build it if:** (a) Cleveland's 2027 season is the target — a pre-opening year is exactly when a generation engine earns its keep; (b) each campus can name a content owner and a follow-up owner; (c) there's a real (even modest) ad budget with an owner; (d) campuses will run 3+ distinct campaigns/year — landing pages earn their keep at that cadence.

**Don't build LG-1 (yet) if:** the only near-term need is Columbia's founding push — the existing CRM + campaigns + LG-2 journeys cover that — or no content owner exists.

**Kill criteria (decide these now, not after):** if 90 days post-LG-1 fewer than ~5 pages exist or pages drive under ~10% of new leads, stop investing in the Studio and double down on journeys and human follow-up. Build the exit ramp into the plan so sunk cost never drives the roadmap.

**Do regardless of everything above:** LG-0 (it protects what's already running) and the **Keep-the-Seat journey** — melt costs enrolled students, and enrolled students are funding. If you build only one new thing, build that.
