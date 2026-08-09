# Addendum: impact of the updated playbook
**Date:** 2026-08-09 · Source: local `PB 24 v2.2` (.md, updated) vs. the Drive copy I originally scoped against
**Bottom line:** the funnel itself did not change. The build implications below are
all real and I am adjusting to them. But the provenance is mixed, and I want that
on the record accurately.

## Provenance correction

I initially labelled everything below as NEW. That was wrong for about half of it.
Diffing the two copies properly:

**Genuinely added in your update:** the `MELT_RISK` code (absent from the Drive copy
in any form) and an expanded status-code table (`ORI_CONFIRMED` appears once in the
Drive copy, three times in yours).

**Already present in the Drive copy, and I simply missed it on my first pass:** the
KPI red-trigger thresholds, the school-tour and event-walk-up channel benchmarks,
the hard pre-opening gate, and the 14-day corrective-action SLA. My first read
extracted the funnel table and section list but never opened Sections 17 and 18,
which is where these live. That was an incomplete read on my part, not a change on
yours.

The practical effect on the build is identical either way. The distinction matters
only so you know how much to trust my "I checked" claims, and the honest answer is
that my first pass was thinner than it should have been.

---

## Unchanged, so all prior work stands

Five phases, identical. Same goals and same primary risks. Weekly melt contact from
lottery through first day. The 14+ day no-contact flag. The 10pp equity gap
threshold. 3× inquiry target, 40% inquiry-to-app, <5% melt.

---

## NEW: the playbook now specifies EMS status codes

This is a state machine the EMS is expected to implement. None of it exists today.

| Code | Trigger | Required action |
|---|---|---|
| `ENROLLED` | All required documents received | Send summer outreach sequence |
| `ORI_CONFIRMED` | Family confirmed orientation attendance | Send pre-orientation packet |
| `MELT_RISK` | No contact in 14+ days (June, August) | Alert DO for personal outreach |
| `ACTIVE` | Attended Day 1 | Remove from melt risk; begin retention track |
| `WAITLIST` | Lottery waitlist position assigned | Automated position notification |
| `DECLINED` | Family declined seat or withdrew | **Trigger refusal tracking log entry** |

It also adds a governance line worth reading twice:

> EMS must be fully configured before applications open. This is a hard pre-opening
> gate. Do not open any application intake before EMS is operational.

That elevates the EMS from useful tool to pre-opening gate for Cleveland and Columbia.

## SPEC (was already there, I missed it): KPI red-trigger thresholds

I previously had targets only. The playbook now specifies the RED threshold too, so
my GREEN/YELLOW/RED logic should use these rather than a generic "within 5pp" rule.

| KPI | Target | RED below/above | Monthly review |
|---|---|---|---|
| Lottery seat acceptance | ≥80% | <70% | No |
| Enrollment completion | ≥95% of accepted | <85% | No |
| Summer melt | <5% | >8% | Yes (Jun, Aug) |
| First-day attendance | ≥95% | <90% | Day 1 only |
| 30-day retention | ≥96% | <93% | No |
| Re-enrollment | ≥85% | <80% | No |
| Equity gap | <10pp | >10pp any metric | Monthly |

## SPEC (was already there, I missed it): channel benchmarks and two extra channels

| Channel | Workbook (old) | Playbook 17.2 (new) |
|---|---|---|
| Referral | 20% | ~20% |
| Community partner / CBO | 10% | **~15%** |
| School tour walk-in | not listed | **~12%** |
| Event walk-up | not listed | **~10%** |
| Social / digital ad | 6% | **~8%** |
| Cold outreach / flyer | 5% | ~5% |

The playbook also imposes response SLAs I did not have: **same-day** EMS follow-up
for school tours, **within 24 hours** for event walk-ups, and same-day entry for
event captures.

`crm_leads.source` today is `website | event | referral | qr | ad | walk_in | staff |
other`. That does not cleanly map to the playbook's channels: there is no CBO or
community-partner value, and no school-tour value. Channel ROI reporting needs this
vocabulary reconciled first.

## Playbook now contradicts the Workbook in four places

The playbook calls itself "the authoritative operational guide," so I am treating it
as source of truth. **The Workbook needs updating to match.**

| Item | Workbook | Playbook | Using |
|---|---|---|---|
| 30-day retention target | 97% | ≥96% | Playbook |
| Re-enrollment target | 90% | ≥85% | Playbook |
| Corrective action SLA | 30 days | **14 days** for RED findings | Playbook |
| Channel benchmarks | see above | see above | Playbook |

The corrective-action change also adds an escalation path: RED findings require the
ED to produce a written plan within 14 days **and** the RSF Director of Growth &
Innovation must be notified. That is a notification the EMS should send, not a
process note.

---

## Impact on the six items

**Revised (still in scope, adjusting as I build):**
- **Item 1:** MELT_RISK is June/August-scoped and alerts the DO specifically. Wiring
  to the named code rather than inventing my own.
- **Item 2 / 3:** use the published RED thresholds and the new channel benchmarks.
- **Item 4:** corrective-action SLA becomes 14 days, plus notify the RSF Director of
  Growth & Innovation.
- **Item 5:** **validated.** The `DECLINED` code explicitly requires a refusal
  tracking log entry, which is exactly what I am building. Continuing.

**Genuinely new, needs your approval before I add it:**
- **Item 7:** the six-code status/alert state machine with its triggers and actions.
- **Item 8:** orientation tracking, to support `ORI_CONFIRMED`. No orientation
  concept exists in the app at all today.
- **Item 9:** lead-source ROI reporting against per-channel benchmarks, which first
  requires reconciling the `crm_leads.source` vocabulary with the playbook's channels.

Rough add: 4 to 6 days for items 7 and 9. Item 8 depends on how much orientation
workflow you want beyond a confirmed/not-confirmed flag.
