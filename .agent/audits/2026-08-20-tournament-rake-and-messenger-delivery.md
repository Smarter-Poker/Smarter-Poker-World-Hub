# Tournament rake counted, statements delivered on the club messenger

Date: 2026-08-20
Follows: `2026-08-20-eco-on-club-data-and-weekly-invoicing.md`

Three asks: fix the MTT / SNG / spin rake bug, deliver invoices on the club
messenger instead of email, deploy Open Claw. All three done. Two further live
bugs were found on the way, both fixed.

---

## 1. The rake bug was two bugs, disagreeing with each other

**Bug A — the settlement and the invoice saw ZERO tournament rake.**
`fn_union_rake_paid_live`, `fn_union_rake_rollup_refresh_day` and
`fn_union_rake_day_is_fresh` all key on

```sql
rake_records r JOIN tables t ON t.id = r.table_id
```

but `record_tournament_buyin_rake`, `fn_register_horse_for_tournament`,
`process_tournament_rebuy` and `fn_spin_settle_game` write their rows with
`table_id NULL` — a buy-in fee is not attached to a table. The join dropped
every one of them, so `rake_generated` on the weekly invoice, and therefore
`rakeback_due`, counted cash hands only.

**Bug B — the rakeback close, which actually pays the clubs, used a different
derivation entirely:** `tournament_players.registered_at` ×
`tournaments.buy_in_fee`, scoped to tournaments carrying `union_id`. That is
not the rake that was collected, and it is wrong in both directions:

- **spins** have `buy_in_fee = 0` and are raked at 8% of the prize pool by
  `fn_spin_settle_game`, so every spin counted as zero
- **rebuys** write a `rake_records` row but no new `tournament_players` row, so
  their fee counted as zero
- tournaments run by a member club that never got `union_id` stamped were
  skipped even though their fee was routed to the union wallet
- refunded registrations still counted

Measured on the live week against the fee actually collected:

| club | basis credited | actually generated | error |
|---|---|---|---|
| Club JAQK | 7,553.68 | 352.00 | **21x over** |
| SHARK CLUB | 5,348.12 | 13,166.66 | **2.5x under** |

The union has been paying 90% of those numbers out every week.

**The fix — one rule.** Tournament, SNG and spin rake is whatever
`rake_records` says was collected, attributed to the player who paid it.
`rake_records` is the row the money actually moved on — the same row that
credited `union_wallets.rake_wallet` — so nothing downstream can drift from the
treasury again. New `fn_union_tournament_rake_by_user` is the single source;
the live rake function, the daily rollup, the freshness test, the rakeback
basis and the by-club function all read it.

Attribution: `metadata.user_id` names the payer on registration, rebuy and
refund rows. Spin settlement rows name no payer, so the fee is split equally
across that spin's entrants — exact, because every spin entrant posts the same
buy-in.

ECO was adjusted in the same migration so it does not double count: its
`cash_rake` is now derived as total minus tournament, rather than read from a
function that no longer means "cash".

### After

| club | rake_generated | rakeback_due (90%) | cash | tournament |
|---|---|---|---|---|
| Club JAQK | 30,484.48 | 27,436.03 | 30,132.48 | 352.00 |
| SHARK CLUB | 958,673.49 | 862,806.14 | 945,506.83 | 13,166.66 |

Checks: cash + tournament reconciles to total exactly for both clubs; rollup
versus live for a completed day agrees to 0.0027 (rounding); per-user
tournament total equals per-club total, 13,518.66 both ways; the freshness test
now detects a cash-only rollup day and heals it.

Note the closed week 2026-08-10 to 2026-08-17 had **zero** tournament rake
routed to the union, so the statements already issued for it are unchanged.
All the tournament volume is in the current week.

## 2. Statements go out on the club messenger

Email is gone — no Resend, no mail provider anywhere in this path.

`fn_union_send_club_message` writes into `conversations` + `messages`
(category `club`), the pair Club Arena's `MessagingService` actually reads: it
lists conversations by `participant_ids` containing the viewer, counts unread
by `messages.receiver_id`, and renders `messages.metadata`. The statement lands
as `message_type = 'invoice'` with the readable body in `content` and the full
breakdown in `metadata`, so a client can render a statement card and anything
that does not know the type still shows the text.

One conversation per (union owner, recipient) per club, reused every week, so a
club owner sees a running thread rather than a new conversation each Monday.

Delivered and verified: 2 conversations, 2 invoice messages, both invoices
flagged `message_sent`, re-run delivers 0.

### Bug 2 — the club messenger had never worked at all

The first delivery attempt returned this:

```
42883: function fn_can_message_in_club(uuid, uuid, uuid) does not exist
CONTEXT: PL/pgSQL function fn_check_club_message_permission() line 17
```

`messages` carries a live trigger, `tr_check_club_message_permission`, that
calls `fn_can_message_in_club`. **That function does not exist in the
database.** Every insert into a club conversation has been raising and rolling
back. `public.messages` held **0 rows** — that is the symptom, not a
coincidence. Nothing has ever been sent through the club messenger.

Restored with a conservative policy reconstructed from what the trigger
guards:

- **allowed** — union owner/admin over the club (this is what lets the
  statement through), the club owner either direction, club staff either way
  (owner / admin / super_agent / agent), an agent and their own downline player
  either direction, a self-thread, platform admins
- **blocked** — plain player to plain player with no staff or agent
  relationship, and anyone banned or suspended in that club

If the intended policy was broader, widen the function — but it has to exist,
because the trigger will keep calling it.

### Bug 3 — delivery to a club owner who is also the union owner

The first cut skipped any recipient equal to the sender. On Midway the union
owner and both club owners are the same account, so every recipient was skipped
and `messenger_deliveries` came back 0. That is not only a test-data quirk — a
union owner who also runs a member club is normal. The thread is now built from
the DISTINCT participant set: two people give a two-way thread, one person
gives a self-thread, and the messenger lists both correctly.

## 3. Open Claw deployed

```
[deploy-openclaw] Target: 178.104.160.250
[deploy-openclaw] systemctl is-active: active
[deploy-openclaw] systemd NRestarts: 0
[deploy-openclaw] Registered jobs: 92
[deploy-openclaw] Deploy complete: dispatcher.py synced, 92 jobs registered, 0 errors
```

The Monday job confirmed on the box:

```
Registered: /api/club-arena/union-invoice?action=send  [{'day_of_week': 'mon', 'hour': 13, 'minute': 0}]
```

That fire is a safety net, not the primary path: `fn_union_settlement_cascade`
round 4 already issues and delivers from inside Postgres at Mon 00:10 UTC. Both
are idempotent, so the overlap costs nothing.

## 4. Open

1. **`eco_include_horses` is still true.** Unchanged from the last audit; one
   settings update flips it when real clubs are on.
2. **Nothing renders `message_type = 'invoice'` specially yet.** The statement
   shows as text in the messenger, which is readable, but the metadata is there
   for a proper statement card whenever the messenger UI wants one.
3. **The rakeback correction is prospective.** Past weeks were closed on the
   old basis; this changes what the next close pays. If previously closed weeks
   need restating, that is a separate, deliberate exercise.
