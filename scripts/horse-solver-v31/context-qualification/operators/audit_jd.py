import sys,json,datetime
from pathlib import Path
B=Path(__file__).resolve().parents[1];sys.path.insert(0,str(B/'src'))
from common import frozen,config,read,write,sha
frozen();c,g=config();seal=read('JD-JOBS-SEAL.json');assert seal['reference_result_sha256']==c['inputs'][c['jd_reference_result']]['sha256'] and seal['freeze_sha256']==sha('FREEZE.json');n=0;w=0;groups={}
for tag,co in c['cohorts'].items():
 if co['stage']!='JD':continue
 p=B/('jobs-'+tag+'.json');assert sha(p)==seal['files'][str(p)]
 for j in read(p):
  source=j['meta']['source_train_id'];ref=c['jd_reference_jobs'][source];expected=[a for a in ref['phases'][0]['arms'] if a['name'].endswith('|range_root')];assert j['phases'][0]['arms']==expected and len(expected)==2;assert j['phases'][0]['scenario']['pot_chips']==600-j['meta']['drop_chips'];n+=1;w+=sum(len(a['writes']) for a in expected);key=(j['meta']['family'],j['meta']['position']);groups.setdefault(key,[]).append(j['meta']['drop_chips'])
assert n==16 and w==64 and all(sorted(v)==[25,60] for v in groups.values())
write('evidence/JD-table-audit.json',dict(at=datetime.datetime.now(datetime.UTC).isoformat(),accepted=True,jobs=n,writes=w,old_tables_byte_equal=True,drop_position_family_balanced=True,qualification_use=False,live_play=False))
print('PASS JD oldsealedtableidentity and dropbalance')
