# National coverage research corpus (2026-08-14)

Produced by a 5-agent web-research swarm (PokerAtlas region pages + venue sites +
PokerNews/CardPlayer, all fetched live 2026-08-14) and diffed against production.

- `national-rooms-2026-08.json` — 272 US rooms verified to run recurring
  tournaments: [name, city, state, pokeratlas_slug, venue_type]. 235 were already
  in poker_venues; **37 were missing and inserted** (see
  national-rooms-added-2026-08-14.json). New venues enter the daemon's 14-day
  unproven-retry cohort automatically.
- 12 tours added to tour_source_registry (MONEYMAKER, PSOPEN, AUPT, LIPS, RRPT,
  WPTPRIME, CLUBWPTG, TPO, BPO, WTP, FPN, EASTERNPT) with schedule URLs.
  Registry: 14 → 26 tours. Dormant/dead tours deliberately NOT added: HPT,
  DeepStacks, Run It Up, PPC, PNIA (verified dormant 2026-08).
- Series research (60+ recurring venue series with months + schedule URLs) is in
  the session report; hosts are all in poker_venues, so their series surface via
  the tour/series scrapers as stops are published.

Notable closures verified during the sweep (do NOT re-add): Sahara LV poker
(Nov 2025), Resorts World LV poker (Mar 2026), Seneca Niagara, Bellagio dailies
(Aug 2026), Golden Nugget LV dailies paused, WinStar room temp-closed Aug 2026.
