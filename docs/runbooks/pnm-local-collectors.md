# Poker Near Me local collector installation

The existing tour, daily-tournament and series LaunchAgents run immutable protected
source through `scripts/local_scraper_runtime.py`. PokerAtlas retains its
separate existing generation. This does not create another business schedule.

Use the configured external Python environment and a protected full revision:

```sh
python3 scripts/local_scraper_runtime.py install \
  --component tours \
  --repository "$PWD" --revision <protected-full-sha> \
  --root /Volumes/SmarterArchives/agent-evidence/extreme-archive/production-runtimes/pnm/tours \
  --state /Volumes/SmarterArchives/agent-evidence/extreme-archive/production-runtimes/pnm/tours/state \
  --inputs "$PWD/data" \
  --python /Users/smarter.poker/.local/share/smarter-poker-venv/bin/python3 \
  --credential-store /Users/smarter.poker/.local/share/smarter-poker-runtimes/pokeratlas
```

For the daily collector replace component `tours` and both component directory
segments with `tournaments`. The installer references the canonical credential
store internally, validates project and permissions, and never copies secrets.
Do not source environment files or print credential contents.

For the series collector use component/directory `series`. Its maintained
catalog inputs are `master_poker_series_list.json` and `all-venues.json`;
the runner preserves `--daemon` and the existing six-hour business loop.

Create each component's `tmp` and existing log directory on the SSD before
loading its maintained plist. Install the checked-in
`scripts/com.smarter-poker.tour-scraper.plist` and
`scripts/com.smarter-poker.tournament-schedule-daemon.plist` and
`scripts/com.smarter-poker.series-scraper.plist` into their existing
LaunchAgent registrations only after protected integration. Preserve the tour
three-day interval and the daily collector's existing daemon behavior.
Do not start a second writer or alter another scraper's registration.

Run the installed runner's `check --root <component-root>`, verify launchd's
actual command and PID, then require collector persistence/readback and affected
public API behavior. A running process or current heartbeat alone is not proof
of fresh source coverage. Successful tour jobs exit rather than looping.

Unknown event prices, games, durations and locations remain unknown. Explicit
tour-stop summaries are distinct from individual events. Date-less source
entries and guessed-year promotions are rejected. PokerAtlas remains catalog
data, not running-table activity; Bravo live remains intentionally disabled.

Runtime roots contain installed production code/state and must be retained.
They live on the retained SSD2 archives volume, under
`/Volumes/SmarterArchives/agent-evidence/extreme-archive/production-runtimes/pnm`
(series, tours, tournaments and the shared `pdf-packages`), never in an
`agent-work` scratch tree. On 2026-11-16 between 22:45 and 23:35 Chicago the
SSD1 agent-work tree lost 498 of its 501 folders, including the three runtimes
then installed at `/Volumes/SmarterWork/agent-work/pnm-production-runtimes-20261009`,
and the collectors stayed down for eleven hours. `install` now refuses a root,
state or Python path whose given or resolved spelling passes through
`agent-work` or `.agent-trees` (`production_runtime_in_scratch_agent_work`).
Install the PDF adapters with
`<venv python> -m pip install --target <production root>/pdf-packages -r scripts/pnm-pdf-requirements.txt`
using an SSD TMPDIR and cache.
Remove only the delivery worktree, dependencies and task-owned scratch after
publication, not these registered production roots or their credential store.
