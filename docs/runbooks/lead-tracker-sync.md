# Lead tracker sync

This covers how C.R. Neal leads get into Rooted EMS, how to pull them in yourself, and how to read the result. It is written for enrollment staff and the system administrator, not for developers.

## The one rule that makes this work

There is exactly one source of truth for C.R. Neal leads: the Google Sheet named **[Source of Truth].CR_Neal_Academy.Lead_Tracker**, and specifically its **[Active].Lead_Tracker** tab. The app does not replace that sheet. It reads from it. If a lead needs to be added, corrected, or removed, the change happens in the sheet, and the sync carries it into the app. Editing a lead directly in the app is not how leads are maintained, because the next sync will bring the sheet's version back.

## What the sync does on its own

Every Monday at 8:00 a.m. UTC (which is early Monday morning in the US), the app reads the tracker tab and brings it up to date. It follows a few fixed rules so the data stays clean:

- **One record per family, never duplicates.** The tracker carries duplicate rows on purpose (the same family who came in through Meta and also filled the interest form shows up more than once). The sync collapses those to a single lead per email address. This is why the app shows the number of unique families, not the raw row count. A tracker with 1,332 rows and 1,280 unique emails becomes 1,280 leads.
- **It never deletes and never adds a duplicate.** A lead that disappears from the sheet is left in place and reported, not removed, so a stray edit cannot wipe records.
- **It only touches intake fields.** Names, phone, zip, grade, and source come from the sheet. Anything operational (a family's stage, their application, anything you have done to work the lead) is never overwritten.
- **It cleans phone numbers and rejects bad ones.** Numbers are standardized, and a value that is not a real phone number (a stray character, a number with too many digits) is skipped rather than stored. A good phone number already on a lead is never replaced with a blank or with junk from the sheet.
- **Grade is the 2027 launch-year grade.** The sync stores each student's mapped 2027 grade, and leaves it empty for anyone who would have aged past 12th grade by launch.

## Pulling leads in yourself

If you do not want to wait for Monday, an administrator can run it on demand:

1. Go to the staff console, open **Settings**.
2. Find the **Lead tracker sync** card.
3. Click **Sync leads now**.

It takes a few seconds. When it finishes you get a short result: how many unique families are in sync, how many were added, and how many were updated. On a normal run nothing is "added" (the app already has everyone) and the updates are whatever changed in the sheet since last time. Running it twice in a row is safe; the second run simply finds nothing to change.

## Reading the result

- **Families in sync** is the unique-family count. This is the real number, and it will be lower than the sheet's row count because of the deduplicating described above. That difference is expected, not an error.
- **Added** should almost always be zero. A number here means genuinely new families appeared in the sheet.
- **Updated** is how many existing leads had a field brought in line with the sheet (a new phone number, a corrected name, a fixed grade).

## The hardest questions, answered honestly

**The sheet shows more rows than the app shows families. Is something missing?**
No. The sheet counts every row, including duplicate submissions from the same family. The app counts families. Subtract the duplicate rows and the two numbers agree. Nobody is dropped.

**A family filled the form twice with two different email addresses. What happens?**
They come in as two leads, because the sync can only recognize a duplicate by matching email. Two different emails read as two different families. These near-duplicates are cleaned by fixing them in the sheet, not by the sync.

**A lead's grade looks wrong in the app.**
Almost always the grade is wrong or conflicting in the sheet. Fix it in the tracker tab and the next sync (or a "Sync leads now") will correct the app. The app does not invent or guess a grade; if the sheet has no usable grade, the app leaves it empty.

**Can I just fix it in the app instead?**
You can, but it will not stick. The sheet is the source of truth, so the next sync restores the sheet's version. Fix it in the sheet.

**Will the sync email or text any of these families?**
No. The sync only updates records. It never sends anything. Family messaging is a separate, deliberate step.

## What only the system administrator can do

- Run **Sync leads now** (the button is admin-only).
- Change the weekly schedule, or the sheet the sync reads.
- Manage the Google access that lets the sync read the sheet.

If the sync ever reports an error, or the tracker tab is renamed or moved, contact the system administrator. Everything else, including keeping the lead data correct, is done by maintaining the tracker sheet.
