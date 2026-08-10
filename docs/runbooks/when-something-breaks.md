# When Something Breaks

Most things that feel broken are not the system down; they are one automation that did not run, one delivery channel disconnected, or a family whose consent settings changed something quietly. Work through these checks before assuming the worst.

## First stop: Settings

Two cards in Settings answer most "is something wrong" questions before you go any further.

1. **Automation health** lists every scheduled automation with its last run time, counters, and a flag if overdue or failed. If offers are not expiring or nudges are not going out, this is where you will see it. "No runs recorded yet" means that job has never fired since deployed, itself worth flagging.
2. **Delivery channels** shows plainly whether email and text are connected. If either shows not connected, nothing sent through that channel is reaching anyone, no matter how correctly the rest of the workflow ran.

## "The family says they got nothing"

Work through this in order:

1. Open the family's record and check their timeline or notifications history to confirm whether the system actually attempted to send anything, and when.
2. Check their text consent flag. If a family never opted into texting, or opted out, a text-only step will not have reached them; that is expected, not a bug.
3. Check for an email suppression flag. Bounced or previously-marked-spam addresses get suppressed automatically, and sending stops silently.

If the system genuinely attempted to send, the channel was connected, and the family had not opted out, and they still say they got nothing, escalate rather than keep guessing.

## Someone is locked out

Point them to the Forgot Password link on the login page first; it sends a standard email-based reset. If that does not resolve it, for example their email is wrong in the system or the reset email never arrives, that becomes a system administrator matter.

## If data looks lost or wrong

Do not attempt to fix data by hand or guess at what it should be. There is a dedicated runbook for this: see [runbook-backup-restore.md](../runbook-backup-restore.md). Bring in your system administrator immediately for anything beyond a single obvious mistake you can see and correct through the normal screens.

## Who to call

Check Automation health and Delivery channels first. If the issue is one family, work the triage steps above. If it looks systemic (multiple families, a channel down, an automation stuck over a day) or touches data integrity, escalate to your system administrator without further workarounds.

## Hardest questions

**How do I know if something is "systemic" versus just one unlucky family?** Check Automation health first. A flagged overdue or failed job is systemic, affecting everyone behind it, not just the family in front of you. If it looks clean, you are likely looking at a single-family issue.

**What if I am not sure whether to escalate yet?** Escalate. A false alarm costs a short conversation; a real issue left alone another day compounds into more families affected and more to untangle.

**Can I resend something manually to work around a stuck automation?** For nudges and reminders tied to one family, yes, use the manual action on that record. Do not work around a stuck automation for everyone by hand; fix the automation instead of patching around it family by family.

Only your system administrator can access the underlying infrastructure (hosting, database, and messaging provider), restore from backup, or diagnose why an automation is failing at the source.
