import ast,importlib.util,tempfile,unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta
from types import SimpleNamespace
HERE=Path(__file__).resolve().parent
def mod(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
p=mod('preseal',HERE/'prepare_then_seal_r7_once.py');q=mod('q',HERE/'qualify_r7_once.py');c=mod('c',HERE/'continue_r7_once.py')
class PreparationTests(unittest.TestCase):
 def fixture(self):
  plan=[{'entry':{'context':{'ordinal':f'{i:03d}'},**{k:q.digest(f'{i}:{k}'.encode()) for k in p.FIELDS}},'cell_key_checksum':q.digest(f'cell{i}'.encode())} for i in range(107)];fingerprint='a'*64;now={'observed_at':datetime.now(timezone.utc).isoformat()};calls=[]
  def receipt(i):
   item=plan[i];return {'format':'public215_preseal_cell_v1','dataset_id':q.DATASET,'preparation_offset':i,'cell_key_checksum':item['cell_key_checksum'],**{k:item['entry'][k] for k in p.FIELDS},'receipt_checksum':q.digest(f'receipt{i}'.encode()),'qualification_fingerprint':fingerprint,'status':'prepared'}
  class Client:
   attempts=1
   def _body(self,op,payload):return q.canonical({'operation':op,'payload':payload})
   def call(self,op,payload,**kwargs):
    calls.append((op,payload));return receipt(payload['preparation_offset']) if 'phase' in payload else {'dataset_checksum':'b'*64}
  comp=SimpleNamespace(seal_receipt_is_valid=lambda x:x=={'dataset_checksum':'b'*64},dataset_item=lambda *a:{'state':'evaluating','dataset_checksum':'b'*64})
  return plan,fingerprint,now,calls,Client,comp,receipt
 def test_exact_receipt_and_wrong_bindings(self):
  plan,fp,_,_,_,_,receipt=self.fixture();v=receipt(0);p.prepared_receipt(q,v,plan[0],0,fp)
  for key,value in [('model_checksum','f'*64),('preparation_offset',True),('qualification_fingerprint','e'*64),('status','stale')]:
   bad={**v,key:value}
   with self.assertRaises(q.Refusal):p.prepared_receipt(q,bad,plan[0],0,fp)
 def test_107_preparations_then_one_seal_status_and_duplicate_refusal(self):
  plan,fp,now,calls,Client,comp,_=self.fixture()
  with tempfile.TemporaryDirectory(dir=HERE) as tmp:
   out=str(Path(tmp)/'once');p.prepare_once(q,c,Client(),comp,plan,now,now,out,'c'*64,fp)
   with self.assertRaises(q.Refusal):p.prepare_once(q,c,Client(),comp,plan,now,now,out,'c'*64,fp)
  self.assertEqual(len(calls),109);self.assertEqual([x[1]['preparation_offset'] for x in calls[:107]],list(range(107)));self.assertEqual([x[0] for x in calls[-2:]],['seal_dataset','certification_status']);self.assertFalse(any(x[0] in ['build_cell','freeze_model'] for x in calls))
 def test_timeout_stops_before_next_phase(self):
  plan,fp,now,calls,Client,comp,_=self.fixture()
  class TimeoutClient(Client):
   def call(self,op,payload,**kwargs):calls.append((op,payload));raise TimeoutError('secret-message')
  with tempfile.TemporaryDirectory(dir=HERE) as tmp:
   out=Path(tmp)/'once'
   with self.assertRaisesRegex(q.Refusal,'OUTCOME_UNKNOWN_NO_RETRY'):p.prepare_once(q,c,TimeoutClient(),comp,plan,now,now,str(out),'c'*64,fp)
   self.assertNotIn('secret-message',(out/'terminal.json').read_text())
  self.assertEqual(len(calls),1)
 def test_stale_admission_has_no_claim_or_call(self):
  plan,fp,now,calls,Client,comp,_=self.fixture();stale={'observed_at':(datetime.now(timezone.utc)-timedelta(seconds=301)).isoformat()}
  with tempfile.TemporaryDirectory(dir=HERE) as tmp:
   out=Path(tmp)/'once'
   with self.assertRaises(q.Refusal):p.prepare_once(q,c,Client(),comp,plan,now,stale,str(out),'c'*64,fp)
   self.assertFalse(out.exists())
  self.assertEqual(calls,[])
 def test_frozen_output_predicate_and_main_admission_wiring(self):
  # Execute the exact output guard AST from frozen q.admit, without loading
  # manifests/models/credentials or calling its later authority RPC.
  tree=ast.parse((HERE/'qualify_r7_once.py').read_text());admit=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='admit')
  guard=next(n for n in admit.body if isinstance(n,ast.Expr) and isinstance(n.value,ast.Call) and any(isinstance(x,ast.Constant) and x.value=='NEW_OFFICIAL_OUTPUT_REQUIRED' for x in ast.walk(n)))
  code=compile(ast.fix_missing_locations(ast.Module(body=[guard],type_ignores=[])),'frozen-output-guard','exec')
  with tempfile.TemporaryDirectory(dir=HERE) as tmp:
   task=Path(tmp)
   for name,valid in [('public215-qualify-once-preseal-r5',True),('public215-preseal-once-r5',False)]:
    scope={'need':q.need,'output':task/name,'task':task}
    if valid:exec(code,scope)
    else:
     with self.assertRaises(q.Refusal):exec(code,scope)
  candidate=ast.parse((HERE/'prepare_then_seal_r7_once.py').read_text());main=next(n for n in candidate.body if isinstance(n,ast.FunctionDef) and n.name=='main')
  calls=[ast.unparse(n.func) for n in ast.walk(main) if isinstance(n,ast.Call)]
  for name in ['q.admit','original','proof','prepare_once']:self.assertIn(name,calls)
  self.assertNotIn('q.run_once',calls)
  original=next(n for n in candidate.body if isinstance(n,ast.FunctionDef) and n.name=='original')
  self.assertIn('public215-qualify-once-preseal-r5',[n.value for n in ast.walk(original) if isinstance(n,ast.Constant) and isinstance(n.value,str)])
 def test_closed_23_catalog_rejects_missing_zero_or_mismatched_helper(self):
  self.assertEqual(len(p.FUNCTIONS),23);valid={k:'a'*32 for k in p.FUNCTIONS};p.validate_catalog(q,valid,dict(valid))
  missing=dict(valid);missing.pop('fn_gto_v31_prepare_seal_cell(uuid,text)')
  zero={**valid,'fn_gto_v31_seal_preparation_guards()':'0'*32}
  changed={**valid,'fn_gto_v31_public215_cell_metric_raw(uuid,uuid)':'b'*32}
  for actual in [missing,zero,changed]:
   with self.assertRaises(q.Refusal):p.validate_catalog(q,actual,valid)
if __name__=='__main__':unittest.main()
