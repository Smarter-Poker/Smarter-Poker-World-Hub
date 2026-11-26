"""One immutable causal chain from admitted TRAIN labels/native outputs to candidate."""
from pathlib import Path
from common import B,config,frozen,read,sha,data_bytes

def candidate_chain():
 frozen();c,g=config();freeze=sha('FREEZE.json');data=read('DATA-RELEASE.json');admission=read('FIT-ADMISSION.json');fit=read('FIT.json');candidate=read('CANDIDATE-SEAL.json');reuse=read('REUSED-TRAIN-ADMISSION.json');files={}
 assert data['accepted'] is True and data['freeze_sha256']==freeze and data['dataset_sha256']==sha('DATASET.json') and data['fit_games']==136 and data['nodes']==544
 assert admission['accepted'] is True and admission['freeze_sha256']==freeze and admission['data_release_sha256']==sha('DATA-RELEASE.json') and admission['dataset_sha256']==sha('DATASET.json') and admission['fit_games']==136
 assert fit['freeze_sha256']==freeze and fit['data_release_sha256']==sha('DATA-RELEASE.json') and fit['fit_games']==136 and len(fit['models'])==8
 assert candidate['fit_sha256']==sha('FIT.json') and candidate['models']==8 and candidate['fitted_once'] is True
 assert reuse['accepted'] is True and reuse['games']==32 and reuse['freeze_sha256']==freeze and reuse['mandatory_A2'] is True
 for name in ('DATA-RELEASE.json','DATASET.json','FIT-ADMISSION.json','FIT-CLAIM.json','FIT.json','CANDIDATE-SEAL.json','REUSED-TRAIN-ADMISSION.json'):files[name]=sha(name)
 claim=read('FIT-CLAIM.json');assert claim['freeze_sha256']==freeze and claim['data_release_sha256']==sha('DATA-RELEASE.json')
 # Each external byte read is still explicit TRAIN admission; owned artifacts retain the owned-path guard.
 for p,h in data['files'].items():data_bytes(p,h,'TRAIN');files[p]=h
 dataset=read('DATASET.json');assert len(dataset)==544 and len({r['game_key'] for r in dataset})==136
 for row in dataset:
  for name in ('label','features'):
   p=row[name+'_path'];h=row[name+'_sha256'];data_bytes(p,h,'TRAIN');files[p]=h
 expected={v['path']:v['sha256'] for v in c['reused_native'].values()}
 for tag,co in c['cohorts'].items():
  if co['stage']!='HARVEST':continue
  rp='evidence/technical-'+tag+'.json';receipt=read(rp);assert receipt['verdict']=='PASS_NATIVE_COPY_A2_TECHNICAL';files[rp]=sha(rp)
  for name,h in receipt['local_files'].items():
   p=str(B/'m1'/('F5P136-'+tag)/name);data_bytes(p,h,'TRAIN');files[p]=h
  for jid in co['ids']:
   p=str(B/'m1'/('F5P136-'+tag)/(jid+'.json'));expected[p]=receipt['local_files'][jid+'.json']
 assert data['native_sources']==expected and len(expected)==32
 for p,h in expected.items():data_bytes(p,h,'TRAIN');files[p]=h
 for p,m in fit['models'].items():assert sha(p)==m['sha256'];files[p]=m['sha256']
 return files
