#!/usr/bin/env python3
"""Closed R7 seal-only recovery; never rebuilds, audits, retries or promotes."""
from pathlib import Path
import argparse,importlib.util,re
Q_SHA='6f05facdc14d5f5c5cc9764421ba1989b8f58c54281438b651c43bb155c144bb'
C_SHA='f1dfed407e3ccf2fcf7ec48fbd15edb45e103667db1bb25d6ad48807553a7c3f'
R3_CONFIG='96be7ebeaebd5f509e84a114c84731eaa4abd760f8ed2dc9b3845e7171ac12e0'
RAW='e40d152c54213821165dc88ed5b86549c6e53ca30bbf683ff23a05d7752139c4'
NATIVE='3bdfb1888b18adb1b0254e26958069c7e0210fce02d1f67929d0af5a1a9a6f92'
TERMINAL='790e67a34724f461d9a91c9ae5e2cbeb7c7d24a48d1af1bd9d26926c842a85f5'
FUNCTIONS={'fn_gto_v31_seal_build(uuid)','fn_gto_v31_public215_model_canonical_fast(jsonb)','fn_gto_v31_public215_canonical(jsonb)','fn_gto_v31_public215_model_valid(jsonb)','fn_gto_v31_cell_payload_checksum(jsonb)'}
Q=None;C=None

def exact(q,v,keys):q.need(isinstance(v,dict) and set(v)==set(keys),'SEAL_EXACT_KEYS')
def load(q,pin,expected=None,limit=8*1024*1024):return q.strict_json(q.pinned(pin,expected,limit),bom=True)
def original(q,c,p,base,plan):
 exact(q,p,{'config','files','outer_claim','known_terminal','recovered_terminal'})
 old=load(q,p['config'],R3_CONFIG);exact(q,old,{'format','base_config','predecessor','recovery_proof'});q.need(old['format']=='public215_r7_continue_once_v1','ORIGINAL_R3_CONFIG')
 oldbase=load(q,old['base_config']);task=Path(base['pipeline_root']).parent;oldout=task/'public215-qualify-once-r3'
 q.need(oldbase['output']==str(oldout) and base['output']==str(task/'public215-seal-once-r4'),'CLOSED_SEAL_OUTPUT')
 for key in q.CONFIG-{'snapshot','output'}:q.need(base[key]==oldbase[key],'ORIGINAL_BASE_INPUTS')
 acks,known=c.predecessor(q,old['predecessor'],oldbase)
 for item,ack in zip(plan,acks):q.need(ack['status']=='acknowledged_exact_receipt' and ack['receipt']=={'cell_key_checksum':item['cell_key_checksum']},'ORIGINAL107_BUILD_ACKS')
 q.need(isinstance(p['files'],list) and len(p['files'])==1714,'ALL_R3_ORIGINAL_FILES')
 inventory=[];files={}
 for descriptor in p['files']:
  exact(q,descriptor,{'name','pin'});name=descriptor['name'];pin=descriptor['pin'];path=Path(pin['path']);expected_path=task/'public215-continue-once-r3-launch'/'result.json' if name=='native-result.json' else oldout/name
  q.need(isinstance(name,str) and Path(name).name==name and path==expected_path and name not in files and path.suffix=='.json','ORIGINAL_R3_FILE_PATH')
  payload=q.pinned(pin,limit=256*1024);inventory.append({'path':name,'bytes':len(payload),'sha256':pin['sha256']});files[name]=q.strict_json(payload,bom=True)
 q.need(q.digest(q.canonical(sorted(inventory,key=lambda x:x['path'])))==RAW,'ORIGINAL_R3_RAW_INVENTORY')
 native=files['native-result.json'];end=files['terminal.json'];claim=files['claim.json'];outer=load(q,p['outer_claim'])
 q.need(native['format']=='public215_r7_continue_outer_result_v1' and native['dataset_id']==q.DATASET and native['controller_checksum']==C_SHA and native['config_checksum']==R3_CONFIG and type(native['native_exit_code']) is int and native['native_exit_code']==1 and type(native['wrapper_exit_code']) is int and native['wrapper_exit_code']==1 and native['supervisor_pid']==8120 and native['controller_pid']==9876 and native['certified'] is False,'R3_NATIVE_FAILURE')
 q.need(outer['format']=='public215_r7_continue_outer_claim_v1' and outer['config_checksum']==R3_CONFIG and outer['controller_checksum']==C_SHA and outer['supervisor_pid']==8120 and outer['attempts']==1,'R3_OUTER_CLAIM')
 q.need(claim['format']=='public215_r7_closed_continuation_claim_v1' and claim['dataset_id']==q.DATASET and claim['config_sha256']==R3_CONFIG and claim['attempts']==1 and claim['completed_builds_inherited']==107 and claim['heldout_ack_inherited']==1 and claim['heldout_db_recovered']==1 and claim['remaining_heldout']==854,'R3_INNER_CLAIM')
 q.need(end['status']=='unknown_stop' and end['phase']=='seal' and end['http_status']==504 and end['completed_new_heldout']==854 and end['completed_builds_inherited']==107 and end['certified'] is False,'R3_SEAL_STOP')
 q.need(files['seal.started.json']['operation']=='seal_dataset' and files['seal.started.json']['dataset_id']==q.DATASET,'ORIGINAL_SEAL_STARTED')
 preserved=load(q,p['known_terminal'],c.KNOWN);q.need(preserved==known,'PRESERVED_KNOWN_ACK')
 recovered=load(q,p['recovered_terminal']);q.need(recovered['status']=='complete_derived_audit_root_db_recovery_not_gateway_ack' and recovered['certified'] is False,'PRESERVED_DB_RECOVERY')
 return reconcile(q,plan,files,known,recovered)

def reconcile(q,plan,files,known,recovered):
 receipts={};db=recovered['metadata'];q.need(db['preparation_offset']==0 and db['board_offset']==1,'RECOVERED_OFFSET')
 for ordinal,item in enumerate(plan):
  boards=set();hashes=set()
  if ordinal==0:
   q.heldout_receipt(known['receipt'],item,0,known['receipt']['selection_receipt_checksum'],boards);receipts[(0,0)]=known['receipt'];hashes.add(q.digest(known['receipt']['board'].encode('ascii')));q.need(q.sha(db['board_sha256']) and db['board_sha256'] not in hashes,'RECOVERED_BOARD');hashes.add(db['board_sha256'])
  for offset in range(2 if ordinal==0 else 0,8):
   name=f'{ordinal:03d}.heldout-{offset:02d}';v=files.get(name+'.terminal.json');st=files.get(name+'.started.json')
   q.need(isinstance(v,dict) and v.get('status')=='acknowledged_exact_receipt' and isinstance(st,dict) and st.get('operation')=='freeze_model' and st.get('dataset_id')==q.DATASET,'ALL854_ACKS')
   q.heldout_receipt(v['receipt'],item,offset,known['receipt']['selection_receipt_checksum'],boards);h=q.digest(v['receipt']['board'].encode('ascii'));q.need(h not in hashes,'UNIQUE_EIGHT_BOARDS');hashes.add(h);receipts[(ordinal,offset)]=v['receipt']
  q.need(len(hashes)==8,'EIGHT_BOARDS_EACH')
 q.need(len(receipts)==855,'ALL855_GATEWAY_ACKS');return receipts,db

def proof(q,c,value,fix,plan,snapshot,closed):
 exact(q,value,{'format','dataset_id','observed_at','model_index_sha256','source_capture_checksum','selection_receipt_checksum','state','dataset_checksum','sealed_at','original_backend_pid','original_query_start','original_xact_start','original_transaction_active','rollback_sqlstate','rollback_at','physics_checksum','encoding_checksum','function_hashes','cells','audits'})
 q.fresh_snapshot(value['observed_at'])
 q.need(value['format']=='public215_r7_seal_recovery_v1' and value['dataset_id']==q.DATASET and value['model_index_sha256']==q.INDEX and value['source_capture_checksum']==q.CAPTURE and value['selection_receipt_checksum']==snapshot['selection_receipt_checksum'],'SEAL_RECOVERY_IDENTITY')
 q.need(value['state']=='building' and value['dataset_checksum'] is None and value['sealed_at'] is None and type(value['original_backend_pid']) is int and value['original_backend_pid']==2616742 and q.timestamp(value['original_query_start'])==q.timestamp('2026-10-31T21:42:04.103539Z') and q.timestamp(value['original_xact_start'])==q.timestamp('2026-10-31T21:42:04.101671Z') and value['original_transaction_active'] is False and value['rollback_sqlstate']=='57014' and q.timestamp(value['rollback_at'])==q.timestamp('2026-10-31T21:46:04.103Z'),'ORIGINAL_SEAL_ROLLBACK_REQUIRED')
 exact(q,fix,{'format','protected_commit','migration_version','migration_sha256','function_hashes','installed_history_verified','qualified_native','physics_checksum','encoding_checksum'})
 q.need(fix['format']=='public215_r7_installed_seal_fix_v1' and re.fullmatch('[0-9a-f]{40}',fix['protected_commit']) is not None and re.fullmatch('[0-9]{14}',fix['migration_version']) is not None and q.sha(fix['migration_sha256']) and fix['installed_history_verified'] is True and fix['qualified_native'] is True,'ACTUAL_QUALIFIED_INSTALLED_SEAL_FIX_REQUIRED')
 for catalog in (value['function_hashes'],fix['function_hashes']):
  exact(q,catalog,FUNCTIONS);q.need(all(isinstance(v,str) and re.fullmatch('[0-9a-f]{32}',v) is not None and v!='0'*32 for v in catalog.values()),'EXACT_FIVE_FUNCTION_HASHES')
 q.need(value['function_hashes']==fix['function_hashes'],'INSTALLED_FUNCTION_CATALOG_DIFFERS')
 q.need(all(x['physics_checksum']==c.PHYSICS_IMPLEMENTATION and x['encoding_checksum']==c.ENCODING for x in (value,fix)),'UNCHANGED_MATH_REQUIRED')
 cells=value['cells'];audits=value['audits'];q.need(isinstance(cells,list) and len(cells)==107 and isinstance(audits,list) and len(audits)==856,'FULL107_856_PROOF')
 ids=set()
 for item,row in zip(plan,cells):
  exact(q,row,c.CELL);q.need(row['context']==item['entry']['context'] and row['cell_key_checksum']==item['cell_key_checksum'] and all(row[k]==item['entry'][k] for k in q.FIELDS) and row['frozen_bindings_match'] is True and row['capture_receipt_checksum']==q.CAPTURE and row['sql_physics_checksum']==c.CELL_SQL_PHYSICS,'FROZEN_BUILT_BINDINGS')
  q.need(all(type(row[k]) is int and row[k]==n for k,n in [('source_rows',65),('train_source_rows',57),('holdout_source_rows',8),('m1_train_receipts',57),('m2_holdout_receipts',8)]) and all(q.sha(row[k]) for k in ['cell_payload_checksum','lineage_checksum']) and isinstance(row['cell_id'],str) and re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',row['cell_id']) is not None and row['cell_id'] not in ids,'COMPLETE_CELL_LINEAGE');ids.add(row['cell_id'])
 receipts,recovered=closed;seen=set();boardsets={}
 for row in audits:
  exact(q,row,c.AUDIT);q.fresh_snapshot(row['observed_at']);i=row['preparation_offset'];o=row['board_offset'];q.need(type(i) is int and 0<=i<107 and type(o) is int and 0<=o<8 and (i,o) not in seen,'EXACT_AUDIT_CENSUS');seen.add((i,o));item=plan[i]
  q.need(row['context']==item['entry']['context'] and row['cell_key_checksum']==item['cell_key_checksum'] and all(row[k]==item['entry'][k] for k in q.FIELDS) and row['capture_receipt_checksum']==q.CAPTURE and row['selection_receipt_checksum']==snapshot['selection_receipt_checksum'],'AUDIT_BINDINGS')
  q.need(all(row[k] is True for k in ['frozen_bindings_match','audit_present','physics_key_matches','model_matches','template_matches','frozen_encoding_matches','chronological_board_matches','complete_derived_audit']) and type(row['legal_combos']) is int and type(row['derived_combo_rows']) is int and row['legal_combos']==row['derived_combo_rows']=={'flop':1176,'turn':1128,'river':1081}[item['entry']['context']['street']],'COMPLETE_ALL_LEGAL_AUDIT')
  q.need(all(q.sha(row[k]) for k in ['board_sha256','node_checksum','artifact_checksum','expected_audit_key','audit_checksum']) and q.timestamp(row['prepared_at'])<=q.timestamp(value['observed_at']),'AUDIT_HASHES')
  hashes=boardsets.setdefault(i,set());q.need(row['board_sha256'] not in hashes,'UNIQUE_DB_BOARDS');hashes.add(row['board_sha256'])
  if (i,o)==(0,1):q.need(all(row[k]==recovered[k] for k in c.AUDIT-{'observed_at'}),'ORIGINAL_DB_RECOVERY_BINDING')
  else:
   ack=receipts[(i,o)];q.need(row['board_sha256']==q.digest(ack['board'].encode('ascii')) and row['expected_audit_key']==ack['audit_key'] and all(row[k]==ack[k] for k in ['node_checksum','artifact_checksum','cell_key_checksum','model_checksum','template_checksum','model_build_receipt_checksum']),'ACK_DB_BINDING')
 q.need(len(seen)==856 and all(len(x)==8 for x in boardsets.values()),'FULL_AUDIT_COVERAGE')

def seal_once(q,c,client,compactor,output,config_sha,snapshot,recovery):
 q.need(client.attempts==1,'SINGLE_ATTEMPT_REQUIRED');q.fresh_snapshot(snapshot['observed_at']);q.fresh_snapshot(recovery['observed_at']);directory=Path(output)
 q.need(not directory.exists() and directory.parent.resolve(strict=True)==directory.parent,'EXCLUSIVE_SEAL_CONTINUATION');directory.mkdir()
 q.write_new(directory,'claim.json',{'format':'public215_r7_seal_only_claim_v1','dataset_id':q.DATASET,'config_sha256':config_sha,'builds_inherited':107,'audits_inherited':856,'attempts':1,'certified':False})
 phase='seal'
 try:
  q.write_new(directory,'seal.started.json',{'operation':'seal_dataset','dataset_id':q.DATASET});receipt=client.call('seal_dataset',{'dataset_id':q.DATASET},timeout_seconds=280);q.need(compactor.seal_receipt_is_valid(receipt),'SEAL_RECEIPT_DIFFERS');q.write_new(directory,'seal.terminal.json',{'status':'acknowledged_exact_receipt','receipt':receipt})
  phase='status';q.write_new(directory,'status.started.json',{'operation':'certification_status','dataset_id':q.DATASET});status=client.call('certification_status',{'dataset_id':q.DATASET},timeout_seconds=280);row=compactor.dataset_item(status,q.DATASET,107);q.need(row['state']=='evaluating' and row['dataset_checksum']==receipt['dataset_checksum'],'SEALED_STATUS_DIFFERS');q.write_new(directory,'status.terminal.json',{'status':'acknowledged_exact_receipt','receipt':status})
 except BaseException as error:
  failed={'status':'unknown_stop','phase':phase,'certified':False,**c.safe_failure(q,error)}
  if not (directory/(phase+'.terminal.json')).exists():q.write_new(directory,phase+'.terminal.json',failed)
  q.write_new(directory,'terminal.json',failed);raise q.Refusal('OUTCOME_UNKNOWN_NO_RETRY') from None
 result={'status':'sealed_evaluating_requires_independent_readback','dataset_checksum':receipt['dataset_checksum'],'builds_inherited':107,'audits_inherited':856,'certified':False};q.write_new(directory,'terminal.json',result);return result

def main():
 global Q,C
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--config',required=True);p.add_argument('--config-sha256',required=True);args=p.parse_args();control=Path(r'C:\sp-v31\mac-v31-public215-r7-corrected-20261030-01a17e88\control')
 for name,path,sha in [('Q',control/'quality-preparation-r2'/'qualify_r7_once.py',Q_SHA),('C',control/'quality-continuation-r3'/'continue_r7_once.py',C_SHA)]:
  import hashlib
  if hashlib.sha256(path.read_bytes()).hexdigest()!=sha:raise ValueError('PROTECTED_SOURCE_REQUIRED')
  spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);globals()[name]=module
 q=Q;c=C;config=load(q,{'path':args.config,'sha256':args.config_sha256});exact(q,config,{'format','base_config','original_r3','recovery_proof','installed_seal_fix'});q.need(config['format']=='public215_r7_seal_once_v1','SEAL_CONFIG_FORMAT');base=load(q,config['base_config']);client,compactor,plan,snapshot=q.admit(base);closed=original(q,c,config['original_r3'],base,plan);recovery=load(q,config['recovery_proof']);fix=load(q,config['installed_seal_fix']);proof(q,c,recovery,fix,plan,snapshot,closed);seal_once(q,c,client,compactor,base['output'],args.config_sha256,snapshot,recovery);return 0
if __name__=='__main__':
 try:code=main()
 except BaseException as error:
  import json
  print(json.dumps({'status':'stopped_requires_durable_outcome_readback','certified':False,**(C.safe_failure(Q,error) if C else {'exception_class':type(error).__name__})},sort_keys=True,separators=(',',':')));code=1
 raise SystemExit(code)
