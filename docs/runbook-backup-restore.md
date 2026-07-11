# Runbook: Backup & Restore (LG-0.6)

*Covers the Supabase project `szockdlohlmkyloubgtd` (all EMS + CRM data) and what to do if data is lost or corrupted.*

## What protects the data

1. **Supabase automated backups** — daily backups are included on paid plans; Point-in-Time Recovery (PITR) is an add-on that allows restore to any second within the retention window.
2. **Migrations in git** — the full schema (`supabase/migrations/00001–00032+`) rebuilds an empty database exactly.
3. **Interest-form Google Sheets** — the original lead source data lives outside the database and can be re-imported with the sheet-sync.

## ⚠️ One-time manual verification (Steven — 5 minutes)

- [ ] Supabase Dashboard → Project → **Database → Backups**: confirm daily backups are listed and note the retention period.
- [ ] If PITR is not enabled, decide whether to enable it (recommended once real applications are flowing; it's the difference between "restore to last night" and "restore to 2 minutes before the mistake").
- [ ] Note the answers in this file and check these boxes.

## If data was deleted or corrupted

1. **Stop the writers first**: pause Vercel crons (Vercel dashboard → project → Settings → Cron Jobs) so automation doesn't act on bad data.
2. **Small, surgical loss** (one lead, one application): check `audit_log` — most destructive actions record old values; restore by hand from the audit trail.
3. **Large loss**: Supabase Dashboard → Backups → restore to a new project (never overwrite in place), verify the data there, then either promote it (repoint `NEXT_PUBLIC_SUPABASE_URL` + keys in Vercel) or copy the affected tables back.
4. **Schema-only rebuild**: `supabase/migrations/` applied in order recreates everything; seed campus data is in `00012`/`00016`.
5. After any restore: re-run the sheet sync (Recruitment → Sync sheets) to catch interest-form rows submitted during the outage.

## Blast-radius notes

- The EMS is the system of record for **applications, offers, lotteries, registrations** — irreplaceable; this is what PITR protects.
- **Leads** are partially reconstructable from the Google Sheets (original signups) but activity timelines, stages, and campaign history are not.
- Lottery integrity: `lottery_run.random_seed` + entries make every official lottery re-verifiable after a restore (`runDeterministicLottery` reproduces stored results exactly).
