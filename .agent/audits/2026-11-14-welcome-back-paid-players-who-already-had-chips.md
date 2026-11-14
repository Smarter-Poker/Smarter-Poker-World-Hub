# Welcome Back Chips paid players who already had chips (2026-11-14)

## What happened

`fn_sp_signup_welcome_back_run` (Club Arena migration 20261104145956) paid 25
chips from the Midway Union promo wallet to any real sign-up with no hand after
24 hours. It never checked whether the player had already received chips.

Dan, 2026-11-14 10:19 Central: the promo "IS ONLY FOR USERS THAT HAVE NEVER
RECEIVED ANY CHIPS ... IF IT EVER RECEIVED A PROMO PREVIOUSLY... DO NOT SEND."
He found it on MeepMeep's receipt (chip_transactions
07ddbdc4-701f-47cb-9fd4-7d89b9c62a91): twin2983 sent MeepMeep 50 promo chips on
Nov 12 at 11:02 PM Central, and the welcome-back run paid him 25 more on Nov 13
at 7:17 PM Central.

## Fix

Migration 20261114163112, installed 2026-11-14 16:31 UTC:
`fn_sp_player_has_received_chips` (any chip credit, any type, ever) gates the
run's candidate selection and closes parked no_club/failed rows. A dry run
before install showed it holding back Kewski, CesarOrtiz05 and NaughtyNoah.
All three already had agent promo chips and were due to be paid on Nov 14.

## Payments already made under the old rule

Of the 35 Welcome Back Chips payments since Nov 4, 27 went to players already
credited chips before the award: 675 chips in total, 25 each.

| Player | Already received before the award |
|---|---|
| Philivey | kingfish 200; Diamond game prizes |
| Tootricky4u2 | savage 25 + 25 |
| Littlechip | DarthBayter 25 |
| Nena | EmoBloopBloop 30 |
| Angelwings | burls 50; Diamond game prizes |
| CMA | HankFrank 25 |
| VegasKash | kingfish 50 |
| Rupy017 | kingfish 25 |
| Langdang | Probyourmom 20 |
| Bluffinbreed | Rooster 50 |
| Rocking64 | kingfish 50 |
| Chaivo | HankFrank 25 |
| flop | Diamond game prizes |
| Breezy | Probyourmom 20; Tournament Arena Relaunch 25 |
| TheSAUCE, PokerMogul, Pescado, Tootricky4u, 3Putt, Cubbyear81, jeff, Player9318ac7eb, Player3bf2936a2, Player18cbd829f | Tournament Arena Relaunch 25 (union promo) |
| kaelastacks | kingfish 50 |
| Farmboy13 | kingfish 105 |
| MeepMeep | twin2983 50 |

Under CLAUDE.md section 10.6 rule 3, nothing is taken back from a player for
our mistake: the 675 chips are absorbed from the Midway Union promo wallet and
reported here, and no reversal was made.

The other 95 `awarded` rows in `sp_signup_welcome_back_awards` are Tournament
Arena Relaunch payments. They were recorded there so that those players would
not also be paid welcome-back, and they are not welcome-back payments.
