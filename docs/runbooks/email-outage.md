# Email Outage

Email is how almost everything reaches a family: offers, deadline reminders, registration nudges, lottery results. When it stops working, nothing about the system pauses to wait for it, deadlines keep ticking on their own clock while families hear nothing.

## How to tell email is actually down

Check two places in Settings before you assume anything:

1. **Delivery channels** card: if the "Email via Resend" row shows **Not connected**, no email is going out at all, no matter how correctly everything else in the workflow ran.
2. **Automation health** card: look for automations that touch email (offer reminders, registration nudges, keep-the-seat) showing **overdue**, a **failed** run, or **"No runs recorded yet."** A stale or failed run here, alongside a "Not connected" channel, confirms it is a real outage and not one unlucky family.

If Delivery channels shows Connected but a specific family says they got nothing, that is a different problem; see when-something-breaks.md instead.

## Families whose offer deadlines are ticking while email is down

Offer deadlines and enrollment window closes do not pause themselves just because email cannot reach anyone. If a family's response deadline falls during an outage, they may never see the reminder that was supposed to prompt them.

1. **Call them directly.** Do not wait for email to come back. Look up the family's phone number and call to tell them about their offer, deadline, or outstanding item yourself.
2. **Log the contact** the same way you would any phone call, so there is a real record that a human reached this family during the outage, not just an automated attempt that silently failed.
3. **Ask your system administrator whether the deadline needs to be extended.** This is not a call to make yourself. If email was down for any meaningful stretch of a family's response window, it may be unfair to hold them to the original deadline, but extending a deadline is a system administrator decision, not a per-family judgment call.

Prioritize families closest to their deadline first, the same way you would work any exception queue.

## What NOT to do

**Do not bulk resend everything once email service returns.** When Delivery channels flips back to Connected, it is tempting to immediately resend anything that might have failed. Resist that. First check what actually went out during the outage (Staff → Communications, and Automation health's run history) before resending anything. Sending the same offer, reminder, or nudge twice to a family who did receive it the first time creates confusion, not clarity, and can make a deadline look like it moved when it did not.

Work through what genuinely did not go out, family by family, rather than resending broadly and hoping it sorts itself out.

## Hardest questions

**How do I know the outage is actually over, and not just that one automation happened to run?** Check that Delivery channels shows Connected again, and that a subsequent scheduled run in Automation health completed on time and normally, not just that a run attempted and failed quietly. If in doubt, check with your system administrator before trusting it is fully resolved.

**A family says they never got their offer, but Delivery channels shows Connected right now. What do I check?** The outage may have already ended by the time you're looking. Check the family's record and Automation health's history for the window when the offer was supposed to go out, not just the current status.

**Can I just extend every deadline myself to be safe?** No. Deciding which deadlines need extending, and by how much, is a system administrator decision because it affects fairness across every family in that cohort, not just the one in front of you.

Only your system administrator can reconnect email delivery, diagnose why the automation provider is failing, or make the call on extending deadlines affected by an outage.
