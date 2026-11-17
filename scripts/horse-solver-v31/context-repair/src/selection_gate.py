"""A conditional CV score alone cannot release another candidate for EVAL."""
import hashlib
import json
from pathlib import Path

def require_train_selection(root):
    root=Path(root)
    # New explicit release receipt only: do not traverse a historical FREEZE or
    # reopen any old evaluation as a prerequisite for rejecting missing proof.
    p=root/'TRAIN-SELECTION-RELEASE.json'
    if p.is_symlink() or not p.is_file():
        raise ValueError('grouped TRAIN whole-seat selection release required')
    release=json.loads(p.read_bytes())
    if release.get('role')!='TRAIN_SELECTION' or release.get('live_play') is not False:
        raise ValueError('invalid TRAIN selection role')
    groups=release.get('groups',[]);rows=release.get('rows',[])
    if not groups or len(groups)!=len(set(groups)) or len(rows)!=2*len(groups):
        raise ValueError('incomplete TRAIN selection groups')
    if {(r['group'],r['seat']) for r in rows}!={(g,s) for g in groups for s in ('IP','OOP')}:
        raise ValueError('both seats required without duplicates')
    if release.get('held_out_global_ranks') is not True or release.get('technical_pass') is not True or release.get('raw_teacher_oracle') is not False:
        raise ValueError('grouped model-only validation required')
    import math
    if any(not math.isfinite(r['upper_pct']) or r['upper_pct']<0 for r in rows):
        raise ValueError('invalid TRAIN validation endpoint')
    fit=root/'models/fit.json'
    if fit.is_symlink() or hashlib.sha256(fit.read_bytes()).hexdigest()!=release.get('fit_sha256'):
        raise ValueError('validation does not bind this selected fit')
    if release.get('review_status')!='ACCEPT' or not release.get('provenance_sha256'):
        raise ValueError('reviewed TRAIN native provenance required')
    return release
