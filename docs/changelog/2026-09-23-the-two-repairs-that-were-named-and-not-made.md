# The two repairs that were named and not made (2026-09-23)

The marketplace repair pass earlier today closed twenty nine findings and left
two of them explicitly open in its own report. Both are closed here.

## A checkout that will not open, in the four places it was still silent

`leaveForCheckout` returns null when it refuses to navigate. Three of the seven
call sites were fixed this morning; the other four kept discarding it, so a
shopper on the cart, the Club Shop item page, the merch store or the memory
games page could see the redirect toast, watch the button come back, go
nowhere, and still have the durable request claimed against them. All seven
now take the error path, which is the one that already knows how to replace a
spent request and report the failure.

## A member's name in the refund toast

Buyer names came off `marketplaceCopy` on every rendered surface, because the
formatter Title Cases every word and turns `_` into a space: `ALLIN_ACE` read
as "Allin Ace", and two different members could render identically in a ledger
refunds are issued from. The refund confirmation toast could not be fixed the
same way. A toast is one string, and `StoreToast` runs every one of them
through `marketplaceToastCopy`, so the name was still rewritten in the one
message that says whose money just moved.

`marketplacePreservedName` wraps a span in a private-use marker that the copy
layer's existing token protection consumes, so the name is carried through byte
for byte while the prose around it is still formatted. Any marker already in
the value is stripped first, so a name cannot smuggle one in and free the rest
of a message from formatting, and nothing that passes through `marketplaceCopy`
can print one.

## What is still open on purpose

`normalizeVerifiedClubPurchaseSuccess` still requires the receipt's item name to
match the name the buyer confirmed. After this morning's server fix a rename
mid purchase no longer fails a charged, delivered purchase; the browser reports
it as uncertain and a reload resolves it through the recovery read. That check
binds the receipt to what the buyer actually agreed to buy, so it stays.

`__tests__/diamond-store-phase-26.test.mjs` holds both repairs, including that
no caller may go back to discarding a refusal, and that two names differing
only in case stay distinguishable in a toast.
