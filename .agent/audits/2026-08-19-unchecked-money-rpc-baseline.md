# Unchecked money-RPC call sites — baseline 42 (2026-08-19)

These 28 Postgres functions RETURN {success:false} rather than raising, so a
caller that inspects only the Supabase transport error cannot tell a REJECTED
debit or credit from a successful one. Frozen by
scripts/check-unchecked-money-rpc.mjs; lower BASELINE as these are paid down.

## pages/api/club-arena/settle-period.js  (7)
  - L466  fn_debit_treasury
  - L479  fn_union_credit_wallet
  - L489  fn_credit_treasury
  - L709  fn_debit_treasury
  - L719  fn_credit_chips
  - L823  fn_debit_treasury
  - L830  fn_credit_chips

## pages/api/club-arena/manage-agent.js  (6)
  - L742  fn_debit_chips
  - L757  fn_credit_treasury
  - L767  fn_credit_chips
  - L1376  fn_debit_chips
  - L1384  fn_credit_chips
  - L1389  fn_credit_chips

## src/lib/poker-engine/ClubLedger.js  (4)
  - L78  fn_credit_chips
  - L110  fn_debit_chips
  - L248  fn_credit_treasury
  - L278  fn_debit_treasury

## pages/api/club-arena/leave-club.js  (3)
  - L163  fn_credit_chips
  - L199  fn_debit_chips
  - L209  fn_credit_treasury

## pages/api/club-arena/rakeback.js  (3)
  - L310  fn_debit_treasury
  - L327  fn_credit_chips
  - L335  fn_credit_treasury

## pages/api/social/referral.js  (3)
  - L216  add_diamonds_to_balance
  - L233  add_diamonds_to_balance
  - L257  add_diamonds_to_balance

## pages/api/store/webhooks/stripe.js  (2)
  - L207  add_diamonds_to_balance
  - L621  add_diamonds_to_balance

## pages/api/live/gift.js  (2)
  - L499  deduct_diamonds
  - L577  add_diamonds_to_balance

## pages/api/training/tournaments.js  (2)
  - L203  add_diamonds_to_balance
  - L240  add_diamonds_to_balance

## scripts/verify-diamond-deduction.js  (2)
  - L38  add_diamonds_to_balance
  - L59  add_diamonds_to_balance

## pages/api/venues/[...slug].js  (1)
  - L419  add_diamonds_to_balance

## pages/api/cron/vip-stipend.js  (1)
  - L228  award_diamonds_v2

## pages/api/store/diamond-transfer.js  (1)
  - L562  deduct_diamonds

## pages/api/store/purchase-with-diamonds.js  (1)
  - L306  add_diamonds_to_balance

## pages/api/club-arena/promo-wallet.js  (1)
  - L140  mint_club_promo

## pages/api/promo/redeem.js  (1)
  - L135  add_diamonds_to_balance

## pages/api/promo/redeem-promo-code.js  (1)
  - L128  add_diamonds_to_balance

## src/lib/poker-engine/GameController.js  (1)
  - L2029  fn_credit_chips
