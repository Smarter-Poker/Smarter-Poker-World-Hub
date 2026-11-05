# Tournament Arena Relaunch: Email, Text, Push And Chips (2026-11-05)

## Chips (CLAUDE.md 10.6 settlement record)
Every real player (127, `smarter_private.sp_real_humans`) was owed 25 chips from
the Midway Union promo wallet. 91 were paid at 03:22 UTC. The other 36 belonged
to no Midway Union club, which `fn_promo_disburse` requires. At 22:08 UTC they
were added to KINGS CLUB (club code 25450, no approval, owner as upline per the
standing rule for members with no agent) through the canonical
`fn_join_club`, then paid by `fn_sp_relaunch_award_run`. Proven first in a
rolled-back transaction (36 joined, 36 paid, wallet down 900). Final ledger:
127 `promo_disbursement` credits totalling 3,175.00 = 127 promo-wallet debits
totalling 3,175.00 = 25 x 127; 0 players paid twice; 0 owed. Each of the 36
got a "25 Chips Just Landed In Your Wallet" notification, and sees the KINGS
CLUB popup on next login because their credit is now confirmed.

## Email
128 of 128 relaunch emails sent (76 through the old account, 52 through the
Pro account). The old `RESEND_API_KEY` belongs to the original Free-plan
Resend account that owns the root smarter.poker domain; nobody can log into
it and it stops at 100 emails a day. PR #2672 moves every remaining sender
onto the Pro account and mail.smarter.poker.

## Texts
55 players have a phone; 52 distinct numbers. 54 accepted by Twilio, 1
undialable test number. One phone sat on four accounts and was texted four
times; that line's carrier now refuses the platform number (Twilio 30005).
Every sender and the database pending readers now text each phone once per
campaign. Carrier results land in `sms_delivery_receipts` and undelivered
texts appear in the daily digest.

## Push
Only 3 of 128 players have a working notification device, so the relaunch
push reached 4 rows sent and 125 skipped (no device). Two causes: most
players never turned notifications on, and both apps only asked players with
a VERIFIED phone (88 of 128 had skipped verification and were never asked).
The ask now appears once the phone step is settled (verified, skipped, or
the account is past its first day). Dan's duplicate relaunch push came from
two agents each re-queuing it by hand; the database now refuses a second
campaign notification and records a second campaign push as
`duplicate_campaign_push`.

## Database change
Migration 20261105220755
`campaign_notices_once_per_player_and_phone_and_relaunch_chips_landed`;
source of record in `2026-11-05-campaign-guard-migration-source.sql`
(do not replay).
