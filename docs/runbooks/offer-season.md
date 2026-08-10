# Offer Season

Once offers start going out, most of the routine work runs on a schedule. Your job is to know what the system is already doing, step in for the decisions it cannot make, and never assume a family was told something the system did not actually say.

## What runs automatically

Every offer carries an expiry date. Two automations watch that date, both running in UTC time (check Settings → Automation health if you need to translate a run time to your local clock):

1. **Reminder automation**, once a day at 15:00 UTC, sends a reminder to families whose offer deadline is approaching.
2. **Expiry automation**, once a day at 02:00 UTC, expires any offer that is now overdue and automatically promotes the next family on the waitlist into that seat, with a 7-day window for them to respond.

You do not need to trigger either of these. Your job is to watch that they are actually running (Settings → Automation health) and to handle the cases that need a human judgment call.

## Promoting from the waitlist by hand

Sometimes you need to promote a family off the waitlist yourself, ahead of the automation. Open the offer, choose to promote, and confirm. The dialog defaults to a 14-day response window, editable before you confirm. Use a shorter window if the season is closing fast, longer early in the cycle.

## Revoking or expiring an offer by hand

Both Revoke and Expire show a confirmation dialog before acting, since both actions are hard to walk back cleanly.

**The family is not automatically notified when you revoke or expire an offer by hand.** If you take this action, you are responsible for telling the family yourself, by phone, email, or whatever channel makes sense. Do not assume the system will handle it, and do not leave a family finding out only because their offer quietly disappeared.

## Using the Seats tab for guidance

The Seats tab suggests how many offers to extend based on real historical accept rates, once a campus and grade combination has 10 or more resolved offers behind it. Below that, it says honestly that there is no history yet rather than guess. Trust the guidance once it appears; treat earlier cycles as judgment calls, not data-backed ones.

## Hardest questions

**If I revoke an offer and forget to call the family, what happens?** Nothing, until they find out on their own or ask why. This is the easiest way to damage trust during offer season, so treat "tell the family" as part of the revoke action itself, not a follow-up task.

**Should I ever promote from the waitlist manually instead of waiting for the automation?** Yes, when timing matters: a family needing an answer sooner than the overnight run, or a seat that needs to move faster than the deadline schedule allows. The automation is a backstop, not the only path.

**What if the Seats tab guidance and my gut disagree?** Below 10 offers, trust your read of the campus. Above it, the guidance is built on your own campus's real numbers, so lean on it unless this cycle has a specific reason to differ (a new grade, a changed boundary, a local event).

Only your system administrator can change when these automations run or reconnect email and text delivery if either shows as disconnected in Settings.
