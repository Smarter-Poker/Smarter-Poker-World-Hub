# World Hub Sweep Fixes

**Date:** 2026-10-17

Dan asked for every bug, gap, stub, error, regression and wiring issue to be found and fixed.
These are the World Hub ones, each checked against production data first.

- **Friends counted every row.** PostgREST returns at most 1,000 rows whatever `.limit()` asks for,
  so a player with 1,118 friends and 1,121 followers saw 1,003 and 1,000. `/api/friends` now reads
  each relationship list a page at a time on a unique order, resolves profiles six chunks at a time
  instead of one after another, and treats a read error as an error rather than a shorter list. The
  page draws 60 cards at a time with Show More, the tab strip wraps at 393px, the search placeholder
  fits, and two emoji left the source.
- **Addresses keep their case.** The World copy policy Title Cased the Shark Club share link into
  `Https://Smarter.Poker/Hub/Social-Pages/...`. Web addresses, emails, handles and paths are now
  printed as written, and the share box is marked to preserve case.
- **Diamond Wallet Stats reconcile.** Top Sources merged earned and spent buckets, so it listed
  spending as sources and its donut totalled 959,253 against Earned 719,606 and Spent 260,869. Sources
  are now credits, a new Top Spending list is debits, and the donut is every earned bucket, so it adds
  up to Total Earned. Month on month keeps one decimal rounded down ("Up 0.1%", not "Up 0%" for
  +0.18%) and says "No Prior Month To Compare" when there is none. Ledger rows say "Balance", not
  "Bal:", and an ISO date in a row reads "Oct 14, 2026".
- **No training grade without graded hands.** A stored "F" sat beside "No Graded Sessions Yet".
- **Conversation previews are plain text.** Markdown markers and pictographs are removed from the
  preview (the message itself is unchanged); call receipts and live invites read in words.
- **Digest figures carry separators.** The Weekly Revenue Digest prints 1,536,191.30, not 1536191.30.
- **PokerAtlas fetches have a deadline.** A fetch on a closed Playwright driver hung the daemon at
  99% CPU from 2026-10-15 22:34 UTC; it ignored its stop signal and held the writer lock. A closed
  driver connection now marks the session dead, and every fetch arms the same hard-kill timer the
  connect step already had, so the supervisor restarts the process.
- **Lint is green.** `usePreset` in PokerCardPicker was a plain function with a hook's name.
- **The venue share card no longer asks for a font it lacks.** The check mark is drawn.
