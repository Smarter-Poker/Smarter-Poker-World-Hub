"""Seal the one TRAIN-selected candidate before EVAL encoding or labels."""
import sys,datetime
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,load,write,sha,frozen

from selection_gate import require_train_selection

def main():
 require_train_selection(B)
 frozen();assert not (B/'evidence/build-EVAL.json').exists() and not (B/'evidence/EVAL-consumption.json').exists()
 fit=load(B/'models/fit.json');assert fit['training_only'] and not fit['EVAL_read'] and len(fit['domains'])==2 and len(fit['model_sha256']) in (8,14)
 inputs=load(B/'TRAIN-INPUTS.json');files=dict(inputs['input_pins'])
 for rel,h in fit['model_sha256'].items():files[str(B/'models'/rel)]=h
 for p in (B/'models/fit.json',B/'TRAIN-INPUTS.json',B/'PREFIT-RELEASE.json',Path(load(B/'PREFIT-RELEASE.json')['reviewer_path'])):files[str(p)]=sha(p)
 for p,h in files.items():assert sha(p)==h
 write(B/'CANDIDATE.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),freeze_sha256=sha(B/'FREEZE.json'),files=files,recipe=fit['recipe'],live_play=False,EVAL_read=False))
 print(sha(B/'CANDIDATE.json'))
if __name__=='__main__':main()
