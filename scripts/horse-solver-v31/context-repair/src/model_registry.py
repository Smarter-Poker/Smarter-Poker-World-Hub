"""Append-only offline candidate inventory. Publication never grants activation."""
import datetime
import fcntl
import hashlib
import json
from pathlib import Path

STATES = frozenset(('UNQUALIFIED', 'REJECTED', 'FINITE_CONTEXT_QUALIFIED'))

def digest(data):
    return hashlib.sha256(data).hexdigest()

def encoded(obj):
    return (json.dumps(obj,sort_keys=True,separators=(',',':'))+'\n').encode()

def read_records(root):
    root=Path(root);rows=[];previous=None
    for index,p in enumerate(sorted(root.glob('[0-9]'*6+'.json'))):
        if p.name != '%06d.json'%index or p.is_symlink():
            raise ValueError('registry sequence changed')
        raw=p.read_bytes();r=json.loads(raw)
        if r['previous_sha256']!=previous or r['sequence']!=index or r['live_play'] is not False:
            raise ValueError('registry chain changed')
        validate(r);rows.append(r);previous=digest(raw)
    return rows,previous

def validate(record):
    if record.get('status') not in STATES or record.get('live_play') is not False:
        raise ValueError('invalid offline candidate status')
    for k in ('candidate_sha256','plan_sha256'):
        v=record.get(k,'')
        if len(v)!=64 or any(c not in '0123456789abcdef' for c in v):raise ValueError('missing immutable identity')
    if not record.get('evidence_reference') or not record.get('scope'):
        raise ValueError('missing scope/evidence')
    if record['status']=='FINITE_CONTEXT_QUALIFIED' and record.get('certificate')!='ALL_FROZEN_GATES_PASS':
        raise ValueError('qualification certificate required')

def append(root,record):
    root=Path(root);root.mkdir(parents=True,exist_ok=True);validate(record)
    with (root/'registry.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        rows,prior=read_records(root)
        if any(r['candidate_sha256']==record['candidate_sha256'] for r in rows):
            raise ValueError('candidate already registered; preserve its result')
        r=dict(record,sequence=len(rows),previous_sha256=prior,recorded_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
        with (root/('%06d.json'%len(rows))).open('xb') as f:f.write(encoded(r))
    return r

def activation_allowed(record):
    validate(record)
    # This offline registry has no production activation capability, even PASS.
    return False
