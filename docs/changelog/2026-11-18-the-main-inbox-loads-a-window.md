# 2026-11-18: the Messenger main inbox loads a window

Follow-up to `2026-11-18-the-dock-loads-what-the-dock-shows.md`, which bounded
the dock and left `workspace: 'feed'` reading everything.

## Root cause

`feed` is not a side list. It is the Messenger page's own main inbox:
`pages/hub/messenger.js` asks for `feed` whenever no club is selected. It
returns every personal thread plus, for each club, the caller's invoices and
any unread club discussion.

To build that list the loader read thread details and the two accounting
authority functions for every thread the person ever had, 100 at a time.
Measured in production on the owner account: 5,895 threads (1,303 personal,
4,592 in clubs). Of the club threads, 1,973 are invoices the feed shows; the
other 2,619 are almost all invoices the caller issued that have no discussion, which the
inbox rules never list, and they were read anyway. Modelled at 9,700 threads,
the old code asked for thread details 19,400 times in one load.

## Fix

`src/lib/messengerWorkspace.mjs`, feed only. Per inbox the feed now reads:

1. every thread with something unread, so every unread count is unchanged;
2. every pinned thread. The page sends its pinned ids (validated as UUIDs, at
   most 200). A pin only keeps a row the inbox reader already returned for
   this caller, so it cannot reveal anything;
3. every invoice that still requires action, found with one call to the new
   `fn_messenger_private_invoice_attention_ids(p_user_id)`;
4. the newest `window` of the remaining read threads (100 by default, clamped
   by the server to 100..10,000).

In a club inbox, read threads that the feed can never show (issued invoices
with no discussion, read club discussions) are no longer read at all. The set
of invoices is taken from `accounting_conversations` by audience with the same
two conditions `selectWorkspaceConversations` applies. This removes nothing
from the answer.

The response adds `hasOlder`, `window` and `olderWindow`. The page shows a
"Load Older Conversations" button under the list (also under a name search)
and asks again with `olderWindow`; the list is replaced, not merged. A message
search hit in a thread that is not loaded is kept and opened through the
existing conversation resolver, which authorizes it again.

Not changed: who may see what, the club workspaces including each club's
Invoices tab, the resolve workspace, the unread summary, and the dock.

### The new database function

The shared schema is owned by the Club Arena repository (this repository's
`shared-schema-lineage` gate admits no new migration), so the function is
delivered there, as migration `messenger_invoice_attention_ids`. It adds
`fn_messenger_private_invoice_attention_ids(p_user_id uuid) RETURNS uuid[]`:
the same joins, membership check and `requires_action` expression as the
installed `fn_messenger_private_invoice_attention`, over all of the caller's
invoice threads. SECURITY DEFINER, `search_path` `public, pg_temp`, EXECUTE for
`service_role` only, like the installed reader. Its answer only selects which
threads are read; whether a listed thread requires action is still said by the
existing function. The same query was compared in production, read-only, with
the installed function for the 25 accounts with the most invoice threads
(3,252 threads): 4 action-required threads from each, no difference.

A merged migration file is not an installation. Until the function is
installed the loader receives "function not found", treats attention as
unknown and reads every invoice in each club exactly as before; personal
threads are windowed either way because they carry no invoice state. Any other
failure of the function fails the request with `Invoice Threads Unavailable`.
The code and the migration can therefore go out in either order.

## Regression lock

`__tests__/messenger-feed-bounded-load.test.mjs`, added to the required
Messenger step of `build-safety-gate.yml`. A 9,700-thread, six-club account
loads its main inbox with 1,454 thread-detail ids and 120 round trips in the
model (19,400 ids before). The unread threads are placed as the oldest in each
inbox and must all be returned with exact counts. Pins outside the window are
kept and a pin on a hidden or foreign thread returns nothing. An old, read
invoice that requires action is returned and ranks directly under the unread
threads. `hasOlder` is true and false where it should be, a larger window
returns the older threads, and a window that fits everything returns the same
set the unsliced feed did. The absent-function path reads every invoice; any
other failure fails closed. Club, personal, resolve and dock answers are
unchanged. Ten of the fourteen cases fail on the previous source.

`__tests__/messenger-dock-bounded-load.test.mjs` asserted that the feed was
not sliced; that case now asserts the window and the larger window.
