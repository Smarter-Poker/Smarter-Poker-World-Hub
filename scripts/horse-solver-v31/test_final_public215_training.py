"""Only synthetic metadata, numeric fitted-array stubs and changed trainer guards.
No fit(), solver, licensed source, holdout, network or production operation.
"""
import copy
import json
import types
import tempfile
import shutil
import subprocess
import itertools
import hashlib
from pathlib import Path
import unittest
import uuid
from decimal import Decimal
from unittest.mock import patch

import numpy as np
from sklearn.ensemble._hist_gradient_boosting.common import PREDICTOR_RECORD_DTYPE
from contract import ContractError
from public_hist215 import canonical_bytes,digest,decode_f64
from final_public215_training import (PARAMETERS,artifact_database_checksums,pg_json_text,
    export_scalar_head,training_arrays,validate_capture_index,parse_official_node,public_matrix,SHA,validate_public_partition,reference_cases,GatewayJSONNormalizer,capture_receipt_sources)


def scalar_stub():
    nodes=np.zeros(3,dtype=PREDICTOR_RECORD_DTYPE)
    nodes[0]['feature_idx']=214;nodes[0]['num_threshold']=-0.0;nodes[0]['left']=1;nodes[0]['right']=2;nodes[0]['missing_go_to_left']=1
    nodes[1]['is_leaf']=1;nodes[1]['value']=-0.0;nodes[2]['is_leaf']=1;nodes[2]['value']=np.nextafter(0.0,1.0)
    p=types.SimpleNamespace(nodes=nodes,binned_left_cat_bitsets=np.zeros((0,8),dtype='uint32'),raw_left_cat_bitsets=np.zeros((0,8),dtype='uint32'))
    return types.SimpleNamespace(get_params=lambda deep=False:{**PARAMETERS,'loss':'squared_error','learning_rate':.1},n_features_in_=215,n_trees_per_iteration_=1,is_categorical_=None,_baseline_prediction=np.array([[-0.0]],dtype='float64'),_predictors=[[p]for _ in range(100)])


class FinalPublic215TrainingTests(unittest.TestCase):
    def test_lossless_scalar_export_uses_stored_leaf_values_and_exact_dtype(self):
        m=scalar_stub();head=export_scalar_head(m)
        self.assertEqual(head['baseline_f64'],'8000000000000000');self.assertEqual(len(head['trees']),100)
        self.assertEqual(head['trees'][0][0],{'feature':214,'threshold_f64':'8000000000000000','left':1,'right':2,'missing_left':True})
        self.assertEqual(head['trees'][0][1],{'value_f64':'8000000000000000'});self.assertEqual(head['trees'][0][2],{'value_f64':'0000000000000001'})
        m._predictors[0][0].nodes[2]['value']=.375
        self.assertEqual(decode_f64(export_scalar_head(m)['trees'][0][2]['value_f64']),.375)  # No second learning-rate shrinkage.

    def test_export_refuses_unsupported_layout_categories_or_parameters(self):
        for mutate in [lambda m:m._predictors.pop(),lambda m:setattr(m,'_baseline_prediction',np.array([[1]],dtype='float32')),
                       lambda m:m._predictors[0][0].nodes.__setitem__('is_categorical',1),
                       lambda m:m._predictors[0][0].nodes[0].__setitem__('left',0),
                       lambda m:m._predictors[0][0].nodes[0].__setitem__('num_threshold',np.inf),
                       lambda m:setattr(m,'get_params',lambda deep=False:{**PARAMETERS,'loss':'squared_error','learning_rate':.2})]:
            m=scalar_stub();mutate(m)
            with self.assertRaises(ContractError):export_scalar_head(m)

    def test_exact_equal_board_mass_and_policy_Q_frequency_column_order(self):
        nodes=[{'positive':[1,3],'actions':['b20','c'],'weights':[1.,3.],'policy':[10.,20.],'action_EV':[[1.,2.],[3.,4.]],'frequency':[[.4,.6],[.2,.8]]},
               {'positive':[2],'actions':['b20','c'],'weights':[100.],'policy':[30.],'action_EV':[[5.,6.]],'frequency':[[.6,.4]]}]
        group={'rows':[{'combo_indices':[1,3],'offset':0},{'combo_indices':[2],'offset':2}]}
        X,Y,w=training_arrays(nodes,group,np.arange(645,dtype='float64').reshape(3,215))
        np.testing.assert_array_equal(w,[.375,1.125,1.5]);np.testing.assert_array_equal(Y[0],[10,1,2,.4,.6]);self.assertEqual(X.shape,(3,215))
        self.assertEqual(nodes[0]['weights'],[1.,3.])
        with self.assertRaises(ContractError):training_arrays(nodes[:1],group,X)

    def test_pg_numeric_lexical_scale_key_order_and_nonfinite_refusal(self):
        value=json.loads('{"long":true,"a":[1e-6,-0.0,1.0]}',parse_float=Decimal)
        self.assertEqual(pg_json_text(value),'{"a": [0.000001, 0.0, 1.0], "long": true}')
        self.assertEqual(pg_json_text(value,compact_sorted=True),'{"a":[0.000001,0.0,1.0],"long":true}')
        for v in [Decimal('Infinity'),Decimal('1e10000')]:
            with self.assertRaises(ContractError):pg_json_text(v)
        with self.assertRaises(ContractError):artifact_database_checksums(b'{"a":1,"a":2}')

    def test_db_normalized_artifact_checksum_fixture_matches_native_PG17(self):
        raw=b'{"scenario_hash":"public-only","strategy_matrix_v2":{"schema":"s","combo_order":"c","nodes":[{"z":-0.0,"a":1e-6,"aa":[1,1.0],"b":true}]}}'
        self.assertEqual(artifact_database_checksums(raw),('99ed12f5a254ad5848d34f47a223101f18c87bf9cb994a107e058a2c2830344c','b61ed30354b4ed159a9b6d94a968bde3a32c24675d09db1ecd58ce0b6a37c641'))

    def test_global_capture_receipt_is_exact_SQL_five_field_sorted_census(self):
        row={'source_row_id':'11111111-1111-4111-8111-111111111111','source_node':'r:0:c','board':'2c7dTh','artifact_checksum':'a'*64,'node_checksum':'b'*64,'target_id':'planned-only','scenario_id':'scenario','context':{'not':'SQLcapturetuple'},'artifact_path':'/external/artifact','artifact_file_sha256':'c'*64}
        other={**row,'source_row_id':'22222222-2222-4222-8222-222222222222','source_node':'r:0'}
        projected=capture_receipt_sources([other,row]);self.assertEqual(set(projected[0]),{'source_row_id','source_node','board','artifact_checksum','node_checksum'});self.assertEqual(projected[0]['source_row_id'],row['source_row_id'])
        changed={**row,'target_id':'different','artifact_path':'/external/other','artifact_file_sha256':'d'*64}
        self.assertEqual(digest(capture_receipt_sources([other,changed])),digest(projected))
        self.assertNotEqual(digest(capture_receipt_sources([other,{**row,'node_checksum':'e'*64}])),digest(projected))

    def test_public_root_actor_uses_actual_maintained_parser_API(self):
        import inspect
        from pio_upi import analyze_node
        self.assertIn('preflop_aggressor',inspect.signature(analyze_node).parameters)
        self.assertEqual(analyze_node('r:0:c',root_pot_chips=60,effective_stack_chips=800,preflop_aggressor=1).actor,1)
        import final_public215_training as driver
        self.assertNotIn('preflop_aggressor_solver_player=',inspect.getsource(driver.load_feature_index))

    def test_actual_JS_gateway_numeric_transport_normalization(self):
        node=Path(shutil.which('node')).resolve()
        dep={'node_executable':str(node),'node_executable_sha256':SHA(node.read_bytes()),'node_version':subprocess.run([str(node),'--version'],capture_output=True,text=True,check=True).stdout.strip()}
        raw=b'{"scale":1.0,"zero":-0.0,"small":1e-7,"fixed":1e-6,"max":9007199254740991}'
        with GatewayJSONNormalizer(dep) as normalizer:
            self.assertEqual(normalizer.normalize(raw),b'{"scale":1,"zero":0,"small":1e-7,"fixed":0.000001,"max":9007199254740991}')
            wrapped=b'{"scenario_hash":"public-only","strategy_matrix_v2":{"schema":"s","combo_order":"c","nodes":[{"z":-0.0,"a":1e-6,"aa":[1,1.0],"b":true}]}}'
            normalized=normalizer.normalize(wrapped)
            self.assertEqual(artifact_database_checksums(normalized),('03954c15e26f5088b9e16a55ff3762f43a9ab6f1859d25cae8a41ea8f4fa0d2b','b02cfb6725ffc5c6006dae3a10aaa92141323c668c6f17c573e1debdfc4a2f45'))
            with self.assertRaises(ContractError):normalizer.normalize(b'{"a":1,"a":2}')
            for unsafe in [b'{"n":1e21}',b'{"n":1000000000000000128}']:
                with self.assertRaises(ContractError):normalizer.normalize(unsafe)
        with self.assertRaises(ContractError):GatewayJSONNormalizer({**dep,'node_executable_sha256':'0'*64})

    def test_public_npy_is_exact_float64_finite_c_order_and_exact_file_frame(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'public.npy'
            def group():return {'matrix_path':str(path),'matrix_sha256':SHA(path.read_bytes()),'row_count':2}
            np.save(path,np.zeros((2,215),dtype='<f8'),allow_pickle=False)
            matrix=public_matrix(group());self.assertEqual(matrix.shape,(2,215));del matrix
            for values in [np.zeros((2,215),dtype='float32'),np.full((2,215),np.nan),np.asfortranarray(np.zeros((2,215)))]:
                np.save(path,values,allow_pickle=False)
                with self.assertRaises(ContractError):public_matrix(group())
            np.save(path,np.zeros((2,215),dtype='<f8'),allow_pickle=False)
            with path.open('ab')as output:output.write(b'foreign trailing bytes')
            with self.assertRaises(ContractError):public_matrix(group())

    def test_source_weight_parser_keeps_matchups_not_actor_reach_and_NULL_rules(self):
        acts=['c','b20'];n={'node_context':{'board':'2c7dTh'},'action_specs':{'c':{'family':'check','size_unit':'none','size_value':None,'all_in':False},'b20':{'family':'bet','size_unit':'pot_fraction','size_value':.5,'all_in':False}},'matchups':[0.]*1326,'policy_evs_bb':[None]*1326,'frequencies':{a:[0.]*1326 for a in acts},'action_evs_bb':{a:[None]*1326 for a in acts},'solver_ranges':{'OOP':[.5]*1326,'IP':[.25]*1326}}
        n['matchups'][1325]=7.;n['policy_evs_bb'][1325]=5.2500005;n['frequencies']['b20'][1325]=.25;n['frequencies']['c'][1325]=.75;n['action_evs_bb']['b20'][1325]=3.;n['action_evs_bb']['c'][1325]=6.
        ex={'context':{},'target':{'board':'2c7dTh','expected_children':acts},'scenario':{}}
        with patch('worker.artifact_matches',return_value=True):
            out=parse_official_node({'strategy_matrix_v2':{'nodes':[n]}},None,ex)
            self.assertEqual(out['weights'],[7.]);self.assertEqual(out['policy'],[5.2500005]);self.assertEqual(out['actions'],['b20','c'])
            bad=copy.deepcopy(n);bad['policy_evs_bb'][0]=0
            with self.assertRaises(ContractError):parse_official_node({'strategy_matrix_v2':{'nodes':[bad]}},None,ex)
            bad=copy.deepcopy(n);bad['frequencies']['c'][0]=float('nan')
            with self.assertRaises(ContractError):parse_official_node({'strategy_matrix_v2':{'nodes':[bad]}},None,ex)

    def test_reference_cases_retain_actual_raw_heads_and_whole_numpy_outputs(self):
        case={'board':'2c7dTh','own':['Ac','Kd'],'features_f64':['0000000000000000']*215}
        raw=np.array([[7,2,4,.25,.75]],dtype='float64')
        direct=reference_cases(raw,[case],2,'direct')[0];coherent=reference_cases(raw,[case],2,'coherent')[0]
        self.assertEqual(decode_f64(direct['policy_ev_f64']),7);self.assertEqual(decode_f64(coherent['policy_ev_f64']),3.5)
        self.assertEqual([decode_f64(v)for v in coherent['raw_heads_f64']],[7,2,4,.25,.75])
        with self.assertRaises(ContractError):reference_cases(np.array([[7,2,4,-1,-1.]]),[case],2,'direct')

    def test_public_partition_and_manifest_row_order_are_checked_before_labels(self):
        ranks='23456789TJQKA';seed='c5249229e6f30e77c148647cae19a9178d841a546d0b07b109f418ce1824f5db';ctx={'street':'flop','texture_class':'Brud'};cid=digest(ctx)
        fold=lambda sig:int(SHA((seed+sig).encode()),16)%3
        reserved=lambda sig:int(SHA(('R7-domain-reserve:'+seed+sig).encode()),16)%5==0
        from pio_upi import texture_class
        candidates=[(f'3:{a}{b}{c}',c+'s'+b+'d'+a+'c')for a,b,c in itertools.combinations(ranks,3)if texture_class(c+'s'+b+'d'+a+'c')=='Brud']
        selected=[x for f in range(3)for x in [v for v in candidates if not reserved(v[0]) and fold(v[0])==f][:19]]
        expected={str(i):{'context_id':cid,'context':ctx,'target':{'board':board,'node':'r:0'}}for i,(_,board)in enumerate(selected)};contexts={cid:list(expected)}
        semantics=[{'context_id':cid,'board':e['target']['board'],'source_node':'r:0'}for e in expected.values()]
        recipe={'training_order':'manifest_scenario_then_target_array_M1_order','public_semantic_order_checksum':digest(semantics),'board_weighting':'matchups_div_board_sum_then_global_mean_1','heads':'policy_then_sorted_action_EV_then_sorted_frequency'}
        partition={'format':'public_hist215_source_partition_protocol_v1','public_seed':seed,'cross_validation_fold_rule':'int(SHA256(public_seed+signature),16)%3','reserve_rule':"int(SHA256('R7-domain-reserve:'+public_seed+signature),16)%5==0",'old_R6_holdout_rank_signatures':[],'old_R6_all_rank_signatures':[],
            'training_contexts':[{'context_id':cid,'context':ctx,'rank_signatures':sorted(sig for sig,_ in selected)}],
            'm2_selection':{'format':'public_hist215_m2_selection_protocol_v1','boards_per_context':8,'seed_bytes':32,'seed_commitment_checksum':'1'*64,'contexts':[{'context_id':cid,'context':ctx,'candidates':[{'board':board,'rank_signature':sig}for sig,board in candidates if reserved(sig)]}]}}
        manifest=types.SimpleNamespace(raw={'public215_protocols':{'training_recipe':recipe,'source_partition':partition}})
        validate_public_partition(manifest,expected,contexts)
        recipe['public_semantic_order_checksum']=digest(list(reversed(semantics)))
        with self.assertRaises(ContractError):validate_public_partition(manifest,expected,contexts)

    def test_capture_header_is_M1_terminal_6099_and_never_creates_receipts(self):
        raw={'input_bundle_id':str(uuid.uuid4()),'input_bundle_checksum':'1'*64,'pipeline_commit':'2'*40,'pipeline_bundle_checksum':'3'*64,
             **{k:'4'*64 for k in ['solver_binary_checksum','range_bundle_checksum','source_combo_order_checksum','icm_model_checksum']}}
        manifest=types.SimpleNamespace(raw=raw,checksum='5'*64)
        index={'format':'public_hist215_final_M1_capture_index_v1','dataset_id':str(uuid.uuid4()),'input_bundle_id':raw['input_bundle_id'],
               'input_bundle_checksum':raw['input_bundle_checksum'],'manifest_checksum':manifest.checksum,'producer_commit':raw['pipeline_commit'],
               'producer_bundle_checksum':raw['pipeline_bundle_checksum'],**{k:raw[k]for k in ['solver_binary_checksum','range_bundle_checksum','source_combo_order_checksum','icm_model_checksum']},
               'machine_id':'M2','approval_status':'approved','source_count':6099,'context_count':107,'capture_receipt_checksum':'6'*64,'sources':[]}
        with self.assertRaises(ContractError):validate_capture_index(index,manifest,{})
        index['machine_id']='M1'
        with self.assertRaises(ContractError):validate_capture_index(index,manifest,{})


if __name__=='__main__':unittest.main()
