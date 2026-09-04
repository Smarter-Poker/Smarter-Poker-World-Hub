# 2026-09-04 - manage-union asks before it creates

Branch: `fix/union-creation-is-allowlisted`. Pairs with the Club Arena PR of
the same name.

Dan: "HIDE ALL CREATE UNION PAGE AND FUNCTIONALITY FOR ALL ACCOUNTS EXCEPT FOR
MINE."

This handler is why hiding the page was never going to be enough. `action:
'create'` inserts into `public.unions` through the **service role**, so row
level security does not apply to it, and any signed-in account could POST here
whether or not Club Arena rendered a button.

The decision now lives in the database (Club Arena migration
`20260904223000_union_creation_is_an_allowlist.sql`): `public.union_creators`
is the list, and `trg_union_creation_is_allowlisted` on `public.unions`
refuses the insert for anyone not on it - this file included, whatever it
does. The check added here calls `fn_can_create_union` first purely so the
caller gets a sentence and a 403 instead of a constraint violation.

Nothing else in this handler changed; the other actions were already gated on
union-admin membership below.
