#!/usr/bin/env python3
"""
Functional test for the shadowed-secret check in openclaw-cron-dispatcher.py.

On the Open Claw host two files define CRON_SECRET. Only one is read:
openclaw.service carries `EnvironmentFile=-/etc/openclaw.env`, so that file
becomes os.environ; /opt/openclaw/.env is the deploy seed, copied into it once
and never again. When they disagree, editing the seed and restarting changes
nothing, and nothing says so - which is how the 2026-09-05 outage repair lost a
restart cycle writing the correct secret into the inert file.

This drives the module-level check through the three states that matter:
agreement is silent, disagreement is loud and names the winning file, and a
seed file that does not exist at all is not a disagreement.
Run by __tests__/openclaw-secret-shadow.test.mjs.
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

REAL = 'r' * 64        # the value production accepts, in /etc/openclaw.env
STALE = 's' * 64       # the value left behind in the seed file


def load(seed_value, etc_value=REAL, seed_exists=True):
    """Import a fresh dispatcher with the two env files staged on disk."""
    tmp = Path(tempfile.mkdtemp())
    os.environ['HOME'] = str(tmp)
    os.environ['OPENCLAW_ALERT_STATE'] = str(tmp / 'alert-state.json')
    os.environ.pop('WORKERS_BASE_URL', None)
    os.environ.pop('WORKERS_CRON_SECRET', None)

    etc = tmp / 'openclaw.env'
    etc.write_text(f'CRON_SECRET={etc_value}\n')
    seed = tmp / 'seed.env'
    if seed_exists:
        seed.write_text(f'CRON_SECRET={seed_value}\nSOME_OTHER=1\n')
    os.environ['OPENCLAW_ETC_ENV'] = str(etc)
    os.environ['OPENCLAW_SEED_ENV'] = str(seed)

    # EnvironmentFile=-/etc/openclaw.env is what puts this into os.environ on
    # the real host; systemd is not here, so stand in for it.
    os.environ['CRON_SECRET'] = etc_value

    sys.modules.pop('dispatcher', None)
    spec = importlib.util.spec_from_file_location('dispatcher', SRC)
    d = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(d)
    return d


# 1. The two files disagree: one finding, and it names both files and the winner.
d = load(seed_value=STALE)
assert len(d._SECRET_SHADOW_FINDINGS) == 1, d._SECRET_SHADOW_FINDINGS
finding = d._SECRET_SHADOW_FINDINGS[0]
assert 'CRON_SECRET' in finding
assert str(d.ETC_ENV_FILE) in finding, 'the page must name the file that wins'
assert str(d.SEED_ENV_FILE) in finding, 'the page must name the file that does not'
assert 'SHADOWED' in finding
# A fingerprint, never the secret itself - this text is destined for an SMS.
assert REAL not in finding and STALE not in finding, 'a secret value must never reach the alert text'
assert d._fingerprint(REAL)[:12] in finding

# 2. The two files agree: silence. A check that cries every boot is ignored by
#    the second week.
d = load(seed_value=REAL)
assert d._SECRET_SHADOW_FINDINGS == [], d._SECRET_SHADOW_FINDINGS

# 3. No seed file at all (a box provisioned straight into /etc): not a drift.
d = load(seed_value=STALE, seed_exists=False)
assert d._SECRET_SHADOW_FINDINGS == [], d._SECRET_SHADOW_FINDINGS

# 4. An unreadable seed file must never stop the dispatcher booting.
d = load(seed_value=STALE)
assert d._read_env_file_key(Path('/definitely/not/here.env'), 'CRON_SECRET') == ''

# 5. The drift page names the file an operator has to edit. The old text said
#    only "did not reach this host", and the obvious file is the wrong one.
src = SRC.read_text()
drift = src[src.index('SMARTER.POKER SECRET DRIFT'):][:700]
assert 'ETC_ENV_FILE' in drift, 'the drift page must name /etc/openclaw.env'
assert 'SEED_ENV_FILE' in drift, 'the drift page must say editing the seed does nothing'

print('secret-shadow: OK')
