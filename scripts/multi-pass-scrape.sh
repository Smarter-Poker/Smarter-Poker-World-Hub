#!/usr/bin/env bash
# RUN A RESUMABLE SCRAPER AS REPEATED SHORT-LIVED PROCESSES INSIDE ONE JOB.
#
# THE PROBLEM THIS EXISTS FOR
#   poker_series_scraper.py dies partway through its cohort. Its session-drift
#   handler closes the Scrapling session and calls create_session() again, and
#   that raises:
#
#       RuntimeError: cannot start sync Playwright inside a running event loop
#           (scripts/poker_series_scraper.py:1325)
#
#   Every fetch after that returns "Context manager has been closed", the
#   circuit breaker trips, main() raises, and the step exits 1 and SMSes a
#   human. This has happened on EVERY scheduled run since 2026-08-30.
#
#   Measured on run 34750952713 (2026-09-13): the scraper reached series 81 of
#   221, wrote 921 events, then died 22 minutes into a 150-minute budget. The
#   other 128 minutes were not spent on anything. The run failed, a human was
#   paged, and 140 series went unscraped.
#
#   THE SAME SIGNATURE, AT WILDLY DIFFERENT POINTS. All six most recent runs
#   show exactly one "Drift detected" and seven RuntimeErrors, but they die
#   anywhere in the cohort:
#
#     2026-09-13  series  81/221   921 events written
#     2026-09-12  series  20/185    10 events written
#     2026-09-11  series  86/219   918 events written
#     2026-09-10  series  15/184     0 events written
#     2026-09-09  series  31/190   218 events written
#     2026-09-08  series  16/180     0 events written
#
#   Two of those six wrote nothing at all, which is why this script does not
#   simply swallow the failure: a run with no writes still exits non-zero and
#   still pages. And because a pass can end at series 15, the budget rather
#   than MAX_PASSES is what should decide how many passes run.
#
# WHY REPEATING THE PROCESS IS THE FIX AND NOT A PAPER-OVER OF ONE
#   Two facts make it a real fix rather than a retry loop:
#
#   1. A FRESH PROCESS ALWAYS HAS A CLEAN EVENT LOOP. The failure is a loop
#      left running inside THIS interpreter by Scrapling's teardown. Nothing
#      survives exec. Pass 2 starts from the same state pass 1 started from.
#
#   2. THE SCRAPER ALREADY SKIPS WHAT IT JUST DID. load_missing_series() drops
#      any series whose last_scraped is inside REFRESH_AFTER_HOURS (24h). Two
#      passes minutes apart therefore cannot repeat each other: everything
#      pass 1 wrote is fresh by definition when pass 2 builds its cohort.
#      That is not a hope about the code; the same run logs it as
#      "Skipping 84 fresh (<24h) -> 221 to scrape/refresh".
#
#   So N bounded passes complete a cohort that one pass cannot. At the measured
#   rate (~76 series / 22 min) 221 series is about three passes, roughly 70
#   minutes, inside the same budget the single pass already had.
#
#   WHAT THIS DOES NOT DO: it does not fix the restart bug. The bug is inside
#   Scrapling's session teardown, and reproducing it needs scrapling 0.4.15 +
#   camoufox against the live anti-bot sites, which is not reproducible here.
#   This makes the bug cost a pass instead of a run.
#
# WHEN IT STOPS
#   - the cohort is empty               -> every series is scraped and fresh
#   - a pass writes nothing             -> another pass would repeat it
#   - the time budget is spent          -> tomorrow's run resumes (24h window)
#   - MAX_PASSES                        -> spin guard, not a policy
#
# WHAT "PROGRESS" MEANS
#   Events confirmed written by that pass. The scraper logs them in batches as
#   it goes ("N/M events confirmed written"), so the count survives the crash
#   that ends the pass -- an end-of-run summary would not.
#
# EXIT CODE
#   0  at least one pass ran AND (the final pass ended cleanly, or something
#      was written). A productive run
#      is not a failure, and an alarm that is always on is an alarm that gets
#      muted (CLAUDE.md 10.83/10.84). A productive run whose last pass still
#      crashed gets a ::warning:: annotation, which is visible on the run page
#      without paging anyone.
#   !0 nothing was written and the last pass failed; no pass ran at all (a
#      budget too small to fit one); or ANY pass reported faults of our own -
#      a lost row, a failed upsert, a failed patch. All are worth a human, and
#      the last of those is not excused by a productive run.
#
# USAGE
#   BUDGET_MIN=145 scripts/multi-pass-scrape.sh python3 scripts/x.py --pass-limit 1
#   Do NOT pass --max-minutes yourself; each pass is given what is left.

set -uo pipefail

BUDGET_MIN="${BUDGET_MIN:-140}"      # total wall-clock minutes for all passes
MAX_PASSES="${MAX_PASSES:-20}"       # spin guard only. The budget is the real
                                     # limit: a pass costs ~6 min of catalog
                                     # and cohort loading before its first
                                     # series, so BUDGET_MIN caps the count
                                     # long before this does.
MIN_PASS_MIN="${MIN_PASS_MIN:-15}"   # a pass spends ~6 min loading before its
                                     # first series; below this it is all setup
# Progress signals, as ASCII (the real log line uses a unicode arrow; matching
# only the ASCII tail keeps this locale-proof).
EVENTS_RE="${EVENTS_RE:-[0-9]+/[0-9]+ events confirmed}"
COHORT_RE="${COHORT_RE:-[0-9]+ to scrape/refresh}"
# The scraper separates ITS OWN faults from the world's, and fails hard on the
# former: "a lost row, a failed upsert or a failed patch is a defect in this
# repo". This script must not launder that verdict - see OUR OWN FAULTS below.
OURS_RE="${OURS_RE:-Run completed WITH ERRORS OF OURS}"

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <scraper command> [args...]" >&2
  exit 2
fi

LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/multi-pass.XXXXXX")"
trap 'rm -rf "$LOG_DIR"' EXIT

DEADLINE=$(( $(date +%s) + BUDGET_MIN * 60 ))
total_events=0
passes=0
last_rc=0
ours_fault=0
ours_detail=""
stop_reason="MAX_PASSES ($MAX_PASSES) reached"

echo "== multi-pass scrape: up to $MAX_PASSES passes inside ${BUDGET_MIN}m =="
echo "== command: $* (--max-minutes is supplied per pass) =="

for pass in $(seq 1 "$MAX_PASSES"); do
  now=$(date +%s)
  left=$(( (DEADLINE - now) / 60 ))
  if [ "$left" -lt "$MIN_PASS_MIN" ]; then
    stop_reason="time budget spent (${left}m left, a pass needs ${MIN_PASS_MIN}m)"
    break
  fi

  log="$LOG_DIR/pass-$pass.log"
  echo ""
  echo "---- pass $pass of at most $MAX_PASSES, up to ${left}m ----"

  # NO PER-PASS HARD KILL. A `timeout` wrapper was written and then removed:
  # timeout(1) is GNU coreutils, absent on the Macs these scripts also run on,
  # so the kill path could not be exercised before shipping. The step's own
  # `timeout-minutes` is the backstop for a hung pass, which is where that job
  # already sits today -- so there is nothing lost, only an untested branch.
  "$@" --max-minutes "$left" 2>&1 | tee "$log"
  last_rc=${PIPESTATUS[0]}
  passes=$pass

  wrote=$(grep -oE "$EVENTS_RE" "$log" 2>/dev/null | cut -d/ -f1 \
          | awk '{s+=$1} END {print s+0}')
  # THE PASS PRINTS ITS COHORT TWICE: once when it builds it, and again at the
  # end when it re-reads what is left. Taking only the last one and calling it
  # "at start" hid the very thing this script is judged on.
  #
  # MEASURED, scheduled run 34833374303: pass 1 really went 214 -> 180 (34
  # series finished, 959 events), and pass 2 really started at 180. Both passes
  # reported "cohort at start: 180", so the run read as "the cohort never
  # shrinks, the wrapper is achieving nothing" - a conclusion I drew myself
  # from this line before checking the scraper's own log.
  #
  # So: FIRST reading is the start, LAST reading is what is left. The
  # empty-cohort stop still tests the last one, which is the only one that can
  # answer "is there anything remaining".
  cohort_start=$(grep -oE "$COHORT_RE" "$log" 2>/dev/null | head -1 | cut -d' ' -f1)
  cohort=$(grep -oE "$COHORT_RE" "$log" 2>/dev/null | tail -1 | cut -d' ' -f1)
  total_events=$(( total_events + wrote ))
  if grep -qE "$OURS_RE" "$log" 2>/dev/null; then
    ours_fault=1
    ours_detail=$(grep -oE "$OURS_RE.*" "$log" 2>/dev/null | tail -1)
  fi

  echo "---- pass $pass: exit $last_rc, ${wrote} event(s) written" \
       "(total $total_events), cohort ${cohort_start:-unknown} -> ${cohort:-unknown} ----"

  # An empty cohort is the end of the work, not progress toward it. Tested:
  # without this, a shrink from 69 to 0 reads as progress and buys one more
  # pass that loads the catalog for nothing.
  if [ "${cohort:-}" = "0" ]; then
    stop_reason="the cohort is empty - every series is scraped and fresh"
    break
  fi

  # Progress is events written by THIS pass, and nothing else.
  #
  # A first version also treated a shrinking cohort as progress. That is an
  # off-by-one: the cohort a pass STARTS from is the product of the pass
  # before it, so "pass 2 started from 145 instead of 221" credits pass 2 with
  # pass 1's work. Tested, and it bought a stalled run one extra pass every
  # time before noticing.
  #
  # WHAT THE SINGLE SIGNAL COSTS: a pass that advances through series which
  # genuinely have no events writes nothing and stops the loop, leaving the
  # rest of the cohort for the next run. That is exactly where those series
  # already stand today, so it is not a regression -- and the alternative is
  # guessing, which is how a loop spends a whole budget on nothing.
  if [ "$wrote" -eq 0 ]; then
    stop_reason="pass $pass wrote nothing; another pass would repeat it"
    break
  fi
done

echo ""
echo "=============================================================="
echo "multi-pass scrape: $passes pass(es), $total_events event(s) written"
echo "stopped because: $stop_reason"
echo "last pass exit code: $last_rc"
echo "=============================================================="

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo ""
    echo "### Multi-pass scrape"
    echo ""
    echo "- passes: **$passes**"
    echo "- events written across passes: **$total_events**"
    echo "- stopped because: $stop_reason"
    echo "- last pass exit code: $last_rc"
  } >> "$GITHUB_STEP_SUMMARY" 2>/dev/null || true
fi

# Zero passes means the budget could not fit one. Nothing was scraped, so this
# is a configuration fault, not a quiet success. Tested: BUDGET_MIN below
# MIN_PASS_MIN used to exit 0 having done literally nothing.
if [ "$passes" -eq 0 ]; then
  echo "::error title=No scrape pass ran::BUDGET_MIN=${BUDGET_MIN}m cannot fit one" \
       "pass of MIN_PASS_MIN=${MIN_PASS_MIN}m. Nothing was scraped."
  exit 1
fi

# OUR OWN FAULTS ARE NOT FORGIVEN BY A PRODUCTIVE RUN.
#
# MEASURED, run 34799912678 (2026-09-14, the first run of this script): pass 2
# ended "Run completed WITH ERRORS OF OURS: {'upsert_failed': 0, 'rows_lost': 0,
# 'patch_failed': 2, ...}" and exited 1. Pass 1 had written 139 events, so the
# rule below this one turned that into a green step. Two rows the scraper
# failed to write went unreported, and the scraper's own unconditional rule -
# "a lost row, a failed upsert or a failed patch is a defect in this repo" -
# was silently overridden by the wrapper wrapping it.
#
# The crash this script exists for leaves no such verdict: it is an uncaught
# RuntimeError, so the exit gate never runs and this line never appears. That
# is exactly what makes the two distinguishable, and why the forgiveness below
# can stay narrow instead of swallowing everything non-zero.
if [ "$ours_fault" -eq 1 ]; then
  echo "::error title=The scraper reported faults of ours::$ours_detail" \
       "($passes pass(es), $total_events event(s) written). A productive run" \
       "does not excuse a row this repo failed to write."
  exit 1
fi

if [ "$last_rc" -eq 0 ]; then
  exit 0
fi
if [ "$total_events" -gt 0 ]; then
  echo "::warning title=Scrape finished with a failed pass::$passes pass(es) wrote" \
       "$total_events event(s); the last pass exited $last_rc. Not failing the job:" \
       "the run was productive and the next run resumes from here."
  exit 0
fi
echo "::error title=Scrape wrote nothing::$passes pass(es) wrote no events;" \
     "last pass exited $last_rc."
exit "$last_rc"
