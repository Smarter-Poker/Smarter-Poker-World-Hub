# Messenger and Club Data audit, pass 3

Date: 2026-08-21
Follows: `2026-08-21-messenger-audit-pass-2.md`

Third pass. Two real defects on the Club Data screen, two performance/hygiene
fixes in the messenger, and two things the previous passes flagged as bugs that
turned out **not** to be bugs — recorded here so nobody "fixes" them later.

---

## 1. Closed the open caveat from pass 2

Pass 2 ended saying the statement thread's visibility was proven at the data
layer but not through the UI, and that the next thing to check would be whether
the Club Arena drawer offers the club identities at all.

It does. `/api/social/pages?owner_id=…&include_memberships=true` returns all
four identities against production:

```
The Midway Club  home_game
Club JAQK        club   linked a0000000-…-000000000001
SHARK CLUB       club   linked a41434bb-…
Midway Union     club   linked fade0000-…
```

So the chain is verified end to end: pages → identity switch sets
`contextEntityId` → `fn_get_user_conversations` returns
`"Midway Union Statements" (is_group, other_user_id null)` → the row renders by
title → `get-messages` returns `message_type 'invoice'` with
`metadata.kind 'union_invoice'` and a full `lines` object → statement card.

## 2. Club Data could hang forever

`resolveClubUUID` returning **null** — a club code matching nothing, a deleted
club — left `clubUuid` null with no error set. `load()` bails on `!clubUuid`
*before* its `try/finally`, so `loading` was never cleared: skeleton rows
shimmering indefinitely, no message, no way out.

This is the third instance of the same shape in this codebase (the messenger's
"Loading your clubs…", `ClubMessagesPage`'s endless shimmer, now this). The
pattern is always: an async resolve that can end in "nothing found" without
that outcome being represented in state.

Fixed: the resolver now always ends in either a uuid or an error, and the
skeleton no longer renders underneath an error.

## 3. The CSV export was quietly truncated

The screen holds one page of rows (200); a fourteen-day window can hold
thousands — the footer already said "showing 200 of 2476". Export took whatever
was on screen and wrote it to a file named for the whole period. On a page whose
numbers are used to settle money, handing someone a partial file that looks
complete is the worst kind of wrong.

Export now re-fetches at the RPC's 500-row ceiling and, when even that is not
the whole set, says so on screen rather than silently shipping a partial file.

## 4. Two queries per message, for a number that rarely changes

The message-request count effect ran **two** Supabase queries and was keyed on
`conversations` — an array that gets a new identity on every incoming message,
every preview update, every 30-second poll tick and every re-sort. A busy inbox
was issuing two extra round trips per message.

Now keyed on the sorted conversation id set, which is stable across reorders and
rebuilds, so it re-runs when the set of conversations actually changes.

## 5. A dead dynamic import

`JarvisMessengerWidget` was declared with `dynamic()` at the top of
`messenger.js` and **never rendered** anywhere in the page's 5,000 lines. It
only kept a chunk in the graph. Removed. The Jarvis conversation itself is
handled inline in `handleSelectConversation`'s `isJarvis` branch and is
untouched.

## 6. Two things that are NOT bugs

Recorded because earlier reconnaissance flagged both, and acting on either
would have been wrong.

**`/api/social/pages` is not leaking per-user data through the CDN.** The
handler set `Cache-Control: public, s-maxage=60` on GET, which reads alarming
next to per-user `unread_count`. It never took effect: `vercel.json` applies
`no-store, no-cache, must-revalidate` to `/api/(.*)`, and that wins. Verified
against production — both the public shape and the `owner_id` shape return
`no-store`. The stale line was removed anyway, because a future path-specific
rule for that endpoint would have made it real.

**`pages/api/debug/check-messages.js` and `test-messaging.js` are not shipped
debug routes.** Both were already reduced to a 410 stub by someone else. Pass 1
listed them as a finding; that was wrong.

**`PlayerStatusService.shareProfileToConversation` writes to the dead
`messages`/`conversations` family**, but it is a dead method: none of the three
live consumers (`PublicProfilePage`, `TablePage`, `FriendsPage`) call it. Not a
live defect — dead weight to remove alongside the rest of `MessagingService`'s
dead half.

## 7. Verification

- Club Arena: `tsc --noEmit` exit 0 zero errors, `vite build` exit 0,
  ClubDataPage chunk emitted.
- Both changed Hub files parse under esbuild.
- Production served `fb5f7779` (group-thread visibility) and then `2277ba40`
  (this pass's Hub changes); the Club Arena fix `f0fb9c37e` is in Club Arena
  `main` and ships with the next build sync.
- `/api/social/pages` checked live against production, not inferred.

## 8. Still open

Unchanged from pass 2, plus one:

1. `pages/api/messenger/broadcast-message.js` still has no caller.
2. The in-game table messenger holds 0 messages; scheduling now delivers into
   it, but nothing has ever been sent through it.
3. `MessagingService.ts` still carries ~1,200 lines of dead DB methods behind
   three live helpers — extracting the helpers would let the rest go.
4. `toISODate` uses the UTC date, so a user well behind UTC late in the evening
   sees "today" roll a day early on the Club Data range. Cosmetic, but it will
   confuse someone eventually.
