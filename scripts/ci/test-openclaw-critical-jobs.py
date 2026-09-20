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

transport = d._send_sms
sent = []
d._send_sms = lambda body, **kwargs: (sent.append(body) or True)

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

# 8. A LONG OUTAGE NEVER GOES QUIET.
#
# 2026-09-12 to 2026-09-18: the Club Commander login-bridge probe failed every
# hour for six days because the Supabase service-role key had stopped being
# registered for the project. It paged ONCE, on the second hour, and then the
# dispatcher only logged. One missed SMS was the whole warning anyone got, and
# the key stayed dead until a person happened to look.
#
# A still-failing episode now re-pages on an escalating ladder: +1h, +4h, then
# daily. Elapsed time is simulated by moving last_page_at backwards, so the
# test is deterministic and takes no wall-clock time.
d._send_sms = lambda body, **kwargs: (sent.append(body) or True)
d._critical_record(PROBE, True)              # close any open episode
sent.clear()

d._critical_record(PROBE, False, 'HTTP 500 Unregistered API key')
d._critical_record(PROBE, False, 'HTTP 500 Unregistered API key')
assert len(sent) == 1 and 'CRITICAL' in sent[0], sent
st = d._critical_state[PROBE]
assert st['pages_sent'] == 1, st
assert st['failing_since'] > 0, 'the episode start must be recorded'

# Still failing a minute later: no second page.
d._critical_record(PROBE, False, 'HTTP 500 Unregistered API key')
assert len(sent) == 1, f'must not re-page a minute after the first page: {sent}'

# An hour later: the first re-page, and it says how long it has been failing.
st['last_page_at'] -= 3601
st['failing_since'] -= 3601
d._critical_record(PROBE, False, 'HTTP 500 Unregistered API key')
assert len(sent) == 2, f'must re-page an hour after the first page: {sent}'
assert 'STILL FAILING' in sent[1], sent[1]
assert ' for 1h' in sent[1], f'the re-page must carry the duration: {sent[1]}'
assert 'Runbook:' in sent[1], 'the re-page must still name the runbook'
assert st['pages_sent'] == 2, st

# The ladder widens: an hour after the second page is NOT enough.
st['last_page_at'] -= 3601
d._critical_record(PROBE, False, 'HTTP 500 Unregistered API key')
assert len(sent) == 2, f'the second rung is four hours, not one: {sent}'

# Four hours after the second page: the third.
st['last_page_at'] -= (14400 - 3601 + 1)
d._critical_record(PROBE, False, 'HTTP 500 Unregistered API key')
assert len(sent) == 3, f'must re-page four hours after the second page: {sent}'
assert st['pages_sent'] == 3, st

# And it holds at daily forever after, rather than going silent or storming.
st['last_page_at'] -= 14401
d._critical_record(PROBE, False, 'HTTP 500 Unregistered API key')
assert len(sent) == 3, f'the third rung is a day: {sent}'
st['last_page_at'] -= (86400 - 14401 + 1)
st['failing_since'] -= 86400 * 6
d._critical_record(PROBE, False, 'HTTP 500 Unregistered API key')
assert len(sent) == 4, f'must re-page daily while it stays broken: {sent}'
assert 'd' in sent[3].split(' for ')[1][:4], f'a six-day fault must say so: {sent[3]}'

# 9. The ladder state survives a restart, and recovery clears it.
persisted = d._alert_persist.get(f'critical:{PROBE}')
assert persisted.get('pages_sent') == 4, persisted
assert persisted.get('last_page_at'), persisted
assert persisted.get('failing_since'), persisted
rehydrated = d._alert_bind(f'critical:{PROBE}', {'consec_fail': 0, 'alert_sent': False,
                                                 'outcomes': []})
assert rehydrated['pages_sent'] == 4, rehydrated
assert rehydrated['last_page_at'] == persisted['last_page_at'], rehydrated

before_recovery = len(sent)
d._critical_record(PROBE, True)
assert len(sent) == before_recovery + 1 and 'RECOVERED' in sent[-1], sent[-1]
assert ' for ' in sent[-1], f'the recovery must say how long it was down: {sent[-1]}'
st = d._critical_state[PROBE]
assert st['pages_sent'] == 0 and st['failing_since'] == 0, \
    f'recovery must close the episode completely: {st}'

# 10. State written before this upgrade has no ladder fields. It must start the
#     ladder rather than re-paging instantly on the first tick after a deploy.
legacy = d._alert_bind('critical:legacy-probe', {'consec_fail': 5, 'alert_sent': True,
                                                 'outcomes': []})
assert 'pages_sent' not in legacy and 'last_page_at' not in legacy, legacy
due = d._critical_repage_due_in(legacy)
assert due > 3000, f'a legacy episode must wait a full rung, not page at once: {due}'
assert d._critical_duration_suffix(legacy) == '', 'unknown episode age prints nothing'

print('critical-jobs: OK (10 scenarios)')

# Offline delivery keeps both transitions and preserves receipt identity.
attempts = []
def offline(body, event_key=None, **kwargs):
    attempts.append((body, event_key))
    return False
d._send_sms = offline
state = d._alert_bind('test:offline', {'consec_fail': 2, 'alert_sent': False})
assert not d._alert(state, 'Repeated failure')
first_id = attempts[-1][1]
assert not d._alert(state, 'Repeated failure')
assert attempts[-1][1] == first_id
state['consec_fail'] = 0
d._alert_flush(state)
pending = d._alert_persist['test:offline']['pending']
assert len(pending) == 2 and pending[1]['recovery']
# Load persisted bytes, as a process restart would.
import json
d._alert_persist = json.loads(d.ALERT_STATE_PATH.read_text())
d._send_sms = lambda body, event_key=None, **kwargs: (attempts.append((body, event_key)) or True)
d._alert_flush(state)
assert not d._alert_persist['test:offline']['pending']
state['consec_fail'] = 2
assert d._alert(state, 'Repeated failure')
assert attempts[-1][1] != first_id, 'recurrence must get a fresh event identity'
# Real transport requires a durable receipt, never sends a phone request.
calls = []
def fake_post(url, **kwargs):
    calls.append((url, kwargs))
    return types.SimpleNamespace(status_code=200, json=lambda: {'recorded': True})
d.requests.post = fake_post
assert transport('fault', event_key='stable-id')
assert calls[0][0].endswith('/api/internal/operational-alert')
assert calls[0][1]['json']['eventKey'] == 'stable-id'
d.requests.post = lambda *a, **k: types.SimpleNamespace(status_code=200, json=lambda: {'recorded': False})
assert not transport('fault', event_key='stable-id')
print('operational-inbox: OK (offline, restart, recurrence, receipt)')

# An entire F-R-F episode sequence while offline must survive in order.
d._send_sms = offline
state = d._alert_bind('test:offline-recurrence', {'consec_fail': 2, 'alert_sent': False})
assert not d._alert(state, 'same fault')
assert not d._alert(state, 'recovered', recovery=True)
assert not d._alert(state, 'same fault')
pending = d._alert_persist['test:offline-recurrence']['pending']
assert [p['recovery'] for p in pending] == [False, True, False]
assert len(set(p['id'] for p in pending)) == 3
# A delivered fault recovering offline must not suppress the next episode.
d._send_sms = lambda body, **kwargs: True
d._critical_record(PROBE, False, 'new incident')
d._critical_record(PROBE, False, 'new incident')
d._send_sms = offline
d._critical_record(PROBE, True)
assert d._critical_state[PROBE]['alert_sent'] is False
print('offline-recurrence: OK')

# Structured resolution wins even when the human text does not say RECOVERED.
d.requests.post = fake_post
assert transport('auth drift RESOLVED', event_key='resolved-id', recovery=True)
assert calls[-1][1]['json']['status'] == 'resolved'
assert transport('fault mentions RECOVERED in a diagnostic', event_key='fault-id', recovery=False)
assert calls[-1][1]['json']['status'] == 'firing'
# Global retries consume an outbox belonging to a producer that never runs again.
d._send_sms = lambda body, **kwargs: True
for _ in range(10):
    d._drain_all_alert_outboxes()
assert all(not entry.get('pending') for entry in d._alert_persist.values())
print('structured-recovery-and-independent-retry: OK')
