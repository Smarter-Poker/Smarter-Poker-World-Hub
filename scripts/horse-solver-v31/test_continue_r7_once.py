"""Hermetic closed-prefix orchestration; no science, credentials, network or SQL."""
import ast
import contextlib
import copy
import io
from datetime import datetime,timedelta,timezone
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent

def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result);return result

c=module('continuation_under_test',HERE/'continue_r7_once.py')
qp=HERE/'qualify_r7_once.py'
if not qp.exists():
    qp=HERE.parent/'qualifier-merged-source-archive/scripts/horse-solver-v31/qualify_r7_once.py'
q=module('protected_qualifier_test',qp)

class Client:
    attempts=1
    def __init__(self,fail=None):self.calls=[];self.fail=fail
    def _body(self,op,payload):return q.canonical({'operation':op,'payload':payload})
    def call(self,op,payload,timeout_seconds):
        self.calls.append((op,payload));assert timeout_seconds==280
        if len(self.calls)==self.fail:raise OSError('PRIVATE_SECRET URL?credential=NEVER_SERIALIZE')
        if op=='freeze_model':
            ordinal=payload['preparation_offset'];offset=payload['heldout_board_offset'];entry=payload['context']
            # Eight chronological legal flop boards, distinct within each context.
            board=['AcKd2h','AcKd3h','AcKd4h','AcKd5h','AcKd6h','AcKd7h','AcKd8h','AcKd9h'][offset]
            return {'format':'public215_heldout_physics_v1','dataset_id':q.DATASET,
                'context':entry['context'],'cell_key_checksum':self.plan[ordinal]['cell_key_checksum'],
                'model_checksum':entry['model_checksum'],'template_checksum':self.plan[ordinal]['entry']['template_checksum'],
                'model_build_receipt_checksum':entry['model_build_receipt_checksum'],'board':board,'board_offset':offset,
                'selection_receipt_checksum':self.selection,'capture_receipt_checksum':q.CAPTURE,
                'node_checksum':'a'*64,'artifact_checksum':'b'*64,'audit_key':'c'*64}
        if op=='seal_dataset':return {'dataset_checksum':'d'*64}
        if op=='certification_status':return {'state':'evaluating','dataset_checksum':'d'*64}
        raise AssertionError('Unexpected operation '+op)

class Compactor:
    @staticmethod
    def seal_receipt_is_valid(v):return v=={'dataset_checksum':'d'*64}
    @staticmethod
    def dataset_item(v,dataset,count):assert dataset==q.DATASET and count==107;return v

class ContinuationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR'))
        self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
        self.now=datetime.now(timezone.utc).isoformat()
        self.plan=[]
        for i in range(107):
            e={'context':{'street':'flop','ordinal':f'{i:03}'},'public_model_build_receipt':{'n':i}}
            e.update({f:q.digest(f'{i}:{f}'.encode()) for f in q.FIELDS})
            self.plan.append({'entry':e,'cell_key_checksum':q.digest(f'cell{i}'.encode())})
        self.client=Client();self.client.plan=self.plan;self.client.selection='e'*64
        self.snapshot={'observed_at':self.now,'selection_receipt_checksum':self.client.selection}
        self.cells=[]
        for i,item in enumerate(self.plan):
            self.cells.append({'cell_id':f'11111111-1111-4111-8111-{i:012}',
                'cell_key_checksum':item['cell_key_checksum'],'context':item['entry']['context'],
                **{f:item['entry'][f] for f in q.FIELDS},'sql_physics_checksum':c.CELL_SQL_PHYSICS,
                'source_rows':65,'train_source_rows':57,'holdout_source_rows':8,
                'cell_payload_checksum':'a'*64,'lineage_checksum':'b'*64,'frozen_bindings_match':True,
                'capture_receipt_checksum':q.CAPTURE,'m1_train_receipts':57,'m2_holdout_receipts':8})
        item=self.plan[0];e=item['entry'];self.audits=[]
        for i,board in enumerate(['AcKd2h','AcKd3h']):
            self.audits.append({'observed_at':self.now,'preparation_offset':0,'context':e['context'],'board_offset':i,
                'cell_key_checksum':item['cell_key_checksum'],**{f:e[f] for f in q.FIELDS},
                'board_sha256':q.digest(board.encode()),'selection_receipt_checksum':self.client.selection,
                'capture_receipt_checksum':q.CAPTURE,'node_checksum':'a'*64,'artifact_checksum':'b'*64,
                'expected_audit_key':'c'*64 if i==0 else '268d379b326077a6d20ef38ff8420350c8ba872c3d2d5e69ecf8a48a2a3d04d9',
                'legal_combos':1176,'audit_checksum':'f'*64,'prepared_at':self.now,'derived_combo_rows':1176,
                **{k:True for k in ['frozen_bindings_match','audit_present','physics_key_matches','model_matches','template_matches','frozen_encoding_matches','chronological_board_matches','complete_derived_audit']}})
        envelope={k:e[k] for k in ('context','model_checksum','public_model_build_receipt','model_build_receipt_checksum')}
        self.request=q.digest(self.client._body('freeze_model',{'dataset_id':q.DATASET,'context':envelope,'preparation_offset':0,'heldout_board_offset':1}))
        self.requestpatch=patch.object(c,'REQUEST',self.request);self.requestpatch.start();self.addCleanup(self.requestpatch.stop)
        self.proof={'format':'public215_r7_closed_prefix_recovery_v1','dataset_id':q.DATASET,'observed_at':self.now,
            'original_config_sha256':c.OLD_CONFIG,'original_native_result_sha256':c.OUTER,'model_index_sha256':q.INDEX,
            'source_capture_checksum':q.CAPTURE,'selection_receipt_checksum':self.client.selection,
            'physics_checksum':c.PHYSICS_IMPLEMENTATION,'encoding_checksum':c.ENCODING,'cells':self.cells,'audits':self.audits,
            'unknown_request_body_sha256':self.request,'ingress_claim':{'principal':'COMPACTOR','nonce':'990d54a0-370c-4ace-851c-cd07671f3d21',
            'operation':'freeze_model','signed_at':'2026-10-31T16:32:40Z','received_at':'2026-10-31T16:32:40.726944Z','body_sha256':self.request}}
        self.known={'receipt':self.client.call('freeze_model',{'context':envelope,'preparation_offset':0,'heldout_board_offset':0},280)}
        self.client.calls=[]
    def recovery(self):return c.recovery(q,self.proof,self.plan,self.snapshot,self.client)
    def test_valid_closed_prefix_only854_then_seal_status(self):
        self.assertEqual(len(self.recovery()),2)
        result=c.continue_once(q,self.client,Compactor,self.plan,self.snapshot,self.root/'new','a'*64,self.proof,self.known)
        self.assertEqual(result['completed_new_heldout'],854)
        self.assertEqual([x[0] for x in self.client.calls[-2:]],['seal_dataset','certification_status'])
        physics=self.client.calls[:-2];self.assertEqual(len(physics),854)
        actual=[(p['preparation_offset'],p['heldout_board_offset']) for op,p in physics]
        self.assertEqual(actual,[(i,j) for i in range(107) for j in range(8) if (i,j) not in [(0,0),(0,1)]])
        self.assertTrue(all(op=='freeze_model' for op,_ in physics))
    def test_recovery_refuses_stale_future_missing_or_changed_bindings(self):
        original=copy.deepcopy(self.proof)
        mutations=[lambda p:p.update(observed_at=(datetime.now(timezone.utc)-timedelta(seconds=301)).isoformat()),
            lambda p:p.update(observed_at=(datetime.now(timezone.utc)+timedelta(seconds=30)).isoformat()),
            lambda p:p['cells'].pop(),lambda p:p['cells'][4].update(model_checksum='0'*64),
            lambda p:p['cells'][3].update(cell_key_checksum='a'*64),
            lambda p:p['cells'][1].update(sql_physics_checksum=c.PHYSICS_IMPLEMENTATION),
            lambda p:p.update(physics_checksum=c.CELL_SQL_PHYSICS),
            lambda p:p.update(original_native_result_sha256='a'*64),
            lambda p:p.update(unknown_request_body_sha256='a'*64),
            lambda p:p['audits'][1].update(audit_present=False),lambda p:p['audits'][1].update(derived_combo_rows=1175),
            lambda p:p['audits'][1].update(board_sha256=p['audits'][0]['board_sha256']),
            lambda p:p['audits'][1].update(expected_audit_key='a'*64)]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                self.proof=copy.deepcopy(original);mutate(self.proof)
                with self.assertRaises(q.Refusal):self.recovery()
        self.assertEqual(self.client.calls,[])
    def test_transport_unknown_stops_durably_without_second_call_or_secret(self):
        self.client.fail=1
        with self.assertRaisesRegex(q.Refusal,'OUTCOME_UNKNOWN_NO_RETRY'):
            c.continue_once(q,self.client,Compactor,self.plan,self.snapshot,self.root/'failed','a'*64,self.proof,self.known)
        self.assertEqual(len(self.client.calls),1)
        terminal=json.loads((self.root/'failed/terminal.json').read_text())
        self.assertEqual(terminal['status'],'unknown_stop');self.assertEqual(terminal['phase'],'000.heldout-02')
        self.assertEqual(terminal['completed_new_heldout'],0)
        self.assertNotIn('PRIVATE_SECRET',json.dumps(terminal));self.assertNotIn('credential',json.dumps(terminal))
        self.assertFalse((self.root/'failed/seal.started.json').exists())
    def test_postclaim_outer_status_requires_readback(self):
        self.client.fail=1
        def failed_main():
            c.continue_once(q,self.client,Compactor,self.plan,self.snapshot,self.root/'outer-failed','a'*64,self.proof,self.known)
        tree=ast.parse((HERE/'continue_r7_once.py').read_text())
        footer=ast.Module(body=[tree.body[-1]],type_ignores=[])
        scope={'__name__':'__main__','main':failed_main,'json':json,'safe_failure':c.safe_failure,'Q':q}
        capture=io.StringIO()
        with contextlib.redirect_stdout(capture),self.assertRaises(SystemExit) as stopped:
            exec(compile(footer,str(HERE/'continue_r7_once.py'),'exec'),scope)
        self.assertEqual(stopped.exception.code,1)
        output=json.loads(capture.getvalue())
        self.assertEqual(output['status'],'stopped_requires_durable_outcome_readback')
        self.assertFalse(output['certified'])
        terminal=json.loads((self.root/'outer-failed/terminal.json').read_text())
        self.assertEqual(terminal['status'],'unknown_stop')
        self.assertEqual(len(self.client.calls),1)
        self.assertNotIn('PRIVATE_SECRET',capture.getvalue())

    def test_safe_http_facts_never_exception_text(self):
        class Failure(Exception):status=504;errno=None
        facts=c.safe_failure(q,Failure('AUTHORIZATION Bearer PRIVATE_SECRET URL'))
        self.assertEqual(facts['http_status'],504);self.assertNotIn('PRIVATE_SECRET',json.dumps(facts))
        self.assertNotIn('AUTHORIZATION',json.dumps(facts))
    def test_predecessor_requires107_actual_ack_inventory_and_native_failure(self):
        task=self.root;oldout=task/'public215-qualify-once-r2'
        old={key:{} for key in q.CONFIG};old.update(format='public215_r7_qualify_once_v1',dataset_id=q.DATASET,pipeline_root=str(task/'pipeline'),output=str(oldout))
        base=copy.deepcopy(old);base['output']=str(task/'public215-qualify-once-r3')
        data={};pins={}
        def pin(key,name,value,sha=None):
            raw=q.canonical(value);digest=sha or q.digest(raw);p={'path':str(oldout/name),'sha256':digest};data[p['path']]=value;pins[key]=p
        pin('config','config.json',old,c.OLD_CONFIG)
        pin('claim','claim.json',{'format':'public215_r7_qualify_claim_v1','dataset_id':q.DATASET,'config_sha256':c.OLD_CONFIG,'index_sha256':q.INDEX,'attempts':1,'builds':107,'heldout_physics':856,'certified':False})
        outer={'dataset_id':q.DATASET,'controller_checksum':c.Q_SHA,'config_checksum':c.OLD_CONFIG,'native_exit_code':1,'wrapper_exit_code':1,'supervisor_pid':19812,'controller_pid':24816,'certified':False,'promotion_requested':False}
        pin('outer_native_result','result.json',outer,c.OUTER)
        end={'status':'unknown_stop','phase':'000.heldout-01','completed_builds':107,'completed_physics':1,'http_status':None,'failure_classification':'transport_or_unclassified','certified':False}
        pin('terminal','terminal.json',end,c.TERMINAL)
        pin('unknown_phase_terminal','000.heldout-01.terminal.json',copy.deepcopy(end),c.UNKNOWN)
        pin('unknown_started','000.heldout-01.started.json',{'operation':'freeze_model','dataset_id':q.DATASET},c.UNKNOWN_STARTED)
        pin('known_heldout_terminal','000.heldout-00.terminal.json',self.known,c.KNOWN)
        builds=[]
        for i in range(107):
            value={'status':'acknowledged_exact_receipt','receipt':{'cell_key_checksum':self.plan[i]['cell_key_checksum']}}
            path=str(oldout/f'{i:03}.build.terminal.json');digest=q.digest(q.canonical(value));data[path]=value;builds.append({'path':path,'sha256':digest})
        pins['build_terminals']=builds
        inventory=q.digest(q.canonical([{'ordinal':i,'sha256':p['sha256']} for i,p in enumerate(builds)]))
        def fake_load(_q,pin,expected=None,limit=None):
            if expected is not None:q.need(pin['sha256']==expected,'ORIGINAL_PIN_REQUIRED')
            return copy.deepcopy(data[pin['path']])
        with patch.object(c,'load',side_effect=fake_load),patch.object(c,'BUILDS',inventory):
            self.assertEqual(len(c.predecessor(q,pins,base)[0]),107)
            for code in [None,0,True]:
                outer['native_exit_code']=code
                with self.assertRaisesRegex(q.Refusal,'ORIGINAL_NATIVE_FAILURE'):c.predecessor(q,pins,base)
            outer['native_exit_code']=1
            removed=builds.pop()
            with self.assertRaisesRegex(q.Refusal,'ALL_ORIGINAL_BUILDS'):c.predecessor(q,pins,base)
            builds.append(removed);builds[2]['sha256']='f'*64
            with self.assertRaisesRegex(q.Refusal,'CLOSED_BUILD_ACK_BYTES'):c.predecessor(q,pins,base)
            builds[2]['sha256']=q.digest(q.canonical(data[builds[2]['path']]))
            pins['outer_native_result']['sha256']='e'*64
            with self.assertRaisesRegex(q.Refusal,'ORIGINAL_PIN_REQUIRED'):c.predecessor(q,pins,base)

    def test_pinned_predecessor_bytes_refuse_hash_tamper(self):
        file=self.root/'pin.json';file.write_text('{"native_exit_code":1}')
        pin={'path':str(file),'sha256':q.digest(file.read_bytes())}
        self.assertEqual(c.load(q,pin)['native_exit_code'],1)
        file.write_text('{"native_exit_code":null}')
        with self.assertRaisesRegex(q.Refusal,'PINNED_BYTES_DIFFER'):c.load(q,pin)

if __name__=='__main__':unittest.main()
