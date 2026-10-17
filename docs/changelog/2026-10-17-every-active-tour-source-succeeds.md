# Every Active Tour Source Succeeds

**Date:** 2026-10-17 (Dan: "go ahead and finish all of these up")

`scripts/tour_stealth_scraper.py` (the local tours runtime) exits 1 when any
active `tour_source_registry` source yields no certifiable stop. 12 of 26 did
on every run, so the job never exited 0.

## Seven sources now parse their official page

Every new parser refuses a yearless date unless the source itself certifies
the year. Stale yearless copy is never rolled forward into the current year.

| Source | Official page | How the year is certified |
|---|---|---|
| MSPT | `msptpoker.com/` (the old `/schedule/` is 404) | The UPCOMING EVENTS list is chronological. Every year it prints ("2027 Diamond Poker Championship") must agree, or nothing is used. "Dates TBD" rows are skipped. |
| LIPS | `lipstour.com/schedule/` | The printed weekday ("Fri, 16 Oct"). Online events are skipped. |
| BORGATA | `borgata.mgmresorts.com/en/casino/poker.html` (the old URL redirects there) | Every weekday/date pair in the card's linked schedule PDF ("WED NOV 4") must certify one year. |
| WYNN | `wynnlasvegas.com/casino/poker` | The series card's own copy or the carousel label must state exactly one year. |
| AUPT | `anteupmagazine.com/where-to-play/tour/` | The page's single season statement ("The 2026 Ante Up Poker Tour"). |
| BPO | `barpokeropen.com/championship` | The championship title year must equal the hero date's year. |
| WTP | `worldtavernpoker.info/open-2026` (the WTP OPEN page) | The title year must equal the announced date's year. |

`weekday_certified_year` accepts only the one year in previous/current/next
whose calendar puts the printed weekday on that date. A weekday shifts by one
or two days a year, so three neighbouring years never share it.

## Five sources are marked manual, with the reason

Migration `20261017131153` (applied 13:11 UTC) sets `scrape_method = 'manual'` (and the reason in
`last_error` and `notes`). The collector now skips manual sources.
`is_active` is untouched, so every tour stays listed on the site. The
migration changes no `tour_stop_events` row.

- **NAPT** (`defunct`): `pokerstarslive.com/napt/` and `/napt/schedule/` return 404, and the PokerStars Live calendar lists no NAPT stop.
- **CPPT** (`defunct`): `cardplayerpokertour.com` redirects to the cardplayer.com home page, which has no CPPT schedule.
- **LODGE** (`manual`): the official LCS page lists only the 2026 series (Feb 22 to Mar 9, 2026).
- **TPO** (`manual`): the official page lists only the 2026 edition (Apr 29 to May 11, 2026).
- **FPN** (`manual`): only weekly bar-league games and qualifiers are published, and its championships are dated TBD.

To re-enable a source, set `scrape_method` back to `puppeteer` once its
official page publishes a dated schedule.

## No duplicate of a curated stop

When a `manual_research` row on the same tour already has the same start and
end dates, the collector does not insert an inferred copy under the source's
own name.

Tests: `scripts/test_tour_stealth_scraper.py` (`OfficialSourceParserTests`,
`TourSourceRegistryMigrationTests`).
