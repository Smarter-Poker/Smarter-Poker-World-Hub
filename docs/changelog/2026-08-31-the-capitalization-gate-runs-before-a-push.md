# The Capitalization Gate Runs Before A Push

**2026-08-31**

Dan: "MAKE SURE THE FIRST LETTER OF EVERY WORD ON EVERY SINGLE PAGE AND SUB PAGE
IS CAPITALIZED AND REMOVE ANY AND ALL M BARS."

Both halves of that instruction now have a gate on the apex site. They were not
being asked at the same time.

`check-ui-text` (em dashes) runs in `.husky/pre-push` and in CI.
`check-title-case` ran only in CI.

So the em dash rule was answered before a push and the capitalization rule only
after one - a developer learned about the second a minute later than the first,
on a branch that was already on the remote. Both gates are cheap and both read
the same files, so there is no reason for that gap.

`check-title-case` is now wired into `.husky/pre-push` beside `check-ui-text`.

## Verified

Both gates pass on `main` as it stands:

```
check-title-case: OK - every word on every page starts with a capital.
check-ui-text: OK - no em dashes in UI text (3111 files scanned).
```

Wiring an already-passing gate into the hook changes no source and blocks
nothing that was not already blocked in CI - it only moves the moment the answer
arrives.
