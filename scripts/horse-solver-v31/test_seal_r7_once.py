"""Hermetic seal-only boundaries; no credentials, network or production data."""
import copy,importlib.util,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from datetime import datetime,timezone
HERE=Path(__file__).resolve().parent

def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
s=module('seal',HERE/'seal_r7_once.py')
q=module('qualifier',HERE/'qualify_r7_once.py')
c=module('continuation',HERE/'continue_r7_once.py')
class SealOnlyTests(unittest.TestCase):
 def fixture(self):
  now=datetime.now(timezone.utc).isoformat();h=lambda x:q.digest(str(x).encode());plan=[];cells=[];audits=[];acks={};boards=['AcKd2h','AdKh3s','AhKs4d','AsKc5h','QcJd6s','QdJh7c','QhJs8d','QsJc9h'];selection=h('selection')
  for i in range(107):
   e={'context':{'street':'flop','ordinal':i},**{k:h((i,k)) for k in q.FIELDS}};key=h(('cell',i));plan.append({'entry':e,'cell_key_checksum':key})
   cells.append({'cell_id':f'{i:08x}-0000-0000-0000-000000000000','context':e['context'],'cell_key_checksum':key,**{k:e[k] for k in q.FIELDS},'sql_physics_checksum':c.CELL_SQL_PHYSICS,'source_rows':65,'train_source_rows':57,'holdout_source_rows':8,'m1_train_receipts':57,'m2_holdout_receipts':8,'cell_payload_checksum':h(('payload',i)),'lineage_checksum':h(('lineage',i)),'frozen_bindings_match':True,'capture_receipt_checksum':q.CAPTURE})
   for o,b in enumerate(boards):
    ack={'format':'public215_heldout_physics_v1','dataset_id':q.DATASET,'context':e['context'],'cell_key_checksum':key,**{k:e[k] for k in ('model_checksum','template_checksum','model_build_receipt_checksum')},'board':b,'board_offset':o,'selection_receipt_checksum':selection,'capture_receipt_checksum':q.CAPTURE,'node_checksum':h(('node',i,o)),'artifact_checksum':h(('artifact',i,o)),'audit_key':h(('audit',i,o))}
    a={'observed_at':now,'preparation_offset':i,'context':e['context'],'board_offset':o,'cell_key_checksum':key,**{k:e[k] for k in q.FIELDS},'board_sha256':h(b),'selection_receipt_checksum':selection,'capture_receipt_checksum':q.CAPTURE,'node_checksum':ack['node_checksum'],'artifact_checksum':ack['artifact_checksum'],'expected_audit_key':ack['audit_key'],'legal_combos':1176,'derived_combo_rows':1176,'audit_checksum':h(('sum',i,o)),'prepared_at':now,**{k:True for k in ['frozen_bindings_match','audit_present','physics_key_matches','model_matches','template_matches','frozen_encoding_matches','chronological_board_matches','complete_derived_audit']}}
    audits.append(a)
    if (i,o)!=(0,1):acks[(i,o)]=ack
  proof={'format':'public215_r7_seal_recovery_v1','dataset_id':q.DATASET,'observed_at':now,'model_index_sha256':q.INDEX,'source_capture_checksum':q.CAPTURE,'selection_receipt_checksum':selection,'state':'building','dataset_checksum':None,'sealed_at':None,'original_backend_pid':2616742,'original_query_start':'2026-10-31T21:42:04.103539Z','original_xact_start':'2026-10-31T21:42:04.101671Z','original_transaction_active':False,'rollback_sqlstate':'57014','rollback_at':'2026-10-31T21:46:04.103Z','physics_checksum':c.PHYSICS_IMPLEMENTATION,'encoding_checksum':c.ENCODING,'function_hashes':{k:'a'*32 for k in s.FUNCTIONS},'cells':cells,'audits':audits}
  fix={'format':'public215_r7_installed_seal_fix_v1','protected_commit':'a'*40,'migration_version':'20261031220000','migration_sha256':h('test migration'),'function_hashes':{k:'a'*32 for k in s.FUNCTIONS},'installed_history_verified':True,'qualified_native':True,'physics_checksum':c.PHYSICS_IMPLEMENTATION,'encoding_checksum':c.ENCODING}
  return proof,fix,plan,{'observed_at':now,'selection_receipt_checksum':selection},(acks,copy.deepcopy(audits[1]))
 def test_full_metadata_binding(self):s.proof(q,c,*self.fixture())
 def test_original_live_or_unknown_transaction_refused(self):
  for v in (True,None):
   args=list(self.fixture());args[0]['original_transaction_active']=v
   with self.assertRaises(q.Refusal):s.proof(q,c,*args)
 def test_already_committed_seal_refused(self):
  for k,v in [('state','evaluating'),('dataset_checksum','a'*64),('sealed_at',datetime.now(timezone.utc).isoformat())]:
   args=list(self.fixture());args[0][k]=v
   with self.assertRaises(q.Refusal):s.proof(q,c,*args)
 def test_partial_or_mismatched_audit_proof_refused(self):
  for mutate in (lambda p:p['audits'].pop(),lambda p:p['audits'][7].update(model_checksum='b'*64),lambda p:p['function_hashes'].update({'fn_gto_v31_public215_model_canonical_fast(jsonb)':'b'*32})):
   args=list(self.fixture());mutate(args[0])
   with self.assertRaises(q.Refusal):s.proof(q,c,*args)
 def test_missing_or_zero_function_hash_refused(self):
  for mutate in (lambda p:p['function_hashes'].pop('fn_gto_v31_cell_payload_checksum(jsonb)'),lambda p:p['function_hashes'].update({'fn_gto_v31_public215_canonical(jsonb)':'0'*32})):
   args=list(self.fixture());mutate(args[0])
   with self.assertRaises(q.Refusal):s.proof(q,c,*args)
 def test_missing_854_receipt_refused(self):
  args=self.fixture();item=args[2][0];known={'receipt':args[4][0][(0,0)]};recovered={'metadata':args[4][1]}
  with self.assertRaisesRegex(q.Refusal,'ALL854_ACKS'):s.reconcile(q,[item],{},known,recovered)
 def test_exclusive_claim_and_only_two_allowed_calls(self):
  now=datetime.now(timezone.utc).isoformat();snapshot={'observed_at':now};calls=[];sealed={'dataset_checksum':'a'*64}
  class Client:
   attempts=1
   def call(self,op,payload,**kwargs):calls.append(op);return sealed
  comp=SimpleNamespace(seal_receipt_is_valid=lambda v:v==sealed,dataset_item=lambda *a:{'state':'evaluating',**sealed})
  with tempfile.TemporaryDirectory(dir=HERE) as tmp:
   out=str(Path(tmp)/'exclusive');s.seal_once(q,c,Client(),comp,out,'b'*64,snapshot,snapshot)
   with self.assertRaises(q.Refusal):s.seal_once(q,c,Client(),comp,out,'b'*64,snapshot,snapshot)
  self.assertEqual(calls,['seal_dataset','certification_status'])
 def test_unknown_seal_stops_without_status_or_retry(self):
  calls=[];now={'observed_at':datetime.now(timezone.utc).isoformat()}
  class Client:
   attempts=1
   def call(self,op,payload,**kwargs):calls.append(op);raise TimeoutError('sensitive forbidden message')
  with tempfile.TemporaryDirectory(dir=HERE) as tmp:
   out=Path(tmp)/'once'
   with self.assertRaisesRegex(q.Refusal,'OUTCOME_UNKNOWN_NO_RETRY'):s.seal_once(q,c,Client(),None,str(out),'b'*64,now,now)
   self.assertNotIn('sensitive',(out/'terminal.json').read_text())
  self.assertEqual(calls,['seal_dataset'])
if __name__=='__main__':unittest.main()
