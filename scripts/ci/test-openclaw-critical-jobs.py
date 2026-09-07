#!/usr/bin/env python3
"""
Functional test for CRITICAL_JOBS paging in openclaw-cron-dispatcher.py.

Imports the dispatcher with network and disk side effects stubbed, then drives
_critical_record() through the sequence that matters: two failures page once,
further failures do not re-page, a 200 sends exactly one recovery, and the
next failure streak starts from zero. Run by __tests__/openclaw-critical-jobs.test.mjs.
"""
import importlib.util
import os
import sys
import tempfile
import types
from pathlib import Path

# The dispatcher imports apscheduler and requests at module level (and tries
# to pip-install apscheduler when missing). A CI runner has neither, and this
# test exercises only the pure paging logic, so stub what is absent.
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
os.environ['HOME'] = tmp                       # LOG_DIR / .env.local lookups stay in the sandbox
os.environ['OPENCLAW_ALERT_STATE'] = str(Path(tmp) / 'alert-state.json')
os.environ['CRON_SECRET'] = 'test-secret'
os.environ.pop('WORKERS_BASE_URL', None)

spec = importlib.util.spec_from_file_location('dispatcher', SRC)
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)

sent = []
d._send_sms = lambda body: (sent.append(body) or True)

PROBE = '/api/internal/login-bridge-probe'
assert PROBE in d.CRITICAL_JOBS, 'the commander login-bridge probe must be a critical job'
assert d.CRITICAL_JOBS[PROBE] == 2, 'threshold must be 2 consecutive failures'

# 1. first failure: no page, second failure: one page
d._critical_record(PROBE, False, 'HTTP 503 not configured')
assert sent == [], f'must not page on the first failure, got {sent}'
d._critical_record(PROBE, False, 'HTTP 503 not configured')
assert len(sent) == 1 and 'CRITICAL' in sent[0] and PROBE in sent[0], sent

# 2. keeps failing: no re-page
for _ in range(5):
    d._critical_record(PROBE, False, 'HTTP 503 not configured')
assert len(sent) == 1, f'must not re-page while still failing, got {len(sent)}'

# 3. recovery: exactly one recovery SMS
d._critical_record(PROBE, True)
assert len(sent) == 2 and 'RECOVERED' in sent[1], sent
d._critical_record(PROBE, True)
assert len(sent) == 2, 'a second 200 must not send a second recovery'

# 4. new streak starts from zero
d._critical_record(PROBE, False, 'TIMEOUT after 120s')
assert len(sent) == 2, 'one failure after recovery must not page'
d._critical_record(PROBE, False, 'TIMEOUT after 120s')
assert len(sent) == 3 and 'TIMEOUT' in sent[2], sent

# 5. non-critical paths are ignored entirely
d._critical_record('/api/cron/hard-stop', False, 'HTTP 500')
d._critical_record('/api/cron/hard-stop', False, 'HTTP 500')
assert len(sent) == 3, 'non-critical jobs must never page through this path'

# 6. state persisted for restart de-dup
state = d._alert_persist.get(f'critical:{PROBE}')
assert state and state.get('alert_sent') is True and state.get('consec_fail') == 2, state

# 7. THE PAGE NAMES THE FAULT THAT MOSTLY HAPPENED, NOT THE LAST ONE.
#
# 2026-09-07, /api/cron/table-socket-probe. The three failures that crossed the
# threshold were handshake_timeout, handshake_timeout, pick-table — and the SMS
# quoted only the third. The runbook sends those two outcomes to opposite ends
# of itself (pick-table to auth and club membership; handshake_timeout to the
# proxy and host saturation), so the page pointed the responder at the one
# section that had nothing to do with what was happening.
TABLE = '/api/cron/table-socket-probe'
assert d.CRITICAL_JOBS[TABLE] == 3, 'the table probe pages at three, not two'
before = len(sent)
# The real 503 body the probe returns, outcome field and all.
HANDSHAKE = ('{"status":"failed","duration_ms":15430,"failed_step":"socket",'
             '"outcome":"handshake_timeout","error":"socket never opened within 15000ms"}')
d._critical_record(TABLE, False, HANDSHAKE)
d._critical_record(TABLE, False, HANDSHAKE)
assert len(sent) == before, 'must not page before the third failure'
# "15000ms" contains "500". A substring test called that an HTTP 500 and put
# the wrong word in the page; the classifier is word-bounded now.
assert d._failure_signature(HANDSHAKE) == 'handshake_timeout', \
    d._failure_signature(HANDSHAKE)
assert d._failure_signature('HTTP 503 from upstream') == 'http_503'
d._critical_record(TABLE, False,
                   '{"status":"failed","error":"pick-table: no table this account may open '
                   'has dealt a hand in the last 10 minutes"}')
assert len(sent) == before + 1, sent
page = sent[-1]
assert 'mostly handshake_timeout' in page, f'the page must lead with the dominant outcome: {page}'
assert 'handshake_timeout x2' in page and 'pick_table x1' in page, \
    f'the page must carry the whole distribution: {page}'
assert 'pick-table' in page, f'the last body is still worth having: {page}'
# A recovery clears the distribution with the streak; the next incident must
# not inherit the previous one's outcomes.
d._critical_record(TABLE, True)
st = d._critical_state[TABLE]
assert st.get('outcomes') == [], f'recovery must clear the outcome window: {st}'

print('critical-jobs: OK (7 scenarios)')
