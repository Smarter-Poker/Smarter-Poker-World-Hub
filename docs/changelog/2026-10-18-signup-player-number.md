# Auth signup shares the profile player-number allocator

The October 17 daily digest's three signup errors were a single collision in
handle_new_user followed by foreign-key failures in diamond and wallet initialization.
The auth trigger drew from profiles_player_number_seq, independently of the
collision-safe fn_next_player_number already used by the other profile entry path.

Migration 20261018134229 changes only that allocator call and its text variable,
with asserted preimage and postconditions. It preserves the installed trigger,
phone-verification welcome eligibility, names, access tiers and conflict handling.
No user balances or existing player numbers change.

The PostgreSQL regression reproduces all three errors before installation,
then proves twelve concurrent signups create unique profiles and dependent
rows with no errors, zero initial diamonds and no initial VIP grant. Replaying
the migration refuses the changed preimage. The required Pre-Deploy Safety
Checks workflow runs this native test after its PostgreSQL 17 provisioning.

Live inspection found the affected profile and diamond mirror subsequently
created; no account created since October 17 lacks a profile. The deprecated
public.wallets pool is not repaired or funded by this change.
