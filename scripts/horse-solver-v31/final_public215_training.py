#!/usr/bin/env python3
"""Finite final M1-only training from approved official artifacts, never research.

No Pio, network, pickle, holdout, promotion, selection or implicit retry. The
protected controller supplies actual DB capture identities and a pre-fit receipt.
Public dense feature matrices are supplied separately; this driver does not run
per-holding native physics. Draft outputs still require genuine Linux parity and
COMPACTOR/SQL certification. Importing this module performs no file/data access.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import platform
import subprocess
import sys
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any

from contract import ApprovedManifest, ContractError, load_manifest, _json_bytes
from public_hist215 import (FEATURE_DESCRIPTOR_SHA256, FROZEN_PARAMETERS, canonical_bytes,
                            digest, encode_f64, serialize_model, serialize_training_provenance, UUID, decode_f64)

PARAMETERS = {"max_iter":100,"max_leaf_nodes":15,"min_samples_leaf":10,
              "l2_regularization":10.0,"early_stopping":False,"random_state":731}
SOURCE_KEYS = {"target_id","scenario_id","context_id","context","board","source_row_id",
               "source_node","artifact_path","artifact_file_sha256","artifact_checksum","node_checksum"}
CAPTURE_BINDINGS = {"dataset_id","input_bundle_id","input_bundle_checksum","manifest_checksum",
                    "producer_commit","producer_bundle_checksum","solver_binary_checksum",
                    "range_bundle_checksum","source_combo_order_checksum","icm_model_checksum"}
TRAINER_FORMAT = "public_hist215_final_M1_training_v1"
SHA = lambda b: hashlib.sha256(b).hexdigest()


def need(condition: Any, message: str) -> None:
    if not condition:
        raise ContractError("final public215: " + message)


def exact(value: Any, keys: set[str]) -> dict:
    need(isinstance(value, dict) and set(value) == keys, "exact object keys")
    return value


def nonzero_hash(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and value != "0"*64 and all(c in "0123456789abcdef" for c in value)


def pinned_json(path: str | Path, checksum: str, limit: int = 64*1024*1024) -> dict:
    need(nonzero_hash(checksum), "required file SHA")
    with Path(path).open("rb") as source:
        raw = source.read(limit+1)
    need(len(raw) <= limit and SHA(raw) == checksum, "pinned file bytes")
    value = _json_bytes(raw, "final public215 pinned JSON")
    need(isinstance(value, dict), "JSON object")
    return value


def public_context_id(context: dict) -> str:
    return digest(context)


def pg_json_text(value: Any, *, compact_sorted: bool = False) -> str:
    """Bounded ASCII PostgreSQL JSONB text, from Decimal-parsed artifact bytes.

    Node checksum uses JSONB length/byte key order plus spaces. The maintained
    source-artifact function instead recursively sorts keys C/ASCII, compactly.
    Numeric lexical scale is retained; numeric negative zero has no sign in PG.
    Never replace this with Python float JSON for DB checksum authentication.
    """
    if value is None:
        return "null"
    if type(value) is bool:
        return "true" if value else "false"
    if isinstance(value, str):
        need(all(32 <= ord(c) <= 126 for c in value), "checksum ASCII source strings")
        return json.dumps(value, ensure_ascii=False)
    if type(value) is int:
        need(abs(value) <= 10**309, "checksum integer bound")
        return str(value)
    if isinstance(value, Decimal):
        need(value.is_finite() and -324 <= value.adjusted() <= 308, "checksum numeric bound")
        return format(abs(value) if value.is_zero() else value, "f")
    if isinstance(value, list):
        join = "," if compact_sorted else ", "
        return "[" + join.join(pg_json_text(v, compact_sorted=compact_sorted) for v in value) + "]"
    need(isinstance(value, dict) and all(isinstance(k,str) for k in value), "checksum value kind")
    keys = sorted(value) if compact_sorted else sorted(value, key=lambda k:(len(k.encode("ascii")),k.encode("ascii")))
    sep, join = (":", ",") if compact_sorted else (": ", ", ")
    return "{" + join.join(pg_json_text(k) + sep + pg_json_text(value[k],compact_sorted=compact_sorted) for k in keys) + "}"


# The authenticated gateway parses JSON as binary64 Numbers and the Supabase
# client serializes them again. Use the actual pinned JS runtime, never a Python
# shortest-decimal approximation (unsafe integers and exponent boundaries differ).
_GATEWAY_NORMALIZER_JS = r"""import readline from 'node:readline';
const input = readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await (const line of input) {
  const value=JSON.parse(JSON.parse(line));
  process.stdout.write(JSON.stringify(JSON.stringify(value))+'\n');
}
"""

class GatewayJSONNormalizer:
    """One finite data-only child, scoped to complete preflight; no retries."""
    def __init__(self, dependency_lock: dict):
        path=Path(dependency_lock['node_executable'])
        need(path.is_absolute() and path.resolve().is_file() and nonzero_hash(dependency_lock['node_executable_sha256']) and SHA(path.resolve().read_bytes())==dependency_lock['node_executable_sha256'],'actual pinned gateway-normalization Node executable')
        version=subprocess.run([str(path),'--version'],capture_output=True,check=True,text=True).stdout.strip()
        need(version==dependency_lock['node_version'],'actual normalization Node version')
        self.process=subprocess.Popen([str(path),'--input-type=module','--eval',_GATEWAY_NORMALIZER_JS],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,encoding='utf-8')
    def __enter__(self):return self
    def normalize(self, raw: bytes) -> bytes:
        # Validate duplicate keys/nonfinite JSON before JS can discard ambiguity.
        _json_bytes(raw,'official M1 JSON before gateway normalization')
        self.process.stdin.write(json.dumps(raw.decode('utf-8'),ensure_ascii=True)+'\n');self.process.stdin.flush()
        line=self.process.stdout.readline();need(bool(line),'gateway normalizer terminated without response')
        value=json.loads(line);need(isinstance(value,str),'gateway normalized response string')
        return value.encode('utf-8')
    def __exit__(self, kind, error, trace):
        self.process.stdin.close()
        # No process sleeps, background owner, retry, model code or network.
        code=self.process.wait()
        stderr=self.process.stderr.read();self.process.stdout.close();self.process.stderr.close()
        if kind is None:need(code==0 and not stderr,'gateway normalizer finite terminal success')


def artifact_database_checksums(raw: bytes) -> tuple[str,str]:
    """Hash gateway-NORMALIZED JSON using the two maintained PostgreSQL methods.

    Caller must first use GatewayJSONNormalizer on original local artifact bytes.
    This renderer alone is not an ingress-transport normalization implementation.
    """
    def pairs(items):
        need(len({k for k,_ in items}) == len(items), "duplicate artifact JSON key")
        return dict(items)
    artifact = json.loads(raw, parse_float=Decimal, object_pairs_hook=pairs,
                          parse_constant=lambda _: (_ for _ in ()).throw(ContractError("nonfinite JSON")))
    matrix = copy.deepcopy(artifact["strategy_matrix_v2"])
    need(isinstance(matrix.get("nodes"),list) and len(matrix["nodes"]) == 1, "single official source node")
    node = matrix["nodes"][0]
    supplied = node.pop("node_checksum", None)
    node_checksum = SHA(pg_json_text(node).encode("ascii"))
    need(supplied is None or supplied == node_checksum, "supplied DB node checksum")
    node["node_checksum"] = node_checksum
    artifact_checksum = SHA(pg_json_text({"scenario_hash":artifact["scenario_hash"],
        "strategy_matrix_v2":matrix},compact_sorted=True).encode("ascii"))
    return node_checksum, artifact_checksum


def declared_m1_targets(manifest: ApprovedManifest) -> tuple[dict[str,dict],dict[str,list[str]]]:
    from pio_upi import target_context
    entries = {}; contexts = {}
    for scenario in manifest.raw["scenarios"]:
        if scenario.get("purpose", "harvest") == "self_test":
            continue
        for target in scenario["targets"]:
            if target["machine_id"] != "M1":
                continue  # No path or artifact for M2 is opened by this driver.
            ctx = target_context(scenario,target); cid = public_context_id(ctx)
            need(target["target_id"] not in entries, "duplicate M1 target")
            entries[target["target_id"]] = {"scenario":scenario,"target":target,"context":ctx,"context_id":cid}
            contexts.setdefault(cid,[]).append(target["target_id"])
    need(len(entries) == 6099 and len(contexts) == 107 and all(len(v)==57 for v in contexts.values()), "global official 6099/107/57 target census")
    return entries, contexts


def validate_public_partition(manifest: ApprovedManifest, expected: dict[str,dict], contexts: dict[str,list[str]]) -> None:
    """Public partition only: no M2 seed, selected holdout artifact or labels."""
    protocols=manifest.raw['public215_protocols'];partition=protocols['source_partition'];recipe=protocols['training_recipe']
    need(partition.get('format')=='public_hist215_source_partition_protocol_v1','public source partition format')
    declared=partition.get('training_contexts');need(isinstance(declared,list) and len(declared)==len(contexts),'public training context census')
    bycontext={}
    for group in declared:
        exact(group,{'context_id','context','rank_signatures'});cid=group['context_id']
        need(cid in contexts and cid not in bycontext and cid==public_context_id(group['context']),'public partition context SHA')
        bycontext[cid]=group
    need(set(bycontext)==set(contexts),'public partition complete context set')
    need(partition.get('cross_validation_fold_rule')=='int(SHA256(public_seed+signature),16)%3' and partition.get('reserve_rule')=="int(SHA256('R7-domain-reserve:'+public_seed+signature),16)%5==0",'public exact fold/reservation equations')
    ranks='23456789TJQKA';seed=partition['public_seed'];need(nonzero_hash(seed),'public fold seed');oldhold=set(partition['old_R6_holdout_rank_signatures']);global_m1=set()
    for cid,tids in contexts.items():
        signatures=[];folds=[0,0,0]
        for tid in tids:
            ex=expected[tid];board=ex['target']['board'];need(ex['context']==bycontext[cid]['context'],'public partition context binding')
            signature=str(len(board)//2)+':'+''.join(sorted(board[::2],key=ranks.index));signatures.append(signature)
            need(signature not in oldhold and int(SHA(('R7-domain-reserve:'+seed+signature).encode('ascii')),16)%5!=0,'public M1 reserved/R6 holdout exclusion')
            folds[int(SHA((seed+signature).encode('ascii')),16)%3]+=1
        need(sorted(signatures)==bycontext[cid]['rank_signatures'] and len(set(signatures))==57 and folds==[19,19,19],'public exact57 ranks/19 each global fold')
        global_m1.update(signatures)
    public_selection=partition['m2_selection'];need(public_selection.get('format')=='public_hist215_m2_selection_protocol_v1','public M2 commitment protocol')
    oldall=set(partition['old_R6_all_rank_signatures']);need(oldhold<=oldall,'R6 exclusion ledger containment')
    need(isinstance(public_selection.get('contexts'),list) and len(public_selection['contexts'])==len(contexts) and public_selection.get('boards_per_context')==8 and public_selection.get('seed_bytes')==32 and nonzero_hash(public_selection.get('seed_commitment_checksum')),'complete public M2 commitment metadata')
    observed=set()
    for group in public_selection['contexts']:
        exact(group,{'context_id','context','candidates'});cid=group['context_id']
        need(cid in contexts and cid not in observed and group['context']==bycontext[cid]['context'] and isinstance(group['candidates'],list) and len(group['candidates'])>=8,'public holdout context/domain census');observed.add(cid)
        seen=set()
        for candidate in group['candidates']:
            exact(candidate,{'board','rank_signature'});board=candidate['board']
            from pio_upi import texture_class
            need(isinstance(board,str) and len(board)=={'flop':6,'turn':8,'river':10}.get(group['context']['street']) and len(set(board[i:i+2]for i in range(0,len(board),2)))==len(board)//2 and all(board[i]in ranks and board[i+1]in 'cdhs'for i in range(0,len(board),2)) and texture_class(board)==group['context']['texture_class'],'public chronological holdout deck/street/texture')
            signature=str(len(board)//2)+':'+''.join(sorted(board[::2],key=ranks.index))
            need(signature==candidate['rank_signature'] and signature not in seen and signature not in global_m1|oldall and int(SHA(('R7-domain-reserve:'+seed+signature).encode('ascii')),16)%5==0,'global public M2/M1/R6 separation');seen.add(signature)
    need(observed==set(contexts),'all public holdout contexts')
    semantics=[{'context_id':e['context_id'],'board':e['target']['board'],'source_node':e['target']['node']}for e in expected.values()]
    need(recipe.get('training_order')=='manifest_scenario_then_target_array_M1_order' and recipe.get('public_semantic_order_checksum')==digest(semantics),'pre-frozen manifest-array public row order')
    need(recipe.get('board_weighting')=='matchups_div_board_sum_then_global_mean_1' and recipe.get('heads')=='policy_then_sorted_action_EV_then_sorted_frequency','pre-frozen scientific row/head equations')


def capture_receipt_sources(rows: list[dict]) -> list[dict]:
    """Exact SQL-authoritative five-field node census; paths/planning IDs are
    bound separately by the complete capture-index file SHA in fit authority."""
    keys=['source_row_id','source_node','board','artifact_checksum','node_checksum']
    return sorted([{k:row[k]for k in keys}for row in rows],key=lambda r:(r['source_row_id'],r['source_node']))


def validate_capture_index(index: dict, manifest: ApprovedManifest, expected: dict[str,dict]) -> dict[str,dict]:
    exact(index,{"format",*CAPTURE_BINDINGS,"machine_id","approval_status","source_count","context_count","capture_receipt_checksum","sources"})
    need(index["format"] == "public_hist215_final_M1_capture_index_v1" and index["machine_id"] == "M1" and index["approval_status"] == "approved", "official M1 capture authority")
    bindings=capture_bindings(manifest,index['dataset_id'])
    need(all(index[k]==v for k,v in bindings.items()), "capture immutable source bindings")
    need(type(index["source_count"])is int and index["source_count"] == 6099 and type(index["context_count"])is int and index["context_count"] == 107 and isinstance(index["sources"],list) and len(index["sources"])==6099, "capture terminal census")
    need(isinstance(index['dataset_id'],str) and UUID.fullmatch(index['dataset_id']), 'capture dataset UUID')
    result={}; order=[]; globalsources=[]
    for row in index["sources"]:
        exact(row,SOURCE_KEYS); tid=row["target_id"];need(tid in expected and tid not in result, "capture target coverage")
        ex=expected[tid];t=ex["target"];s=ex["scenario"]
        need(row["scenario_id"]==s["scenario_id"] and row["context_id"]==ex["context_id"] and row["context"]==ex["context"] and row["board"]==t["board"] and row["source_node"]==t["node"], "capture scenario/context/chronology")
        for key in ["artifact_file_sha256","artifact_checksum","node_checksum"]:need(nonzero_hash(row[key]),"capture checksum")
        need(isinstance(row['source_row_id'],str) and UUID.fullmatch(row['source_row_id']), 'capture source UUID');order.append((row["source_row_id"],row["source_node"]))
        need(isinstance(row["artifact_path"],str) and Path(row["artifact_path"]).is_absolute(), "explicit official artifact path")
        globalsources.append(row);result[tid]=row
    need(order==sorted(set(order)) and len(result)==len(expected), "capture sorted unique PK/complete coverage")
    need(index["capture_receipt_checksum"]==digest(capture_receipt_sources(globalsources)), "global SQL five-field capture receipt")
    return result


def parse_official_node(artifact: dict, manifest: ApprovedManifest, ex: dict) -> dict:
    """Scientific A347 source-label/weight parser: matchups ONLY, no reach multiplier."""
    from worker import artifact_matches
    from pio_upi import COMBO_CARDS
    t,s=ex["target"],ex["scenario"]
    need(artifact_matches(artifact,manifest,"M1",s,t), "official artifact identity/header")
    n=artifact["strategy_matrix_v2"]["nodes"][0];ctx=ex["context"]
    need(n["node_context"].get("board")==t["board"] and all(n["node_context"].get(k)==v for k,v in ctx.items()), "node context")
    acts=sorted(t["expected_children"])
    need(set(n["action_specs"])==set(n["frequencies"])==set(n["action_evs_bb"])==set(acts),"source action set")
    for a in acts:
        sp=exact(n["action_specs"][a],{"family","size_unit","size_value","all_in"})
        need(sp["family"] in ["fold","check","call","bet","raise","all_in"] and type(sp["all_in"]) is bool,"action spec")
        if sp["family"] in ["fold","check","call"]:need(sp["size_unit"]=="none" and sp["size_value"] is None and sp["all_in"] is False,"nonwager spec")
        elif sp["family"]=="all_in":need(sp["size_unit"]=="all_in" and sp["size_value"] is None and sp["all_in"] is True,"all-in spec")
        else:need(sp["size_unit"]==("pot_fraction" if sp["family"]=="bet" else "pot_after_call_fraction") and finite(sp["size_value"]) and 0<sp["size_value"]<=20 and sp["all_in"] is False,"wager spec")
    vectors=[n["matchups"],n["policy_evs_bb"]]+[n["frequencies"][a] for a in acts]+[n["action_evs_bb"][a] for a in acts]
    need(all(isinstance(v,list) and len(v)==1326 for v in vectors),"source vectors1326")
    positive=[]
    for i,w in enumerate(n["matchups"]):
        need(finite(w) and w>=0,"matchup weight")
        need(all(finite(n["frequencies"][a][i]) and 0<=n["frequencies"][a][i]<=1 for a in acts),"frequency finite support")
        if w>0:
            need(not any(card in t["board"] for card in COMBO_CARDS[i]),"positive blocked combo")
            need(finite(n["policy_evs_bb"][i]) and all(finite(n["action_evs_bb"][a][i]) for a in acts),"positive source EV")
            need(abs(sum(n["frequencies"][a][i] for a in acts)-1)<=.002,"source frequency sum");positive.append(i)
        else:need(n["policy_evs_bb"][i] is None and all(n["action_evs_bb"][a][i] is None for a in acts),"zero-weight EV NULL")
    need(positive and finite(sum(n["matchups"][i]for i in positive)) and sum(n["matchups"][i]for i in positive)>0,"positive finite source board mass")
    return {"positive":positive,"actions":acts,"specs":[n["action_specs"][a] for a in acts],
        "weights":[n["matchups"][i] for i in positive],"policy":[n["policy_evs_bb"][i] for i in positive],
        "action_EV":[[n["action_evs_bb"][a][i] for a in acts]for i in positive],
        "frequency":[[n["frequencies"][a][i] for a in acts]for i in positive]}


def finite(value: Any) -> bool:
    return type(value) in (int,float) and math.isfinite(value)


def export_scalar_head(model: Any) -> dict:
    """Read numeric 1.9 fitted arrays, never pickle or execute serialized code."""
    import numpy as np
    from sklearn.ensemble._hist_gradient_boosting.common import PREDICTOR_RECORD_DTYPE
    params=model.get_params(deep=False)
    need(all(type(params[k]) is type(v) and params[k]==v for k,v in PARAMETERS.items()),"fitted frozen Hist parameters")
    need(params.get("loss")=="squared_error" and params.get("learning_rate")==0.1,"fitted default loss/rate")
    need(model.n_features_in_==215 and model.n_trees_per_iteration_==1,"scalar215 head")
    categorical=getattr(model,"is_categorical_",None)
    need(categorical is None or not np.asarray(categorical).any(),"numeric-only fitted features")
    baseline=model._baseline_prediction
    need(isinstance(baseline,np.ndarray) and baseline.dtype==np.dtype('float64') and baseline.shape==(1,1),"baseline float64 scalar")
    need(isinstance(model._predictors,list) and len(model._predictors)==100,"exact100 iterations")
    trees=[]
    for iteration in model._predictors:
        need(isinstance(iteration,list) and len(iteration)==1,"one predictor per iteration")
        predictor=iteration[0];nodes=predictor.nodes
        need(isinstance(nodes,np.ndarray) and nodes.ndim==1 and nodes.dtype==PREDICTOR_RECORD_DTYPE and 1<=len(nodes)<=29,"exact1.9 predictor dtype/shape")
        need(predictor.binned_left_cat_bitsets.size==0 and predictor.raw_left_cat_bitsets.size==0,"no categorical bitsets")
        tree=[]
        for node in nodes:
            need(int(node['is_categorical'])==0 and int(node['is_leaf']) in (0,1) and int(node['missing_go_to_left']) in (0,1),"numeric node flags")
            if node['is_leaf']:
                # grower._apply_shrinkage already multiplied this value. DO NOT multiply again.
                tree.append({"value_f64":encode_f64(float(node['value']))})
            else:tree.append({"feature":int(node['feature_idx']),"threshold_f64":encode_f64(float(node['num_threshold'])),
                "left":int(node['left']),"right":int(node['right']),"missing_left":bool(node['missing_go_to_left'])})
        from public_hist215 import _tree
        _tree(tree);trees.append(tree)
    return {"baseline_f64":encode_f64(float(baseline[0,0])),"trees":trees}


def capture_bindings(manifest: ApprovedManifest, dataset_id: str) -> dict:
    return {"dataset_id":dataset_id,"input_bundle_id":manifest.raw["input_bundle_id"],
        "input_bundle_checksum":manifest.raw["input_bundle_checksum"],"manifest_checksum":manifest.checksum,
        "producer_commit":manifest.raw["pipeline_commit"],"producer_bundle_checksum":manifest.raw["pipeline_bundle_checksum"],
        **{k:manifest.raw[k] for k in ["solver_binary_checksum","range_bundle_checksum","source_combo_order_checksum","icm_model_checksum"]}}


def verify_source_file(row: dict, manifest: ApprovedManifest, ex: dict, normalizer=None, verified=None) -> dict:
    from gateway import MAX_BODY_BYTES
    from worker import artifact_path
    path=Path(row["artifact_path"])
    need(path.parent.name=="M1" and "M2" not in path.parts and path.name==artifact_path(Path('/'),"M1",row["target_id"]).name,"M1-only canonical checkpoint path")
    need(path.resolve(strict=True)==path.absolute(),"no redirected artifact path")
    with path.open('rb') as source:raw=source.read(MAX_BODY_BYTES+1)
    need(len(raw)<=MAX_BODY_BYTES and SHA(raw)==row["artifact_file_sha256"],"official artifact bytes")
    if normalizer is not None:
        node_hash,artifact_hash=artifact_database_checksums(normalizer.normalize(raw))
    else:
        need(verified is not None and verified[0]==SHA(raw),"source bytes unchanged since complete normalized preflight")
        node_hash,artifact_hash=verified[1:]
    need(node_hash==row["node_checksum"] and artifact_hash==row["artifact_checksum"],"actual DB normalized node/artifact checksums")
    artifact=_json_bytes(raw,"official M1 artifact")
    need(artifact.get('id')==row['source_row_id'],"actual source PK")
    return parse_official_node(artifact,manifest,ex)


def load_feature_index(value: dict, manifest: ApprovedManifest, expected: dict[str,dict], contexts: dict[str,list[str]]) -> dict:
    exact(value,{"format","feature_schema_checksum","encoder_checksum","physics_checksum","source_count","context_count","dtype","contexts"})
    need(value["format"]=="public_hist215_public_feature_index_v1" and value['feature_schema_checksum']==FEATURE_DESCRIPTOR_SHA256 and type(value['source_count'])is int and value['source_count']==6099 and type(value['context_count'])is int and value['context_count']==107 and value['dtype']=='<f8',"public feature authority/census")
    need(nonzero_hash(value['encoder_checksum']) and value['physics_checksum']==digest(manifest.raw['public215_protocols']['physics_protocol']),"public encoder/physics identity")
    need(isinstance(value['contexts'],list) and len(value['contexts'])==107,"feature context census")
    metadata={public_context_id(e['context']):e for e in manifest.raw['public215_contexts']};result={};range_cache={}
    approved_cases={public_context_id(g['context']):g['cases']for g in manifest.raw['public215_protocols']['runtime_parity_protocol']['contexts']}
    for group in value['contexts']:
        exact(group,{"context_id","context","template_checksum","matrix_path","matrix_sha256","rows","row_count","cases"});cid=group['context_id']
        need(cid in contexts and cid not in result and group['context']==metadata[cid]['context'] and group['template_checksum']==metadata[cid]['template_checksum'],"public matrix context/template")
        need(nonzero_hash(group['matrix_sha256']) and isinstance(group['matrix_path'],str) and Path(group['matrix_path']).is_absolute() and Path(group['matrix_path']).suffix=='.npy',"pinned public NPY file")
        need(isinstance(group['rows'],list) and len(group['rows'])==57,"public matrix board census")
        offset=0
        for tid,row in zip(contexts[cid],group['rows']):
            exact(row,{"target_id","board","combo_indices","offset","count"});need(row['target_id']==tid and row['board']==expected[tid]['target']['board'] and type(row['offset'])is int and row['offset']==offset,"public matrix approved target order/board/offset")
            indices=row['combo_indices'];need(isinstance(indices,list) and indices==sorted(set(indices)) and all(type(i)is int and 0<=i<1326 for i in indices) and type(row['count'])is int and row['count']==len(indices)>0,"public combo row mapping")
            from pio_upi import COMBO_CARDS, analyze_node
            from contract import load_range_vector
            ex=expected[tid];s,t=ex['scenario'],ex['target'];actor=analyze_node(t['node'],root_pot_chips=s['pot_chips'],effective_stack_chips=s['effective_stack_chips'],preflop_aggressor=s['preflop_aggressor_solver_player']).actor
            vectors={}
            for side in ['oop','ip']:
                checksum=s[side+'_range_checksum']
                if checksum not in range_cache:
                    path=manifest.input_root/s[side+'_range_path'];need(SHA(path.read_bytes())==checksum,'actual approved ROOT range bytes')
                    range_cache[checksum]=load_range_vector(path)
                vectors[side]=range_cache[checksum]
            own,opponent=vectors['ip' if actor else 'oop'],vectors['oop' if actor else 'ip']
            blocked=set(t['board'][i:i+2]for i in range(0,len(t['board']),2))
            opponent_hands=[set(COMBO_CARDS[i])for i,w in enumerate(opponent)if w>0 and not blocked.intersection(COMBO_CARDS[i])]
            allowed=[i for i,w in enumerate(own) if w>0 and not blocked.intersection(COMBO_CARDS[i]) and any(not hand.intersection(COMBO_CARDS[i])for hand in opponent_hands)]
            need(indices==allowed,"full public approved ROOT own mask, never label-selected rows")
            offset+=len(indices)
        need(type(group['row_count'])is int and group['row_count']==offset,'public NPY row census')
        need(isinstance(group['cases'],list) and len(group['cases'])==len(approved_cases[cid]),'predeclared public case feature census')
        boards={expected[tid]['target']['board']for tid in contexts[cid]}
        for case,approved in zip(group['cases'],approved_cases[cid]):
            exact(case,{'board','own','features_f64'})
            need(approved=={k:case[k]for k in ['board','own']} and case['board']in boards and isinstance(case['features_f64'],list) and len(case['features_f64'])==215,'pre-capture M1 public case identity/shape')
            for word in case['features_f64']:decode_f64(word)
        result[cid]=group
    need(set(result)==set(contexts),"public full context set")
    return result


def public_matrix(group: dict):
    import numpy as np
    path=Path(group['matrix_path']);need(path.resolve(strict=True)==path.absolute(),"no redirected public matrix")
    h=hashlib.sha256()
    with path.open('rb') as source:
        while block:=source.read(1024*1024):h.update(block)
    need(h.hexdigest()==group['matrix_sha256'],"public matrix bytes")
    matrix=np.load(path,allow_pickle=False,mmap_mode='r')
    need(isinstance(matrix,np.ndarray) and matrix.dtype.str=='<f8' and matrix.ndim==2 and matrix.shape==(group['row_count'],215) and matrix.flags.c_contiguous and matrix.offset+matrix.nbytes==path.stat().st_size and np.isfinite(matrix).all(),"finite C-order public float64 matrix, no pickle")
    return matrix


def validate_training_authority(a: dict, manifest: ApprovedManifest, capture: dict, capture_sha: str, features: dict, features_sha: str) -> None:
    exact(a,{"format","status","dataset_id","manifest_checksum","input_bundle_checksum","capture_index_checksum","public_feature_index_checksum","trainer_source_checksum","encoder_source_lock_path","encoder_source_lock_checksum","dependency_lock_checksum","whole_variant","python_version","numpy_version","sklearn_version","allow_final_M1_fit","shard_count"})
    need(a['format']==TRAINER_FORMAT and a['status']=='FROZEN_BEFORE_FIRST_FINAL_M1_FIT' and a['allow_final_M1_fit'] is True and type(a['shard_count'])is int and a['shard_count']==4,"explicit final training authority")
    need(a['dataset_id']==capture['dataset_id'] and a['manifest_checksum']==manifest.checksum and a['input_bundle_checksum']==manifest.raw['input_bundle_checksum'] and a['capture_index_checksum']==capture_sha and a['public_feature_index_checksum']==features_sha,"training receipt source identities")
    need(a['trainer_source_checksum']==SHA(Path(__file__).read_bytes()),"actual maintained trainer source")
    protocols=manifest.raw['public215_protocols'];recipe=protocols['training_recipe']
    need(recipe.get('public_feature_index_checksum')==features_sha,'pre-capture approved public feature index checksum')
    rp=exact(recipe.get('parameters'),set(FROZEN_PARAMETERS))
    need(a['whole_variant'] in ('direct','coherent') and recipe.get('whole_variant')==a['whole_variant'] and all(type(rp[k])is type(v) and rp[k]==v for k,v in FROZEN_PARAMETERS.items()),'preselected whole variant/frozen Hist parameters')
    need(a['dependency_lock_checksum']==digest(protocols['dependency_lock']) and a['sklearn_version']=='1.9.0' and a['python_version']==platform.python_version(),"approved runtime version/lock")
    # Source graph file bytes are independently pinned. A hash claim alone is not an encoder implementation.
    lock=pinned_json(a['encoder_source_lock_path'],a['encoder_source_lock_checksum'])
    exact(lock,{'format','files'});need(lock['format']=='public_hist215_encoder_source_graph_v1' and isinstance(lock['files'],list) and lock['files'],"protected encoder graph")
    need(features['encoder_checksum']==digest(lock),"public matrix exact protected encoder graph")
    for f in lock['files']:
        exact(f,{'path','sha256'});need(not any(part.startswith('.env')for part in Path(f['path']).parts) and Path(f['path']).suffix in {'.ts','.js','.mjs','.json','.cc','.cpp','.h','.py'},'encoder graph source files only; no credentials')
        need(Path(f['path']).is_absolute() and nonzero_hash(f['sha256']) and SHA(Path(f['path']).read_bytes())==f['sha256'],"actual protected encoder source bytes")
    dep=protocols['dependency_lock']
    need({'python','executable','executable_sha256','versions','files'}<=set(dep) and dep['python']==sys.version and Path(dep['executable']).resolve()==Path(sys.executable).resolve() and SHA(Path(sys.executable).resolve().read_bytes())==dep['executable_sha256'],'actual locked Python executable')
    need(dep['versions'].get('numpy')==a['numpy_version'] and dep['versions'].get('scikit-learn')==a['sklearn_version'] and isinstance(dep['files'],dict) and dep['files'],'full numerical runtime file lock')
    prefix=Path(sys.prefix).resolve()
    for relative,checksum in dep['files'].items():
        path=prefix/relative
        need(not Path(relative).is_absolute() and path.resolve().is_relative_to(prefix) and nonzero_hash(checksum) and SHA(path.read_bytes())==checksum,'actual locked numerical dependency bytes')
    need(os.environ.get('OMP_NUM_THREADS')=='1' and os.environ.get('OPENBLAS_NUM_THREADS')=='4',"frozen OMP1/OpenBLAS4 execution")


def normalized_training_weights(nodes: list[dict]):
    import numpy as np
    per_board=[]
    for n in nodes:
        w=np.asarray(n['weights'],dtype=np.float64)
        per_board.append(w/w.sum())
    wt=np.concatenate(per_board);wt/=wt.mean()
    need(np.isfinite(wt).all() and (wt>0).all(),'global finite positive normalized training weights')
    return wt


def training_arrays(nodes: list[dict], group: dict, matrix):
    import numpy as np
    need(nodes and len(nodes)==len(group['rows']),'complete board-array mapping')
    xs=[];ys=[]
    for n,row in zip(nodes,group['rows']):
        positions={combo:i for i,combo in enumerate(row['combo_indices'])}
        need(all(i in positions for i in n['positive']),"source support outside public ROOT mask")
        take=np.asarray([row['offset']+positions[i]for i in n['positive']],dtype=np.int64)
        xs.append(np.asarray(matrix[take],dtype=np.float64));ys.append(np.column_stack((n['policy'],n['action_EV'],n['frequency'])))
    X=np.concatenate(xs);Y=np.concatenate(ys);wt=normalized_training_weights(nodes)
    need(X.shape[1]==215 and Y.shape[1]==1+2*len(nodes[0]['actions']) and np.isfinite(X).all() and np.isfinite(Y).all() and np.isfinite(wt).all() and (wt>0).all(),"final per-context arrays")
    return X,Y,wt


def reference_cases(raw_heads, cases: list[dict], actions: int, variant: str) -> list[dict]:
    """Actual original sklearn.predict outputs, retained without model pickles.

    Clip/normalize and coherent arithmetic match scientific metrics.py literally.
    These reference vectors still need actual Linux native/TS/SQL recomputation.
    """
    import numpy as np
    need(raw_heads.shape==(len(cases),1+2*actions) and np.isfinite(raw_heads).all(),'finite actual sklearn public case heads')
    frequency=np.clip(np.asarray(raw_heads[:,1+actions:],dtype=float),0,1);s=frequency.sum(axis=1)
    need(np.isfinite(s).all() and (s>1e-12).all(),'public reference frequency normalization')
    frequency/=s[:,None]
    policy=raw_heads[:,0] if variant=='direct' else np.sum(frequency*raw_heads[:,1:1+actions],axis=1)
    need(np.isfinite(policy).all(),'finite whole-variant public reference policy')
    return [{**case,'raw_heads_f64':[encode_f64(float(v))for v in raw_heads[i]],
        'policy_ev_f64':encode_f64(float(policy[i])),
        'Q_f64':[encode_f64(float(v))for v in raw_heads[i,1:1+actions]],
        'frequency_f64':[encode_f64(float(v))for v in frequency[i]]}for i,case in enumerate(cases)]


def write_new(path: Path, value: dict) -> str:
    payload=canonical_bytes(value);temporary=path.with_name(path.name+'.'+uuid.uuid4().hex+'.partial')
    with temporary.open('xb') as output:output.write(payload);output.flush();os.fsync(output.fileno())
    try:os.link(temporary,path)
    finally:temporary.unlink()
    fd=os.open(path.parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)
    return SHA(payload)


def train(args) -> None:
    manifest=load_manifest(args.manifest,expected_checksum=args.manifest_sha256,input_root=args.input_root,pipeline_root=args.pipeline_root)
    need(manifest.raw.get('policy_representation')=='public_hist215_v1',"explicit nine-file public215 pipeline")
    expected,contexts=declared_m1_targets(manifest)
    validate_public_partition(manifest,expected,contexts)
    capture=pinned_json(args.capture_index,args.capture_index_sha256);rows=validate_capture_index(capture,manifest,expected)
    features=pinned_json(args.public_feature_index,args.public_feature_index_sha256);groups=load_feature_index(features,manifest,expected,contexts)
    authority=pinned_json(args.training_authority,args.training_authority_sha256)
    validate_training_authority(authority,manifest,capture,args.capture_index_sha256,features,args.public_feature_index_sha256)
    need(args.allow_fit is True,"explicit --allow-fit required")
    output=Path(args.output);need(output.is_absolute() and not output.exists(),"new absolute output required")
    # GLOBAL complete source, headers, vectors and matrices are verified BEFORE ANY .fit.
    signatures={};metadata={public_context_id(e['context']):e for e in manifest.raw['public215_contexts']}
    verified_sources={}
    with GatewayJSONNormalizer(manifest.raw['public215_protocols']['dependency_lock']) as normalizer:
        for cid in sorted(contexts):
            first=None;board_weights=[]
            public_rows={row['target_id']:row for row in groups[cid]['rows']}
            for tid in contexts[cid]:
                n=verify_source_file(rows[tid],manifest,expected[tid],normalizer=normalizer);verified_sources[tid]=(rows[tid]["artifact_file_sha256"],rows[tid]["node_checksum"],rows[tid]["artifact_checksum"]);signature=(n['actions'],n['specs'])
                board_weights.append({'weights':n['weights']})
                need(set(n['positive'])<=set(public_rows[tid]['combo_indices']),'GLOBAL source support/public ROOT feature mapping')
                need(first is None or signature==first,"whole legal actions/specs differ across source boards");first=signature
            need(first[0]==metadata[cid]['model_action_order'],'GLOBAL approved sorted model action order')
            normalized_training_weights(board_weights)
            signatures[cid]=first
            public_matrix(groups[cid])
    import numpy as np
    import sklearn
    from sklearn.ensemble import HistGradientBoostingRegressor
    need(np.__version__==authority['numpy_version'] and sklearn.__version__==authority['sklearn_version'],"exact installed numerical runtime")
    need(type(args.shard_index)is int and args.shard_index in range(4),'explicit four-worker context shard');selected=sorted(contexts)[args.shard_index::4]
    output.mkdir(parents=False);files=[];metadata={public_context_id(e['context']):e for e in manifest.raw['public215_contexts']};protocols=manifest.raw['public215_protocols']
    for cid in selected:
        nodes=[verify_source_file(rows[tid],manifest,expected[tid],verified=verified_sources[tid])for tid in contexts[cid]]
        need(all((n['actions'],n['specs'])==signatures[cid]for n in nodes),"source changed after global preflight")
        approved=metadata[cid];actions=nodes[0]['actions'];need(approved['model_action_order']==actions,"approved sorted scientific head order")
        X,Y,wt=training_arrays(nodes,groups[cid],public_matrix(groups[cid]));heads=[];case_columns=[]
        cases=groups[cid]['cases'];case_X=np.asarray([[decode_f64(word)for word in case['features_f64']]for case in cases],dtype=np.float64)
        for j in range(Y.shape[1]):
            fitted=HistGradientBoostingRegressor(**PARAMETERS).fit(X,Y[:,j],sample_weight=wt)
            heads.append(export_scalar_head(fitted));case_columns.append(fitted.predict(case_X))
        references=reference_cases(np.column_stack(case_columns),cases,len(actions),authority['whole_variant'])
        source_rows=sorted([{'source_row_id':rows[tid]['source_row_id'],'source_node':rows[tid]['source_node'],'board':rows[tid]['board'],'artifact_checksum':rows[tid]['artifact_checksum'],'node_checksum':rows[tid]['node_checksum']}for tid in contexts[cid]],key=lambda s:(s['source_row_id'],s['source_node']))
        provenance={'format':'public_hist215_training_v1','approved_input_bundle_id':manifest.raw['input_bundle_id'],
            'input_bundle_checksum':manifest.raw['input_bundle_checksum'],'manifest_checksum':manifest.checksum,
            'capture_receipt_checksum':capture['capture_receipt_checksum'],'training_recipe_checksum':digest(protocols['training_recipe']),
            'source_partition_checksum':digest(protocols['source_partition']),'producer_commit':manifest.raw['pipeline_commit'],
            'producer_bundle_checksum':manifest.raw['pipeline_bundle_checksum'],'solver_binary_checksum':manifest.raw['solver_binary_checksum'],
            'range_bundle_checksum':manifest.raw['range_bundle_checksum'],'icm_model_checksum':manifest.raw['icm_model_checksum'],
            'feature_schema_checksum':FEATURE_DESCRIPTOR_SHA256,'encoder_checksum':features['encoder_checksum'],
            'physics_checksum':digest(protocols['physics_protocol']),'dependency_lock_checksum':digest(protocols['dependency_lock']),
            'runtime_parity_protocol_checksum':digest(protocols['runtime_parity_protocol']),'whole_variant':authority['whole_variant'],
            'parameters':FROZEN_PARAMETERS,'machine_id':'M1','source_count':57,'artifact_count':len({s['source_row_id']for s in source_rows}),
            'board_count':len({s['board']for s in source_rows}),'sources':source_rows}
        psha=digest(provenance);serialize_training_provenance(provenance,expected_sha256=psha)
        model={'format':'public_hist215_v1','variant':authority['whole_variant'],'feature_count':215,'action_ids':actions,'heads':heads,
            'template_sha256':approved['template_checksum'],'feature_schema_sha256':FEATURE_DESCRIPTOR_SHA256,'provenance_sha256':psha}
        msha=digest(model);serialize_model(model,model_sha256=msha,template_sha256=approved['template_checksum'],feature_schema_sha256=FEATURE_DESCRIPTOR_SHA256,provenance_sha256=psha,action_ids=actions)
        fragment={'format':'public_hist215_final_M1_fragment_v1','context_id':cid,'context':approved['context'],'dataset_id':capture['dataset_id'],
            'public_model':model,'model_checksum':msha,'public_training_provenance':provenance,'training_provenance_checksum':psha,
            'training_authority_checksum':args.training_authority_sha256,'sklearn_reference_cases':references,'status':'UNQUALIFIED_REQUIRES_ACTUAL_LINUX_BUILD_PARITY_AND_SQL'}
        name=cid+'.json';files.append({'context_id':cid,'file':name,'sha256':write_new(output/name,fragment)})
        print(json.dumps({'completed_contexts':len(files),'planned_contexts':len(selected),'context_id':cid}),flush=True)
    write_new(output/'result.json',{'format':TRAINER_FORMAT,'status':'finite_final_M1_model_fragments_UNQUALIFIED','dataset_id':capture['dataset_id'],
        'training_authority_checksum':args.training_authority_sha256,'shard_index':args.shard_index,'shard_count':4,
        'context_ids':selected,'files':files,'qualityCertified':False,'M2_labels_read':False})


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['manifest','manifest-sha256','input-root','pipeline-root','capture-index','capture-index-sha256','public-feature-index','public-feature-index-sha256','training-authority','training-authority-sha256','output']:
        parser.add_argument('--'+name,required=True)
    parser.add_argument('--shard-index',type=int,choices=range(4),required=True);parser.add_argument('--allow-fit',action='store_true')
    train(parser.parse_args())


if __name__=='__main__':main()
