#!/usr/bin/env python3
"""Closed corrected R7 continuation: retain107 builds/two audits; no replay."""
from __future__ import annotations
import argparse,hashlib,importlib.util,json,re,sys,traceback
from pathlib import Path
Q_SHA='6f05facdc14d5f5c5cc9764421ba1989b8f58c54281438b651c43bb155c144bb'
OLD_CONFIG='9e11522a976155a3cd5103fe1a4af9aa1fe2c54db62463e2f35a177f37b3eba6'
OUTER='61de85a5a96e25868666a0fcb284cea74941dad9914f60714e13dde81076f434'
TERMINAL='935a28f9297743477ddd5771c39b26ed40fa49fa346f1b36468c7f78d9ffc201'
KNOWN='34b11ba9ba2182337f5ffb19911b1684d15ad593610fe17c6965043c8f4d6181'
UNKNOWN_STARTED='39112f3170ca7b43845c72d43ca4fe4abcc1d8b255e8c5371c7843813517068c'
UNKNOWN='f8324d9f5992e69eb31cc55e61976b8c9ff222bd1e6f563d3214404f6baf0f7c'
BUILDS='777aec1d632c67ad12ddc12951beb7a739bb2c71bd60e912d60cf0e06fe332af'
REQUEST='47192f323c1a1dbb85ba77a605f63840819e562d98fe5c0f11a8406722de24d4'
ENCODING='1121d3ff6873757d8560e55f397e29df8978cc8b845259bbaa2c529f40950f6d'
PHYSICS_IMPLEMENTATION='66f413bc9179d5b10df7c5a73547931c47a3e90fd7895c4de596c7287e98e733'
CELL_SQL_PHYSICS='128bc5f1ca194316846b37de60963b33f8e53593be7bdbbc17f55143e1a5c668'
Q=None
TOP={'format','dataset_id','observed_at','original_config_sha256','original_native_result_sha256','model_index_sha256','source_capture_checksum','selection_receipt_checksum','physics_checksum','encoding_checksum','cells','audits','unknown_request_body_sha256','ingress_claim'}
CELL={'cell_id','cell_key_checksum','context','model_checksum','template_checksum','training_provenance_checksum','model_build_receipt_checksum','sql_physics_checksum','source_rows','train_source_rows','holdout_source_rows','cell_payload_checksum','lineage_checksum','frozen_bindings_match','capture_receipt_checksum','m1_train_receipts','m2_holdout_receipts'}
AUDIT={'observed_at','preparation_offset','context','board_offset','cell_key_checksum','model_checksum','template_checksum','training_provenance_checksum','model_build_receipt_checksum','board_sha256','selection_receipt_checksum','capture_receipt_checksum','frozen_bindings_match','node_checksum','artifact_checksum','expected_audit_key','audit_present','physics_key_matches','model_matches','template_matches','frozen_encoding_matches','chronological_board_matches','legal_combos','audit_checksum','prepared_at','derived_combo_rows','complete_derived_audit'}
def need(q,v,code):q.need(v,code)
def exact(q,v,keys):need(q,isinstance(v,dict) and set(v)==keys,'CONTINUATION_EXACT_KEYS')
def load(q,pin,expected=None,limit=4*1024*1024):return q.strict_json(q.pinned(pin,expected,limit),bom=True)
def predecessor(q,p,base):
 exact(q,p,{'config','claim','outer_native_result','terminal','known_heldout_terminal','unknown_started','unknown_phase_terminal','build_terminals'})
 old=load(q,p['config'],OLD_CONFIG,64*1024);exact(q,old,q.CONFIG)
 task=Path(base['pipeline_root']).parent;oldout=task/'public215-qualify-once-r2'
 need(q,old['output']==str(oldout) and base['output']==str(task/'public215-qualify-once-r3'),'CLOSED_OUTPUTS')
 for key in q.CONFIG-{'snapshot','output'}:need(q,base[key]==old[key],'ORIGINAL_INPUT_BINDING')
 claim=load(q,p['claim']);need(q,Path(p['claim']['path'])==oldout/'claim.json','ORIGINAL_CLAIM_PATH')
 need(q,claim.get('format')=='public215_r7_qualify_claim_v1' and claim.get('dataset_id')==q.DATASET and claim.get('config_sha256')==OLD_CONFIG and claim.get('index_sha256')==q.INDEX and claim.get('attempts')==1 and claim.get('builds')==107 and claim.get('heldout_physics')==856 and claim.get('certified') is False,'ORIGINAL_CLAIM')
 outer=load(q,p['outer_native_result'],OUTER)
 need(q,outer.get('dataset_id')==q.DATASET and outer.get('controller_checksum')==Q_SHA and outer.get('config_checksum')==OLD_CONFIG and type(outer.get('native_exit_code')) is int and outer['native_exit_code']==1 and outer.get('wrapper_exit_code')==1 and outer.get('supervisor_pid')==19812 and outer.get('controller_pid')==24816 and outer.get('certified') is False and outer.get('promotion_requested') is False,'ORIGINAL_NATIVE_FAILURE')
 end=load(q,p['terminal'],TERMINAL);unknown=load(q,p['unknown_phase_terminal'],UNKNOWN)
 for x in [end,unknown]:need(q,x.get('status')=='unknown_stop' and x.get('phase')=='000.heldout-01' and x.get('completed_builds')==107 and x.get('completed_physics')==1 and x.get('http_status') is None and x.get('failure_classification')=='transport_or_unclassified' and x.get('certified') is False,'ORIGINAL_UNKNOWN_BOUNDARY')
 started=load(q,p['unknown_started'],UNKNOWN_STARTED);need(q,started.get('operation')=='freeze_model' and started.get('dataset_id')==q.DATASET,'ORIGINAL_UNKNOWN_STARTED')
 for field,name in [('terminal','terminal.json'),('known_heldout_terminal','000.heldout-00.terminal.json'),('unknown_started','000.heldout-01.started.json'),('unknown_phase_terminal','000.heldout-01.terminal.json')]:need(q,Path(p[field]['path'])==oldout/name,'ORIGINAL_EVIDENCE_PATH')
 need(q,isinstance(p['build_terminals'],list) and len(p['build_terminals'])==107,'ALL_ORIGINAL_BUILDS')
 rows=[];acks=[]
 for i,pin in enumerate(p['build_terminals']):
  need(q,Path(pin['path'])==oldout/f'{i:03d}.build.terminal.json','ORIGINAL_BUILD_PATH');acks.append(load(q,pin));rows.append({'ordinal':i,'sha256':pin['sha256']})
 need(q,q.digest(q.canonical(rows))==BUILDS,'CLOSED_BUILD_ACK_BYTES')
 return acks,load(q,p['known_heldout_terminal'],KNOWN)
def recovery(q,proof,plan,snapshot,client):
 exact(q,proof,TOP);q.fresh_snapshot(proof['observed_at'])
 need(q,q.sha(PHYSICS_IMPLEMENTATION) and proof['format']=='public215_r7_closed_prefix_recovery_v1' and proof['dataset_id']==q.DATASET and proof['model_index_sha256']==q.INDEX and proof['source_capture_checksum']==q.CAPTURE and proof['original_config_sha256']==OLD_CONFIG and proof['original_native_result_sha256']==OUTER and proof['selection_receipt_checksum']==snapshot['selection_receipt_checksum'] and proof['physics_checksum']==PHYSICS_IMPLEMENTATION and proof['encoding_checksum']==ENCODING and proof['unknown_request_body_sha256']==REQUEST,'CLOSED_ROOT_RECOVERY_IDENTITY')
 claim=proof['ingress_claim'];exact(q,claim,{'principal','nonce','operation','signed_at','received_at','body_sha256'})
 need(q,claim['principal']=='COMPACTOR' and claim['nonce']=='990d54a0-370c-4ace-851c-cd07671f3d21' and claim['operation']=='freeze_model' and claim['body_sha256']==REQUEST and q.timestamp(claim['signed_at'])==q.timestamp('2026-10-31T16:32:40Z') and q.timestamp(claim['received_at'])==q.timestamp('2026-10-31T16:32:40.726944Z'),'CLOSED_ORIGINAL_INGRESS')
 need(q,isinstance(proof['cells'],list) and len(proof['cells'])==107,'FULL_BUILT_MAP')
 seen_cells=set()
 for item,row in zip(plan,proof['cells']):
  exact(q,row,CELL);e=item['entry'];need(q,isinstance(row['cell_id'],str) and re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',row['cell_id']) is not None and row['cell_id'] not in seen_cells,'UNIQUE_CELL_ID');seen_cells.add(row['cell_id'])
  need(q,row['context']==e['context'] and row['cell_key_checksum']==item['cell_key_checksum'] and all(row[k]==e[k] for k in q.FIELDS) and row['frozen_bindings_match'] is True and row['capture_receipt_checksum']==q.CAPTURE and row['sql_physics_checksum']==CELL_SQL_PHYSICS,'BUILT_FROZEN_BINDINGS')
  need(q,all(type(row[k]) is int and row[k]==n for k,n in [('source_rows',65),('train_source_rows',57),('holdout_source_rows',8),('m1_train_receipts',57),('m2_holdout_receipts',8)]) and all(q.sha(row[k]) for k in ['cell_payload_checksum','lineage_checksum']),'COMPLETE_BUILT_LINEAGE')
 audits=proof['audits'];need(q,isinstance(audits,list) and len(audits)==2,'TWO_CLOSED_AUDITS');item=plan[0];e=item['entry'];seen=set()
 for i,row in enumerate(audits):
  exact(q,row,AUDIT);q.fresh_snapshot(row['observed_at'])
  need(q,type(row['preparation_offset']) is int and row['preparation_offset']==0 and type(row['board_offset']) is int and row['board_offset']==i and row['context']==e['context'] and row['cell_key_checksum']==item['cell_key_checksum'] and all(row[k]==e[k] for k in q.FIELDS) and row['capture_receipt_checksum']==q.CAPTURE and row['selection_receipt_checksum']==snapshot['selection_receipt_checksum'],'RECOVERED_AUDIT_BINDINGS')
  need(q,all(row[k] is True for k in ['frozen_bindings_match','audit_present','physics_key_matches','model_matches','template_matches','frozen_encoding_matches','chronological_board_matches','complete_derived_audit']) and type(row['legal_combos']) is int and row['legal_combos']==1176 and type(row['derived_combo_rows']) is int and row['derived_combo_rows']==1176,'COMPLETE_DERIVED_AUDIT')
  need(q,all(q.sha(row[k]) for k in ['board_sha256','node_checksum','artifact_checksum','expected_audit_key','audit_checksum']) and row['board_sha256'] not in seen,'RECOVERED_AUDIT_HASHES');seen.add(row['board_sha256'])
  need(q,q.timestamp(row['prepared_at'])<=q.timestamp(proof['observed_at']),'AUDIT_PRECEDES_RECOVERY')
 need(q,audits[1]['expected_audit_key']=='268d379b326077a6d20ef38ff8420350c8ba872c3d2d5e69ecf8a48a2a3d04d9','EXACT_UNKNOWN_AUDIT')
 envelope={k:e[k] for k in ('context','model_checksum','public_model_build_receipt','model_build_receipt_checksum')}
 payload={'dataset_id':q.DATASET,'context':envelope,'preparation_offset':0,'heldout_board_offset':1}
 need(q,q.digest(client._body('freeze_model',payload))==REQUEST,'EXACT_UNKNOWN_BODY')
 return audits
def safe_failure(q,error):
 clean=lambda value,limit:re.sub(r'[^A-Za-z0-9_.<>-]','_',value)[:limit]
 r={'exception_class':clean(type(error).__name__,80),'traceback':[{'basename':clean(Path(f.filename).name,128),'function':clean(f.name,80),'line':f.lineno} for f in traceback.extract_tb(error.__traceback__)[-32:]]}
 if q is not None and isinstance(error,q.Refusal) and re.fullmatch(r'[A-Z][A-Z0-9_]{0,127}',str(error)):r['refusal_code']=str(error)
 for attr in ['status','errno']:
  v=getattr(error,attr,None)
  if type(v) is int and (100<=v<=599 if attr=='status' else -(2**31)<=v<2**31):r['http_status' if attr=='status' else attr]=v
 causes=[];seen={id(error)};cause=error.__cause__
 while cause is not None and len(causes)<3 and id(cause) not in seen:
  seen.add(id(cause));item={'exception_class':clean(type(cause).__name__,80)}
  for attr in ['errno','winerror']:
   v=getattr(cause,attr,None)
   if type(v) is int and -(2**31)<=v<2**31:item[attr]=v
  causes.append(item);cause=cause.__cause__
 if causes:r['causes']=causes
 return r
def continue_once(q,client,compactor,plan,snapshot,output,config_sha,proof,known):
 directory=Path(output);need(q,not directory.exists() and directory.parent.resolve(strict=True)==directory.parent,'NEW_EXCLUSIVE_CONTINUATION');q.fresh_snapshot(proof['observed_at']);q.fresh_snapshot(snapshot['observed_at']);directory.mkdir()
 q.write_new(directory,'claim.json',{'format':'public215_r7_closed_continuation_claim_v1','dataset_id':q.DATASET,'config_sha256':config_sha,'original_config_sha256':OLD_CONFIG,'completed_builds_inherited':107,'heldout_ack_inherited':1,'heldout_db_recovered':1,'remaining_heldout':854,'attempts':1,'certified':False})
 q.write_new(directory,'db-recovered-000.heldout-01.json',{'status':'complete_derived_audit_root_db_recovery_not_gateway_ack','metadata':proof['audits'][1],'certified':False})
 phase_name='admission';completed=0
 def phase(name,op,payload,validator):
  nonlocal phase_name
  phase_name=name;q.write_new(directory,name+'.started.json',{'operation':op,'dataset_id':q.DATASET});value=client.call(op,payload,timeout_seconds=280);validator(value);q.write_new(directory,name+'.terminal.json',{'status':'acknowledged_exact_receipt','receipt':value});return value
 try:
  for ordinal,item in enumerate(plan):
   e=item['entry'];envelope={k:e[k] for k in ('context','model_checksum','public_model_build_receipt','model_build_receipt_checksum')};boards=set();hashes=set()
   if ordinal==0:boards.add(known['receipt']['board']);hashes.update(a['board_sha256'] for a in proof['audits'])
   for offset in range(2 if ordinal==0 else 0,8):
    def validate(value):
     need(q,isinstance(value,dict) and isinstance(value.get('board'),str),'HELDOUT_RECEIPT_DIFFERS');h=q.digest(value['board'].encode('ascii'));need(q,h not in hashes,'DUPLICATE_RECOVERED_BOARD');q.heldout_receipt(value,item,offset,snapshot['selection_receipt_checksum'],boards);hashes.add(h)
    phase(f'{ordinal:03d}.heldout-{offset:02d}','freeze_model',{'dataset_id':q.DATASET,'context':envelope,'preparation_offset':ordinal,'heldout_board_offset':offset},validate);completed+=1
  sealed=phase('seal','seal_dataset',{'dataset_id':q.DATASET},lambda v:need(q,compactor.seal_receipt_is_valid(v),'SEAL_RECEIPT_DIFFERS'))
  def status(v):
   row=compactor.dataset_item(v,q.DATASET,107);need(q,row['state']=='evaluating' and row['dataset_checksum']==sealed['dataset_checksum'],'SEALED_STATUS_DIFFERS')
  phase('status','certification_status',{'dataset_id':q.DATASET},status)
 except BaseException as error:
  failure={'status':'unknown_stop','phase':phase_name,'completed_builds_inherited':107,'heldout_ack_inherited':1,'heldout_db_recovered':1,'completed_new_heldout':completed,'certified':False,**safe_failure(q,error)}
  if not (directory/(phase_name+'.terminal.json')).exists():q.write_new(directory,phase_name+'.terminal.json',failure)
  q.write_new(directory,'terminal.json',failure);raise q.Refusal('OUTCOME_UNKNOWN_NO_RETRY') from None
 result={'status':'sealed_evaluating_requires_independent_readback','dataset_checksum':sealed['dataset_checksum'],'completed_builds_inherited':107,'completed_physics':856,'completed_new_heldout':completed,'certified':False};q.write_new(directory,'terminal.json',result);return result
def main():
 global Q
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',required=True);p.add_argument('--config-sha256',required=True);args=p.parse_args()
 source=Path(r'C:\sp-v31\mac-v31-public215-r7-corrected-20261030-01a17e88\control\quality-preparation-r2\qualify_r7_once.py')
 if hashlib.sha256(source.read_bytes()).hexdigest()!=Q_SHA:raise ValueError('PROTECTED_QUALIFIER_SOURCE_REQUIRED')
 spec=importlib.util.spec_from_file_location('protected_r7_original',source);q=importlib.util.module_from_spec(spec);spec.loader.exec_module(q);Q=q
 config=load(q,{'path':args.config,'sha256':args.config_sha256},limit=64*1024);exact(q,config,{'format','base_config','predecessor','recovery_proof'});need(q,config['format']=='public215_r7_continue_once_v1','CONTINUATION_FORMAT')
 base=load(q,config['base_config'],limit=64*1024);acks,known=predecessor(q,config['predecessor'],base);proof=load(q,config['recovery_proof']);need(q,q.sha(PHYSICS_IMPLEMENTATION),'FROZEN_PHYSICS_PIN_REQUIRED')
 client,compactor,plan,snapshot=q.admit(base);audits=recovery(q,proof,plan,snapshot,client)
 for item,ack in zip(plan,acks):need(q,ack.get('status')=='acknowledged_exact_receipt' and compactor.build_cell_receipt_is_valid(ack.get('receipt')) and ack['receipt']['cell_key_checksum']==item['cell_key_checksum'],'EXACT_ORIGINAL_BUILD_ACK')
 need(q,known.get('status')=='acknowledged_exact_receipt','KNOWN_HELDOUT_ACK');q.heldout_receipt(known['receipt'],plan[0],0,snapshot['selection_receipt_checksum'],set())
 need(q,q.digest(known['receipt']['board'].encode('ascii'))==audits[0]['board_sha256'] and known['receipt']['audit_key']==audits[0]['expected_audit_key'] and all(known['receipt'][k]==audits[0][k] for k in ['node_checksum','artifact_checksum','cell_key_checksum',*q.FIELDS[:2],'model_build_receipt_checksum']),'KNOWN_ACK_DB_BINDING')
 continue_once(q,client,compactor,plan,snapshot,base['output'],args.config_sha256,proof,known);return 0
if __name__=='__main__':
 try:code=main()
 except BaseException as error:
  print(json.dumps({'status':'stopped_requires_durable_outcome_readback','certified':False,**safe_failure(Q,error)},sort_keys=True,separators=(',',':')));code=1
 raise SystemExit(code)
