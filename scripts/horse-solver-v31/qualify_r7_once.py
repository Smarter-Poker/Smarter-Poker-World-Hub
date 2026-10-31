#!/usr/bin/env python3
"""Finite R7 build, server-selected heldout physics, and seal. Never retries or promotes."""
from __future__ import annotations
import argparse
from dataclasses import replace
from datetime import datetime, timezone
import hashlib
import importlib
import json
import os
from pathlib import Path
import re
import sys
DATASET = '187815b1-3701-46c8-8514-93db3cdb6d07'
MANIFEST = 'eb30f11bfdccf8f017270c7e808c56fcc96a47781e52c3ee6d74a6efdcb04a4c'
INDEX = '43f3874cdb19fe36a5d01422983f15b515c559ba0c24eaf1ee9aafa257f31cff'
PRODUCER = '291a8e5658b6a706066b39fba6c75a714f578695'
CAPTURE = '817cb3e77af1b8337f504d84ce6976d4d5e3b63e77f86891373264ef36c32e35'
FIELDS = ('model_checksum','template_checksum','training_provenance_checksum','model_build_receipt_checksum')
CONFIG = {'format','dataset_id','pipeline_root','input_root','manifest','model_index','snapshot','worker_completion','output'}
class Refusal(ValueError):
    pass


def need(value, code):
    if not value:
        raise Refusal(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'),
                      ensure_ascii=False, allow_nan=False).encode('ascii')


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def strict_json(payload, bom=False):
    def pairs(items):
        need(len(items) == len({k for k, _ in items}), 'DUPLICATE_JSON_KEY')
        return dict(items)
    def constant(_):
        raise Refusal('NONFINITE_JSON')
    return json.loads(payload.decode('utf-8-sig' if bom else 'utf-8'),
                      object_pairs_hook=pairs, parse_constant=constant)


def regular(path):
    p = Path(path)
    need(p.is_absolute() and p.resolve(strict=True) == p and p.is_file()
         and not p.is_symlink() and not any(x.startswith('.env') for x in p.parts),
         'CANONICAL_REGULAR_FILE_REQUIRED')
    return p


def pinned(pin, expected=None, limit=128 * 1024 * 1024):
    need(isinstance(pin, dict) and set(pin) == {'path', 'sha256'}, 'EXACT_FILE_PIN')
    sha = pin['sha256']
    need(isinstance(sha, str) and len(sha) == 64 and
         all(c in '0123456789abcdef' for c in sha), 'VALID_SHA_REQUIRED')
    if expected is not None:
        need(sha == expected, 'ORIGINAL_PIN_REQUIRED')
    with regular(pin['path']).open('rb') as f:
        payload = f.read(limit + 1)
    need(len(payload) <= limit and digest(payload) == sha, 'PINNED_BYTES_DIFFER')
    return payload


def timestamp(value):
    need(isinstance(value, str), 'TIMESTAMP_REQUIRED')
    stamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
    need(stamp.tzinfo is not None, 'UTC_TIMESTAMP_REQUIRED')
    return stamp


def fresh_snapshot(value, now=None):
    age = ((now or datetime.now(timezone.utc)) - timestamp(value)).total_seconds()
    need(0 <= age <= 300, 'FRESH_ROOT_SQL_SNAPSHOT_REQUIRED')


def write_new(directory, name, value):
    payload = canonical({**value, 'observed_at': datetime.now(timezone.utc).isoformat()})
    with (directory / name).open('xb') as f:
        f.write(payload)
        f.flush()
        os.fsync(f.fileno())
    if os.name != 'nt':
        fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)



def sha(value):
    return isinstance(value,str) and re.fullmatch(r'[0-9a-f]{64}',value) is not None and value != '0'*64


def validate_evidence(snapshot, completion, models):
    need(isinstance(snapshot,dict) and set(snapshot)=={'observed_at','dataset_id','state','source_capture_checksum','selection_receipt_checksum','m1_nodes','m2_nodes','headers_valid','selection_complete','contexts'},'EXACT_SNAPSHOT')
    fresh_snapshot(snapshot['observed_at'])
    need(snapshot['dataset_id']==DATASET and snapshot['state']=='building' and snapshot['source_capture_checksum']==CAPTURE and sha(snapshot['selection_receipt_checksum']) and snapshot['headers_valid'] is True and snapshot['selection_complete'] is True and type(snapshot['m1_nodes']) is int and snapshot['m1_nodes']==6099 and type(snapshot['m2_nodes']) is int and snapshot['m2_nodes']==856,'COMPLETE_INDEPENDENT_SOURCES_REQUIRED')
    base={'format':'public215_r7_m2_completion_readback_v1','dataset_id':DATASET,'machine_id':'M2','native_launcher_exit_code':0,'done':856,'written':856,'planned':856,'invalid':0,'selection_receipt_checksum':snapshot['selection_receipt_checksum'],'source_capture_checksum':CAPTURE}
    need(isinstance(completion,dict) and set(completion)=={*base,'original_terminal','completed_heartbeat'} and all(completion[k]==v for k,v in base.items()) and all(type(completion[k]) is int for k in ('native_launcher_exit_code','done','written','planned','invalid')),'COMPLETED_M2_WORKER_REQUIRED')
    beat=completion['completed_heartbeat']
    need(isinstance(beat,dict) and set(beat)=={'run_id','sequence','received_at','state'} and isinstance(beat['run_id'],str) and re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',beat['run_id']) is not None and type(beat['sequence']) is int and beat['sequence']>0 and beat['state']=='completed','AUTHENTICATED_COMPLETED_HEARTBEAT_REQUIRED')
    need(timestamp(beat['received_at'])<=timestamp(snapshot['observed_at']),'COMPLETION_BEFORE_SNAPSHOT_REQUIRED')
    need(len(models)==107 and isinstance(snapshot['contexts'],list) and len(snapshot['contexts'])==107,'FULL107_REQUIRED')
    observed={}
    for row in snapshot['contexts']:
        need(isinstance(row,dict) and set(row)=={'context','cell_key_checksum','m1_nodes','m2_nodes','headers_valid',*FIELDS},'EXACT_CONTEXT_EVIDENCE')
        key=canonical(row['context'])
        need(key in models and key not in observed and sha(row['cell_key_checksum']) and all(row[f]==models[key][f] for f in FIELDS) and row['headers_valid'] is True and type(row['m1_nodes']) is int and row['m1_nodes']==57 and type(row['m2_nodes']) is int and row['m2_nodes']==8,'COMPLETE_CONTEXT_BINDINGS_REQUIRED')
        observed[key]=row
    need(set(observed)==set(models),'COMPLETE_CONTEXT_CENSUS')
    return [{'entry':models[k],'cell_key_checksum':observed[k]['cell_key_checksum']} for k in sorted(models)]


def admit(config):
    need(isinstance(config,dict) and set(config)==CONFIG and config['format']=='public215_r7_qualify_once_v1' and config['dataset_id']==DATASET,'EXACT_R7_CONFIG')
    raw=strict_json(pinned(config['manifest'],MANIFEST,16*1024*1024))
    root=Path(config['pipeline_root']);task=root.parent
    need(root.is_absolute() and root.resolve(strict=True)==root and root.name=='pipeline' and Path(config['input_root'])==task/'inputs' and Path(config['model_index']['path'])==task/'model-builds-final-r1'/'model-index.json' and raw['pipeline_commit']==PRODUCER and len(raw['pipeline_files'])==9,'ORIGINAL_PRODUCER_REQUIRED')
    names=set()
    for pin in raw['pipeline_files']:
        name=pin['path'];need(name.startswith('scripts/horse-solver-v31/') and '..' not in name.split('/') and name not in names,'SOURCE_PATH')
        names.add(name);pinned({'path':str(root/name),'sha256':pin['checksum']},limit=16*1024*1024)
    directory=root/'scripts'/'horse-solver-v31';sys.path.insert(0,str(directory));modules={}
    for name in ('contract','gateway','public_hist215','compactor'):
        module=importlib.import_module(name);need(Path(module.__file__).resolve()==directory/(name+'.py'),'PINNED_IMPORT_ORIGIN');modules[name]=module
    contract=modules['contract'];codec=modules['public_hist215']
    need(names==set(contract.PUBLIC215_PIPELINE_FILES),'EXACT_NINE')
    manifest=contract.load_manifest(config['manifest']['path'],expected_checksum=MANIFEST,input_root=config['input_root'],pipeline_root=root)
    pinned(config['model_index'],INDEX)
    models=codec.load_model_build_index(config['model_index']['path'],expected_checksum=INDEX,dataset_id=DATASET,manifest={**manifest.raw,'_actual_manifest_checksum':manifest.checksum})
    snapshot=strict_json(pinned(config['snapshot'],limit=512*1024));completion=strict_json(pinned(config['worker_completion'],limit=16*1024),bom=True)
    plan=validate_evidence(snapshot,completion,models)
    terminal_pin=completion['original_terminal']
    need(isinstance(terminal_pin,dict) and terminal_pin.get('path')==str(task/'capture-M2-once'/'terminal.json'),'ORIGINAL_NATIVE_TERMINAL_PATH_REQUIRED')
    terminal=strict_json(pinned(terminal_pin,limit=16*1024),bom=True)
    need(isinstance(terminal,dict) and terminal.get('contract')=='smarter-poker.r7-corrected-M2-capture-terminal.v1' and terminal.get('dataset_id')==DATASET and terminal.get('manifest_checksum')==MANIFEST and type(terminal.get('launcher_exit_code')) is int and terminal['launcher_exit_code']==0 and terminal.get('source_completeness_verified') is False and terminal.get('certified') is False,'ORIGINAL_NATIVE_LAUNCHER_ZERO_REQUIRED')
    output=Path(config['output']);need(output.parent==task and output.name.startswith('public215-qualify-once-') and not output.exists(),'NEW_OFFICIAL_OUTPUT_REQUIRED')
    client=replace(modules['gateway'].GatewayClient.from_environment('COMPACTOR',manifest.provenance),attempts=1)
    verify_authority(client,codec,manifest.raw,models,snapshot)
    return client,modules['compactor'],plan,snapshot


def verify_authority(client,codec,manifest,models,snapshot):
    need(client.attempts==1 and len(models)==107,'COMPLETE_SINGLE_ATTEMPT_AUTHORITY_REQUIRED')
    fresh_snapshot(snapshot['observed_at'])
    authority=client.call('model_freeze_authority',{'dataset_id':DATASET},timeout_seconds=280)
    codec.verify_model_freeze_authority(authority,manifest=manifest,dataset_id=DATASET,model_builds=models)
    fresh_snapshot(snapshot['observed_at'])


def heldout_receipt(value,item,offset,selection,boards):
    keys={'format','dataset_id','context','cell_key_checksum','model_checksum','template_checksum','model_build_receipt_checksum','board','board_offset','selection_receipt_checksum','capture_receipt_checksum','node_checksum','artifact_checksum','audit_key'}
    e=item['entry'];need(isinstance(value,dict) and set(value)==keys,'HELDOUT_RECEIPT_DIFFERS')
    need(value['format']=='public215_heldout_physics_v1' and value['dataset_id']==DATASET and value['context']==e['context'] and value['cell_key_checksum']==item['cell_key_checksum'] and all(value[f]==e[f] for f in ('model_checksum','template_checksum','model_build_receipt_checksum')) and type(value['board_offset']) is int and value['board_offset']==offset and value['selection_receipt_checksum']==selection and value['capture_receipt_checksum']==CAPTURE,'HELDOUT_RECEIPT_DIFFERS')
    need(all(sha(value[k]) for k in ('cell_key_checksum','model_checksum','template_checksum','model_build_receipt_checksum','selection_receipt_checksum','capture_receipt_checksum','node_checksum','artifact_checksum','audit_key')),'HELDOUT_RECEIPT_DIFFERS')
    board=value['board'];cards={'flop':3,'turn':4,'river':5}.get(e['context'].get('street'))
    need(cards is not None and isinstance(board,str) and len(board)==cards*2 and re.fullmatch(r'(?:[2-9TJQKA][cdhs]){3,5}',board) is not None and len({board[i:i+2] for i in range(0,len(board),2)})==cards and board not in boards,'HELDOUT_RECEIPT_DIFFERS')
    boards.add(board);return value


def run_once(client,compactor,plan,snapshot,output,config_sha):
    need(client.attempts==1 and len(plan)==107 and [canonical(x['entry']['context']) for x in plan]==sorted({canonical(x['entry']['context']) for x in plan}),'FULL_SINGLE_ATTEMPT_PLAN')
    fresh_snapshot(snapshot['observed_at'])
    directory=Path(output);need(directory.is_absolute() and directory.parent.resolve(strict=True)==directory.parent and not directory.exists(),'NEW_EXCLUSIVE_OPERATION');directory.mkdir()
    write_new(directory,'claim.json',{'format':'public215_r7_qualify_claim_v1','dataset_id':DATASET,'config_sha256':config_sha,'index_sha256':INDEX,'attempts':1,'builds':107,'heldout_physics':856,'certified':False})
    current='admission';completed_builds=completed_physics=0
    def phase(name,operation,payload,validator):
        nonlocal current
        current=name;write_new(directory,name+'.started.json',{'operation':operation,'dataset_id':DATASET})
        receipt=client.call(operation,payload,timeout_seconds=280);validator(receipt)
        write_new(directory,name+'.terminal.json',{'status':'acknowledged_exact_receipt','receipt':receipt});return receipt
    try:
        for ordinal,item in enumerate(plan):
            def valid_build(v):
                need(compactor.build_cell_receipt_is_valid(v) and v['cell_key_checksum']==item['cell_key_checksum'],'BUILD_RECEIPT_DIFFERS')
            phase(f'{ordinal:03d}.build','build_cell',{'dataset_id':DATASET,'context':item['entry']},valid_build);completed_builds+=1
        for ordinal,item in enumerate(plan):
            entry=item['entry'];envelope={k:entry[k] for k in ('context','model_checksum','public_model_build_receipt','model_build_receipt_checksum')};boards=set()
            for offset in range(8):
                phase(f'{ordinal:03d}.heldout-{offset:02d}','freeze_model',{'dataset_id':DATASET,'context':envelope,'preparation_offset':ordinal,'heldout_board_offset':offset},lambda v:heldout_receipt(v,item,offset,snapshot['selection_receipt_checksum'],boards));completed_physics+=1
        sealed=phase('seal','seal_dataset',{'dataset_id':DATASET},lambda v:need(compactor.seal_receipt_is_valid(v),'SEAL_RECEIPT_DIFFERS'))
        def valid_status(v):
            item=compactor.dataset_item(v,DATASET,107);need(item['state']=='evaluating' and item['dataset_checksum']==sealed['dataset_checksum'],'SEALED_STATUS_DIFFERS')
        phase('status','certification_status',{'dataset_id':DATASET},valid_status)
    except BaseException as error:
        status=getattr(error,'status',None);status=status if type(status) is int and 100<=status<=599 else None
        failure={'status':'unknown_stop','phase':current,'http_status':status,'failure_classification':'receipt_mismatch' if isinstance(error,Refusal) else 'gateway_http' if status is not None else 'transport_or_unclassified','completed_builds':completed_builds,'completed_physics':completed_physics,'certified':False}
        if not (directory/(current+'.terminal.json')).exists():write_new(directory,current+'.terminal.json',failure)
        write_new(directory,'terminal.json',failure);raise Refusal('OUTCOME_UNKNOWN_NO_RETRY') from None
    terminal={'status':'sealed_evaluating_requires_independent_readback','dataset_checksum':sealed['dataset_checksum'],'completed_builds':107,'completed_physics':856,'certified':False}
    write_new(directory,'terminal.json',terminal);return terminal


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',required=True);parser.add_argument('--config-sha256',required=True);args=parser.parse_args()
    try:
        config=strict_json(pinned({'path':args.config,'sha256':args.config_sha256},limit=64*1024));client,compactor,plan,snapshot=admit(config)
        run_once(client,compactor,plan,snapshot,config['output'],args.config_sha256);return 0
    except BaseException:
        print('R7 qualification preparation stopped; inspect durable outcome; no automatic retry',file=sys.stderr);return 1


if __name__=='__main__':
    raise SystemExit(main())
