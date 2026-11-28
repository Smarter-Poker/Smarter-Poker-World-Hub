#!/usr/bin/env python3
"""
Functional test: a route that skips its work during the engine maintenance
break never has an Open Claw tick inside that break.

Imports the dispatcher with network and scheduler modules stubbed (the same
way test-openclaw-critical-jobs.py does) and proves:
  1. the shipped schedule passes _validate_break_clear_schedules();
  2. the pre-fix schedule ('*/15') is refused, naming minute 0;
  3. a break-clear job missing from the schedule is refused;
  4. with no tick ever lost to a scheduled break, the worst-case hand-index
     lag (largest gap between ticks + the index's 5-minute cushion + the
     route's whole-handler budget) stays under ClubArenaStatsIndexLag's
     30-minute threshold, while the pre-fix schedule with its :00 tick lost
     exceeds it (35 minutes), which is what fired after every cutover.
Run by __tests__/openclaw-break-clear-ticks.law.test.mjs.
"""
import importlib.util
import os
import sys
import tempfile
import types
from pathlib import Path


def _stub(name, **attrs):
    if name in sys.modules:
        return
    try:
        __import__(name)
    except Exception:
        m = types.ModuleType(name)
        for k, v in attrs.items():
            setattr(m, k, v)
        sys.modules[name] = m


_stub('requests', get=lambda *a, **k: None, post=lambda *a, **k: None,
      exceptions=types.SimpleNamespace(Timeout=type('Timeout', (Exception,), {})))
_stub('apscheduler')
_stub('apscheduler.schedulers')
_stub('apscheduler.schedulers.blocking', BlockingScheduler=object)
_stub('apscheduler.triggers')
_stub('apscheduler.triggers.cron', CronTrigger=object)

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'scripts' / 'openclaw-cron-dispatcher.py'

tmp = tempfile.mkdtemp()
os.environ['HOME'] = tmp
os.environ['OPENCLAW_ALERT_STATE'] = str(Path(tmp) / 'alert-state.json')
os.environ['CRON_SECRET'] = 'test-secret'
os.environ.pop('WORKERS_BASE_URL', None)

spec = importlib.util.spec_from_file_location('dispatcher', SRC)
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

ROUTE = '/api/cron/club-stats-maintenance'
LAG_THRESHOLD_S = 30 * 60          # STATS_INDEX_LAG_THRESHOLD_S, Club Arena StatsHealthMonitor.ts
INDEX_CUSHION_S = 5 * 60 + 30      # measured ceil_at lag behind each run: 5m 20s - 5m 27s
HANDLER_BUDGET_S = 90              # HANDLER_BUDGET_SECONDS in the route

assert ROUTE in d.BREAK_CLEAR_JOBS, 'club-stats-maintenance must be a break-clear job'
assert {58, 59, 0, 1, 2, 3}.issubset(d.MAINTENANCE_BREAK_MINUTES), \
    'the break window must cover the :58 announcement through the :03:42 thaw'

# 1. The shipped schedule passes.
d._validate_break_clear_schedules()

entries = [kw for path, kw in d.ALL_CRONS if path == ROUTE]
assert len(entries) == 1, f'expected one registration of {ROUTE}, found {len(entries)}'
ticks = sorted(d._cron_minutes(entries[0]['minute']))
assert len(ticks) == 4, f'cadence must stay four ticks an hour, got {ticks}'
assert not set(ticks) & d.MAINTENANCE_BREAK_MINUTES


def worst_lag_s(tick_minutes, lost=()):
    kept = sorted(set(tick_minutes) - set(lost))
    gaps = [(kept[(i + 1) % len(kept)] - kept[i]) % 60 or 60 for i in range(len(kept))]
    return max(gaps) * 60 + INDEX_CUSHION_S + HANDLER_BUDGET_S


# 4. Worst-case lag: shipped schedule loses no tick to a scheduled break.
lost_now = [m for m in ticks if m in d.MAINTENANCE_BREAK_MINUTES]
assert lost_now == []
assert worst_lag_s(ticks) < LAG_THRESHOLD_S, worst_lag_s(ticks)

# 2. The pre-fix schedule is refused, and reproduces the 35-minute lag.
pre_fix = [(ROUTE, dict(minute='*/15'))]
try:
    d._validate_break_clear_schedules(pre_fix)
    raise AssertionError("pre-fix '*/15' schedule was accepted")
except RuntimeError as e:
    assert 'minute(s) [0]' in str(e), str(e)
pre_ticks = d._cron_minutes('*/15')
pre_lost = sorted(pre_ticks & d.MAINTENANCE_BREAK_MINUTES)
assert pre_lost == [0], pre_lost
assert worst_lag_s(pre_ticks, pre_lost) > LAG_THRESHOLD_S, worst_lag_s(pre_ticks, pre_lost)

# 3. A break-clear job dropped from the schedule is refused.
try:
    d._validate_break_clear_schedules([])
    raise AssertionError('missing break-clear job was accepted')
except RuntimeError as e:
    assert 'not scheduled' in str(e), str(e)

# Expansion sanity for the field shapes the dispatcher uses.
assert d._cron_minutes(7) == {7}
assert d._cron_minutes('7,22,37,52') == {7, 22, 37, 52}
assert d._cron_minutes('*/20') == {0, 20, 40}
assert d._cron_minutes('5-7') == {5, 6, 7}

print(f'break-clear-ticks: OK ticks={ticks} worst_lag_s={worst_lag_s(ticks)} '
      f'pre_fix_worst_lag_s={worst_lag_s(pre_ticks, pre_lost)}')
