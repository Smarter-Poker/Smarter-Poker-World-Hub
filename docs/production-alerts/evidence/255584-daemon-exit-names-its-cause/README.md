# 255584: a PokerAtlas collector exit names its cause

Rows: 255584 (2026-10-17T00:54:30Z) and the 2026-10-09T23:28:19Z twin, both
`LocalScraperRuntimeFailure` from `local.pokeratlas-runtime`, `failure_code`
`daemon_exited_0`, release `a468fc27`.

## Finding (read from main d6af92f9)

- `scripts/pokeratlas-live-daemon.py` `main()` returned 0 on two unrelated paths:
  (a) `_acquire_daemon_lock()` found the writer lock (`data/pokeratlas-logs/daemon.lock`,
  shared across releases because each release's `data/` is a symlink to the one
  state dir) already held by another process; (b) a SIGTERM/SIGINT reached the
  daemon and its loop shut down.
- `scripts/local_scraper_runtime.py` `run_logged()` treats a stop it forwarded as a
  stop (`terminating`), so (b) under the runner means a signal from somewhere
  other than the supervisor. Every other exit became `daemon_exited_<status>`, so
  (a) and (b) both arrived as `daemon_exited_0`.
- The store therefore cannot say which happened on 10-09 or 10-17, and the daemon
  log on the owner's Mac (not readable from a cloud lane) was the only witness.

## Change

- Daemon: lock held elsewhere -> exit 75 (`EXIT_WRITER_LOCK_HELD`), logging the
  holder PID it wrote into the lock file; a stop signal -> exit `128 + signum`;
  `sys.exit(main())`. A clean run without a signal stays 0.
- Runner: `exit_fault()` maps 75 -> `daemon_writer_lock_held_elsewhere`,
  `128+n` -> `daemon_stopped_by_signal_<NAME>`, a negative Popen status ->
  `daemon_killed_by_signal_<NAME>`; anything else keeps `daemon_exited_<status>`.

## Proof (local, Python 3.11 + python-dotenv 1.2.2 + patchright 1.58.2)

| suite | pre-fix code | fixed code |
| --- | --- | --- |
| `scripts/test_local_scraper_runtime.py` | 41 ran, 3 failed + 2 errors (the 5 new tests) | 41/41 OK |
| `scripts/test_pokeratlas_persistence.py` | 41 ran, 3 errors (the 3 new tests) | 41/41 OK |
| `scripts/test_operational_alerts.py` | - | OK |
| `__tests__/poker-near-me-emergency-truth.test.mjs` | - | 18/18 |

## What this does not do

It does not establish which path caused 10-17; that evidence was never recorded.
It makes any recurrence self-attributing, so 255584 stays `investigating` until
the change is installed on the Mac (`local_scraper_runtime.py install` at a
revision containing it) and a recurrence, or 14 quiet days on the new release,
is read.
