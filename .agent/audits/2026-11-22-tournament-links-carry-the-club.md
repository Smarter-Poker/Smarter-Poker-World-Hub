# 2026-11-22: /t/ passes the club code on to Club Arena

**What a player saw.** A friend who was signed in but not yet a member of the
club opened a shared Club Arena tournament (`smarter.poker/t/<id>`) and landed
on "Tournament Not Found" with no way to join the club or register.

**Cause.** `pages/t/[id].js` sent everyone to
`clubArenaTournamentPath(id)` = `/hub/club-arena/tournaments/<id>` with no
query, while `/g/[id]` forwards `i`, `cluster` and `invite`. A tournament is
readable only inside its club, so Club Arena needs the sender's club code to
offer the join step.

**Fix.** `getServerSideProps` reads the query through `/g/`'s own
`sanitizeShareParams` (`src/lib/sharedGameLink.js`), and
`clubArenaTournamentPath(id, params)` (`src/lib/sharedTournamentLink.js`)
forwards `i` (the club invite code) and `invite` (a seat-hold token) and
nothing else. `cluster` is a cash game and is not forwarded. The preview card,
its metadata, the Register button's label and the 60 second cache are
unchanged: the code changes where the button and the signed-in redirect go,
not what the card says.

The matching Club Arena change (branch `claude/tournament-links-carry-the-club`,
`docs/changelog/2026-11-22-a-tournament-link-carries-the-club.md`) puts `?i=`
on every tournament link and reads it on the tournament page.

**Order.** Either repository can deploy first. Before Club Arena ships, its
links carry no `i` and this page forwards nothing, as today. Before this page
ships, Club Arena's links carry `i` and this page drops it, as today.

**Pinned by** `__tests__/shared-tournament-links.test.mjs`: the forwarded keys
and their normalisation, repeated keys, `cluster` and arbitrary keys dropped,
malformed codes refused, and the page reading `sanitizeShareParams(query)` and
building its target from it. Both new pins fail with the fix removed.
