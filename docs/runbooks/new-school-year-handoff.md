# New School Year Setup

Opening a new enrollment cycle is now done inside the app, from Settings. Creating the school year, its grade levels, and the first capacity plans requires the system administrator role: if that is you, the build takes minutes once you have the numbers; if it is not you, your job is to assemble everything the administrator needs, cleanly and early, so the build is a short conversation instead of a scramble.

## What to gather before anyone builds

1. **The school year itself.** Confirm the exact year label your campus uses and the start and end dates. The start date matters beyond the calendar: it is what several automations (like keep-the-seat outreach) use to know when to stop reaching out to newly registered families.
2. **Grade levels being served.** List every grade the campus will enroll for that year, including any new grade being added or any grade being dropped.
3. **Seats per grade.** For each grade, the number of seats you want available. Be specific rather than approximate; this becomes the number lottery runs and the Seats tab work from.
4. **Enrollment window dates.** When applications open and close for the new cycle, by grade if your campus varies them.
5. **Registration requirement changes.** If anything about what families must submit to complete registration is changing for the new year (a new document, a retired one, a state-specific item), write it out explicitly rather than carrying last year's list forward on assumption.

## Building it (system administrator)

All of this lives in Settings, in order:

1. **Settings → School Years & Grades: create the year.** Name, start date, end date. A new recruiting year can be current at the same time as the operating year; mark both current during the transition and un-mark the old year when its season truly ends.
2. **Settings → School Years & Grades: add each grade** for the campus and the new year. Grades belong to a specific year, never reused across years.
3. **Settings → School Years & Grades: create a capacity plan** for each campus, new-year grade, and seat count. This tab now holds school years, grade levels, and capacity plans together, so all three of these steps happen on the same screen.
4. **Settings → Enrollment Windows: create the window** with open and close dates. Leave it in draft until opening day, then flip it to open.
5. **Settings → Registration: confirm the new year's list is not empty.** Copy forward what stays, apply the changes gathered above.

**Before any family accepts a seat for the new year, confirm the Registration list actually has items in it.** Creating a school year does not automatically carry requirement items forward, and in the past a new year has been left with an empty Registration list, that let a family's registration packet be marked complete with nothing actually collected. Check the Registration tab for the new year yourself; do not assume it copied over. If it is empty, escalate to your system administrator before opening enrollment or sending any offers for that year; this may need a developer step to resolve, not just a screen you can fill in yourself.

Verify before opening day: the public site should show the real open date on the campus card (it reads it from the window you created), a test look at the Seats tab should show every grade with its seat count, and the Registration tab for the new year should show a real, non-empty list of items.

## What campus staff can do without the administrator

Adjust the seat total on an existing capacity plan from the Seats tab, edit enrollment windows, and edit the Registration list. Creating the year and its grades stays with the system administrator.

If you are building for more than one campus, remember the "Campus:" selector in the header remembers your last choice and tints the screen in that campus's color (green for Vancouver, amber for C.R. Neal, blue for Cleveland). Check the color before you start entering numbers, so a Cleveland seat count does not accidentally land on Vancouver's plan. Staff with access to only one campus never see this selector; the system shows their campus automatically.

## Hardest questions

**Why is creating the year still admin-only?** It is a deliberate guardrail. A school year, once families start applying against it, touches lottery runs, capacity, and every automation on a school calendar; a mistake here is hard to unwind cleanly, so it is kept in fewer hands. The difference now is that those hands use Settings, not the database.

**What if I find out about a new grade or a seat change after the year is built?** A new grade is a two-minute Settings addition for the administrator (plus a capacity plan for it). A seat count change on an existing grade you can handle yourself through the Seats tab. Know which kind of change you are asking for before you escalate.

**Can two school years really be current at once?** Yes, and during a transition they should be: the year your operating campus is finishing and the year your opening campuses are recruiting for. Every current-year view handles this. Just remember to un-mark the old year when its season closes, or stale data lingers in current-year stats.

Only your system administrator can create a new school year, add grade levels, or build the first capacity plan for a cycle. Everything else comes back into campus hands once the year exists.
