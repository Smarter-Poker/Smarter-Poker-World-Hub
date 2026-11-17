"""Seal the one TRAIN-selected candidate before any DEV encoding or labels."""
import sys,datetime
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from common import B,load,write,sha,frozen
def main():
    frozen();assert not (B/'evidence/build-DEV.json').exists() and not (B/'evidence/DEV-consumption.json').exists()
    assert load(B/'evidence/TRAIN-result.json')['verdict']=='PASS_TRAIN_TECHNICAL'
    fit=load(B/'models/fit.json');assert fit['training_only'] and not fit['DEV_or_FINAL_read'] and len(fit['model_sha256'])==8 and len(fit['domains'])==2
    provenance=load(B/'features/PROVENANCE.json');files={**provenance['features'],**provenance['harvest']}
    for rel,h in fit['model_sha256'].items():files[str(B/'models'/rel)]=h
    for p in (B/'models/fit.json',B/'features/PROVENANCE.json',B/'evidence/TRAIN-result.json'):files[str(p)]=sha(p)
    for p,h in files.items():assert sha(p)==h
    write(B/'CANDIDATE.json',dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(),freeze_sha256=sha(B/'FREEZE.json'),files=files,recipe=fit['recipe'],live_play=False,DEV_or_FINAL_read=False))
    print(sha(B/'CANDIDATE.json'))
if __name__=='__main__':main()
