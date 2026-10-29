"""Focused synthetic wire admission checks; no solver, model fitting or data."""
import copy
import math
import unittest

from contract import ContractError
from public_hist215 import (canonical_bytes, decode_f64, digest, encode_f64, serialize_model,
                            serialize_training_provenance, TRAINING_DIGEST_KEYS, FROZEN_PARAMETERS)


class Public215WireTests(unittest.TestCase):
    def model(self):
        return {"format": "public_hist215_v1", "variant": "coherent", "feature_count": 215,
                "action_ids": ["check"], "template_sha256": "1"*64,
                "feature_schema_sha256": "2"*64, "provenance_sha256": "3"*64,
                "heads": [{"baseline_f64": "0000000000000000",
                           "trees": [[{"value_f64": "8000000000000000"}] for _ in range(100)]}
                          for _ in range(3)]}

    def admit(self, m, **extra):
        return serialize_model(m, **({"model_sha256": digest(m), "template_sha256": "1"*64,
                              "feature_schema_sha256": "2"*64, "provenance_sha256": "3"*64,
                              "action_ids": ["check"]} | extra))

    def test_canonical_independent_known_bytes(self):
        self.assertEqual(canonical_bytes({"z": [True, 2], "a": '"\\'}), b'{"a":"\\\"\\\\","z":[true,2]}')
        for bad in [1.0, float("nan"), "é", {1: "x"}, 1 << 53]:
            with self.assertRaises(ContractError): canonical_bytes(bad)

    def test_exact_words_and_valid_whole_model(self):
        self.assertEqual(encode_f64(-0.0), "8000000000000000")
        self.assertEqual(encode_f64(1.0), "3ff0000000000000")
        self.assertEqual(decode_f64("0000000000000001"), math.ulp(0.0))
        for bad in [True, 10**400, float("inf")]:
            with self.assertRaises(ContractError): encode_f64(bad)
        self.assertEqual(self.admit(self.model()), canonical_bytes(self.model()))

    def test_head_shape_order_binding_digest_and_nonfinite_refuse(self):
        for change in [lambda m: m["heads"].pop(),
                       lambda m: m["heads"][0]["trees"].pop(),
                       lambda m: m.update(feature_count=True),
                       lambda m: m.update(template_sha256="4"*64),
                       lambda m: m["heads"][0].update(baseline_f64="7ff0000000000000"),
                       lambda m: m.update(action_ids=["constructor"])]:
            m = self.model(); change(m)
            with self.assertRaises(ContractError): self.admit(m)
        with self.assertRaises(ContractError): self.admit(self.model(), model_sha256="0"*64)

    def test_graph_and_integer_boundaries_refuse(self):
        split = {"feature": 214, "threshold_f64": "3ff0000000000000", "left": 1, "right": 2, "missing_left": False}
        tree = [split, {"value_f64": "0000000000000000"}, {"value_f64": "0000000000000001"}]
        m = self.model(); m["heads"][0]["trees"][0] = tree
        self.admit(m)
        for key, val in [("left", 0), ("right", 1), ("feature", True), ("feature", 215), ("left", -1), ("missing_left", 0)]:
            bad = copy.deepcopy(m); bad["heads"][0]["trees"][0][0][key] = val
            with self.assertRaises(ContractError): self.admit(bad)

    def provenance(self):
        row = "11111111-1111-4111-8111-111111111111"
        return {**{key: "1"*64 for key in TRAINING_DIGEST_KEYS},
                "format": "public_hist215_training_v1", "approved_input_bundle_id": row,
                "producer_commit": "1"*40, "whole_variant": "coherent", "machine_id": "M1",
                "parameters": dict(FROZEN_PARAMETERS), "source_count": 2, "artifact_count": 1,
                "board_count": 1, "sources": [
                    {"source_row_id": row, "source_node": node, "board": "AsKdQc",
                     "artifact_checksum": "2"*64, "node_checksum": "3"*64}
                    for node in ["r:0", "r:0:c"]]}

    def test_multi_node_artifact_is_truthful_not_forced_unique(self):
        p = self.provenance()
        self.assertEqual(serialize_training_provenance(p, expected_sha256=digest(p)), canonical_bytes(p))

    def test_training_identity_census_partition_and_parameter_refusals(self):
        changes = [lambda p: p.update(machine_id="M2"),
                   lambda p: p.update(artifact_count=2),
                   lambda p: p.update(board_count=2),
                   lambda p: p["sources"].reverse(),
                   lambda p: p["sources"][1].update(source_node="r:0"),
                   lambda p: p["sources"][1].update(artifact_checksum="4"*64),
                   lambda p: p["sources"][0].update(board="AsAsQc"),
                   lambda p: p["parameters"].update(max_iter=300),
                   lambda p: p["parameters"].update(early_stopping=0),
                   lambda p: p.update(capture_receipt_checksum="0"*64)]
        for change in changes:
            p = self.provenance(); change(p)
            with self.assertRaises(ContractError):
                serialize_training_provenance(p, expected_sha256=digest(p))


class Public215MetadataTests(unittest.TestCase):
    def protocols(self, entry):
        from pathlib import Path
        import json
        from public_hist215 import NATIVE_SOURCE_SHA256
        bodies={k:{"format":"synthetic_pre_capture_"+k} for k in ["training_recipe","source_partition","dependency_lock","physics_protocol"]}
        bodies["feature_schema"]=json.loads(Path(__file__).with_name("public_hist215_feature_descriptor.json").read_text())
        bodies["runtime_parity_protocol"]={"format":"public_hist215_runtime_parity_protocol_v1","method":"cold_public215_features_and_all_heads_v1","clock":"process.hrtime.bigint","platform":"linux","node_major":22,"napi_version":8,"native_source_checksum":NATIVE_SOURCE_SHA256,"execution_limit_ms":8000,"contexts":[{"context":entry["context"],"cases":[{"board":"AsKd7c","own":["2c","2d"]},{"board":"AsKd7c","own":["3c","3d"]}]}]}
        return bodies

    def entry(self):
        from public_hist215 import FEATURE_DESCRIPTOR_SHA256
        from pio_upi import target_context
        from test_pipeline import base_scenario
        scenario = base_scenario()
        return {"context": target_context(scenario, scenario["targets"][0]),
                "expected_children": scenario["targets"][0]["expected_children"],
                "model_action_order": sorted(scenario["targets"][0]["expected_children"]),
                "template_checksum": "a"*64, "feature_schema_checksum": FEATURE_DESCRIPTOR_SHA256}

    def test_metadata_order_children_and_descriptor_binding(self):
        from public_hist215 import validate_context_metadata
        e = self.entry(); validate_context_metadata([e])
        for mutate in [lambda e: e.update(expected_children=["c", "c"]),
                       lambda e: e.update(feature_schema_checksum="b"*64),
                       lambda e: e["context"].update(table_size=True)]:
            bad = copy.deepcopy(e); mutate(bad)
            with self.assertRaises(ContractError): validate_context_metadata([bad])
        with self.assertRaises(ContractError): validate_context_metadata([e, e])

    def test_pipeline_file_set_is_versioned_without_weakening_legacy(self):
        from contract import required_pipeline_files, REQUIRED_PIPELINE_FILES, PUBLIC215_PIPELINE_FILES, PUBLIC215_PIPELINE_CONTRACT
        self.assertEqual(required_pipeline_files({}), REQUIRED_PIPELINE_FILES)
        manifest = {"pipeline_contract_version": PUBLIC215_PIPELINE_CONTRACT,
                    "policy_representation": "public_hist215_v1", "public215_contexts": [self.entry()],
                    "public215_template_files": [], "public215_protocols": self.protocols(self.entry()), "public215_protocol_files": {}, "feature_contract_version": "holdem-public-hist215-v1",
                    "policy_export_schema": "smarter-poker.pio-policy.v4"}
        self.assertEqual(len(required_pipeline_files(manifest)), 9)
        self.assertEqual(required_pipeline_files(manifest), PUBLIC215_PIPELINE_FILES)
        del manifest["pipeline_contract_version"]
        with self.assertRaises(ContractError): required_pipeline_files(manifest)

    def test_actual_pinned_template_matches_actor_geometry_and_exact_root_weights(self):
        import tempfile
        import hashlib
        from pathlib import Path
        from test_pipeline import base_scenario
        from public_hist215 import validate_manifest_metadata
        scenario = base_scenario()
        # Pure synthetic range files, confined to this owned external checkout.
        with tempfile.TemporaryDirectory(prefix=".public215-synthetic-", dir=Path(__file__).resolve().parents[2]) as folder:
            root = Path(folder); (root/"ranges").mkdir()
            raw = (" ".join(["1"]*1326)).encode()
            for side in ("ip", "oop"):
                (root/scenario[side+"_range_path"]).write_bytes(raw)
                scenario[side+"_range_checksum"] = hashlib.sha256(raw).hexdigest()
            e = self.entry()
            template = {"format":"public_hist215_template_v1", "context": e["context"], "root_actor":"OOP",
                        "scenario": {"pot_chips_f64":encode_f64(100), "effective_stack_chips_f64":encode_f64(1000),
                                     "chips_per_bb_f64":encode_f64(100), "rake_f64":[encode_f64(0),encode_f64(0)],
                                     "ip_range_checksum":scenario["ip_range_checksum"], "oop_range_checksum":scenario["oop_range_checksum"]},
                        "opponent_weights":[str(10**12)]*1326}
            def manifest_for(t):
                payload=canonical_bytes(t); (root/"template.json").write_bytes(payload)
                checksum=hashlib.sha256(payload).hexdigest()
                entry=copy.deepcopy(e);entry["template_checksum"]=checksum
                protocols=self.protocols(entry); files={}
                for key,body in protocols.items():
                    path=key+".json";(root/path).write_bytes(canonical_bytes(body));files[key]={"path":path,"checksum":digest(body)}
                return {"scenarios":[scenario],"public215_contexts":[entry],"public215_template_files":[{"path":"template.json","checksum":checksum}],"public215_protocols":protocols,"public215_protocol_files":files}
            cards=[r+s for r in "23456789TJQKA" for s in "cdhs"]
            order=tuple(cards[a]+cards[b] for b in range(1,52) for a in range(b))
            validate_manifest_metadata(manifest_for(template),root,order,verify_inputs=True)
            for change in [lambda t:t.update(root_actor="IP"),lambda t:t["scenario"].update(pot_chips_f64=encode_f64(101)),lambda t:t["opponent_weights"].__setitem__(0,"1")]:
                bad=copy.deepcopy(template);change(bad)
                with self.assertRaises(ContractError):validate_manifest_metadata(manifest_for(bad),root,order,verify_inputs=True)

    def test_approval_checksum_covers_order_and_template_receipts(self):
        from contract import input_bundle_checksum
        e = self.entry()
        bundle = {"bundle_key": "synthetic.public215", "bundle_version": "1", "approval_note": "synthetic only",
                  "range_bundle_checksum": "1"*64, "source_combo_order_checksum": "2"*64,
                  "icm_model_checksum": "3"*64, "policy_representation": "public_hist215_v1",
                  "feature_contract_version": "holdem-public-hist215-v1", "policy_export_schema": "smarter-poker.pio-policy.v4",
                  "public215_contexts": [e], "files": [
                      {"kind": kind, "path": path, "checksum": checksum} for kind,path,checksum in [
                          ("range","ranges.json","1"*64),("combo_order","combos.txt","2"*64),
                          ("icm_model","icm.json","3"*64),("scenario_manifest","manifest.json","4"*64),
                          ("public215_template","template.json","a"*64)]]}
        bundle["public215_protocols"]=self.protocols(e)
        for key,body in bundle["public215_protocols"].items():
            bundle["files"].append({"kind":"public215_"+key,"path":key+".json","checksum":digest(body)})
        before = input_bundle_checksum(bundle)
        bundle["public215_contexts"][0]["expected_children"].reverse()
        self.assertNotEqual(before, input_bundle_checksum(bundle))
        bundle["files"][4]["checksum"] = "b"*64
        with self.assertRaises(ContractError): input_bundle_checksum(bundle)


class Public215BuildReceiptTests(unittest.TestCase):
    model=Public215WireTests.model
    provenance=Public215WireTests.provenance
    def build(self):
        from public_hist215 import NATIVE_SOURCE_SHA256
        p=self.provenance();m=self.model();m["feature_schema_sha256"]=p["feature_schema_checksum"]
        m["provenance_sha256"]=digest(p)
        cases=[]
        approved=[{"board":"AsKdQc","own":["2c","2d"]},{"board":"AsKdQc","own":["3c","3d"]}]
        for c in approved:
            cases.append({**c,"features_f64":[encode_f64(0)]*215,"raw_heads_f64":[encode_f64(0)]*3,
                          "policy_ev_f64":encode_f64(0),"Q_f64":[encode_f64(0)],"frequency_f64":[encode_f64(1)],
                          "physics_ms_f64":encode_f64(1),"inference_ms_f64":encode_f64(2)})
        r={"format":"public_hist215_build_receipt_v1","dataset_id":"11111111-1111-4111-8111-111111111111",
           "model_checksum":digest(m),"training_provenance_checksum":digest(p),"template_checksum":m["template_sha256"],
           "runtime":{"node_version":"v22.20.0","platform":"linux","arch":"x64","napi_version":8,"native_source_checksum":NATIVE_SOURCE_SHA256,"native_binary_checksum":"b"*64},
           "cases":cases,"cost":{"method":"cold_public215_features_and_all_heads_v1","clock":"process.hrtime.bigint","cold_cases":2,"max_physics_ms_f64":encode_f64(1),"max_inference_ms_f64":encode_f64(2),"execution_limit_ms":8000,"model_bytes":len(canonical_bytes(m)),"head_count":3}}
        for k in ["input_bundle_checksum","feature_schema_checksum","encoder_checksum","physics_checksum","dependency_lock_checksum","producer_commit","producer_bundle_checksum"]:r[k]=p[k]
        return r,m,p,approved

    def test_separate_postmodel_build_receipt_has_no_provenance_hash_cycle(self):
        from public_hist215 import serialize_build_receipt
        r,m,p,a=self.build()
        self.assertEqual(serialize_build_receipt(r,expected_sha256=digest(r),model=m,provenance=p,dataset_id=r["dataset_id"],approved_cases=a),canonical_bytes(r))
        self.assertNotIn("runtime_parity_receipt_checksum",p)
        self.assertIn("runtime_parity_protocol_checksum",p)

    def test_build_runtime_protocol_vectors_crossbindings_and_cost_refusals(self):
        from public_hist215 import serialize_build_receipt
        for change in [lambda r:r["runtime"].update(platform="darwin"),lambda r:r["runtime"].update(node_version="v24.15.0"),
                       lambda r:r["runtime"].update(napi_version=True),lambda r:r.update(model_checksum="b"*64),
                       lambda r:r["cases"].pop(),lambda r:r["cases"][0]["features_f64"].pop(),
                       lambda r:r["cases"][0].update(own=["As","2c"]),lambda r:r["cases"].reverse(),
                       lambda r:r["cases"][0].update(inference_ms_f64=encode_f64(8001)),
                       lambda r:r["cost"].update(model_bytes=1),lambda r:r["cost"].update(max_inference_ms_f64=encode_f64(3)),
                       lambda r:r["cases"][0].update(frequency_f64=[encode_f64(0)])]:
            r,m,p,a=self.build();change(r)
            with self.assertRaises(ContractError):serialize_build_receipt(r,expected_sha256=digest(r),model=m,provenance=p,dataset_id=r["dataset_id"],approved_cases=a)


class Public215IndexTests(unittest.TestCase):
    def test_protocol_body_mutations_are_covered_and_unplanned_m1_cases_refuse(self):
        from public_hist215 import validate_protocols
        helper=Public215MetadataTests();entry=helper.entry();protocols=helper.protocols(entry)
        validate_protocols(protocols,[entry])
        for change in [lambda p:p["runtime_parity_protocol"].update(node_major=24),
                       lambda p:p["runtime_parity_protocol"]["contexts"][0]["cases"].pop(),
                       lambda p:p["runtime_parity_protocol"]["contexts"][0]["cases"][0].update(own=["As","2c"]),
                       lambda p:p["feature_schema"].update(extra=True)]:
            bad=copy.deepcopy(protocols);change(bad)
            with self.assertRaises(ContractError):validate_protocols(bad,[entry])

    def test_pinned_postcapture_index_checks_source_protocol_order_and_receipt(self):
        import tempfile
        from pathlib import Path
        from public_hist215 import load_model_build_index,FEATURE_DESCRIPTOR_SHA256
        r,m,p,a=Public215BuildReceiptTests().build()
        e=Public215MetadataTests().entry();e["expected_children"]=["c","b50"];e["model_action_order"]=["b50","c"]
        m["action_ids"]=["b50","c"];m["heads"] += copy.deepcopy(m["heads"][:2])
        protocols=Public215MetadataTests().protocols(e)
        # Public protocol fixture uses the same predeclared cases; no source labels.
        protocols["runtime_parity_protocol"]["contexts"][0]["cases"]=a
        for field,key in [("training_recipe_checksum","training_recipe"),("source_partition_checksum","source_partition"),("runtime_parity_protocol_checksum","runtime_parity_protocol"),("dependency_lock_checksum","dependency_lock"),("physics_checksum","physics_protocol")]:p[field]=digest(protocols[key])
        p["feature_schema_checksum"]=FEATURE_DESCRIPTOR_SHA256
        template={"format":"public_hist215_template_v1","context":e["context"]}
        e["template_checksum"]=digest(template)
        m.update(template_sha256=e["template_checksum"],feature_schema_sha256=FEATURE_DESCRIPTOR_SHA256,provenance_sha256=digest(p))
        r.update(model_checksum=digest(m),training_provenance_checksum=digest(p),template_checksum=e["template_checksum"],feature_schema_checksum=FEATURE_DESCRIPTOR_SHA256,physics_checksum=p["physics_checksum"],dependency_lock_checksum=p["dependency_lock_checksum"])
        for c in r["cases"]:c.update(raw_heads_f64=[encode_f64(0)]*5,Q_f64=[encode_f64(0)]*2,frequency_f64=[encode_f64(.5)]*2)
        r["cost"].update(model_bytes=len(canonical_bytes(m)),head_count=5)
        envelope={"context":e["context"],"policy_representation":"public_hist215_v1","public_model":m,"public_template":template,"public_training_provenance":p,"model_checksum":digest(m),"template_checksum":e["template_checksum"],"feature_schema_checksum":FEATURE_DESCRIPTOR_SHA256,"training_provenance_checksum":digest(p),"public_model_build_receipt":r,"model_build_receipt_checksum":digest(r)}
        manifest={"public215_contexts":[e],"public215_protocols":protocols,"input_bundle_id":p["approved_input_bundle_id"],"input_bundle_checksum":p["input_bundle_checksum"],"_actual_manifest_checksum":p["manifest_checksum"],"pipeline_commit":p["producer_commit"],"pipeline_bundle_checksum":p["producer_bundle_checksum"],"solver_binary_checksum":p["solver_binary_checksum"],"range_bundle_checksum":p["range_bundle_checksum"],"icm_model_checksum":p["icm_model_checksum"]}
        index={"format":"public_hist215_build_index_v1","dataset_id":r["dataset_id"],"models":[envelope]}
        with tempfile.TemporaryDirectory(prefix=".public215-index-",dir=Path(__file__).resolve().parents[2]) as directory:
            path=Path(directory)/"index.json"
            def load(value,checksum=None,prepare_only=False):
                payload=canonical_bytes(value);path.write_bytes(payload)
                return load_model_build_index(path,expected_checksum=checksum or digest(value),dataset_id=r["dataset_id"],manifest=manifest,prepare_only=prepare_only)
            self.assertEqual(len(load(index)),1)
            prepare=copy.deepcopy(index);prepare["format"]="public_hist215_prepare_index_v1"
            for entry in prepare["models"]:
                del entry["public_model_build_receipt"];del entry["model_build_receipt_checksum"]
            self.assertEqual(len(load(prepare,prepare_only=True)),1)
            with self.assertRaises(ContractError):load(prepare)
            with self.assertRaises(ContractError):load(index,"b"*64)
            for change in [lambda x:x["models"].append(copy.deepcopy(envelope)),lambda x:x["models"][0]["public_model"]["action_ids"].reverse(),lambda x:x["models"][0]["public_training_provenance"].update(manifest_checksum="b"*64),lambda x:x["models"][0].update(model_build_receipt_checksum="b"*64)]:
                bad=copy.deepcopy(index);change(bad)
                with self.assertRaises(ContractError):load(bad)


class Public215M2SelectorTests(unittest.TestCase):
    def protocol(self):
        import hashlib
        seed=bytes([0xa5])*32
        e=Public215MetadataTests().entry();c=e["context"]
        boards=["Ks7d2c","QsJd2c","Qs5d3c","Ks7d5c","QsTd5c","QsJd6c","QsTd6c","KsJd8c","KsJd2c","QsJd3c"]
        rank=lambda b:"3:"+"".join(sorted(b[::2],key="23456789TJQKA".index))
        p={"format":"public_hist215_m2_selection_protocol_v1","boards_per_context":8,"context_id_rule":"sha256_sorted_compact_printable_ASCII_context_JSON_no_newline",
           "domain_separator":"public_hist215_m2_rank_v1","physical_board_rule":"exact canonical_example_board from frozen reservation; chronology retained; no suit or card-order reroll",
           "rank_message":"domain_separator + ASCII_NUL + context_id + ASCII_NUL + rank_signature",
           "rank_order":"ascending raw HMAC_SHA256(secret_seed,ASCII(rank_message)) bytes, then ascending rank_signature ASCII; first8",
           "rank_selection":"hmac_sha256_context_rank_first8_v1","reservation_checksum":"b"*64,"seed_bytes":32,"seed_commitment_checksum":hashlib.sha256(seed).hexdigest(),
           "contexts":[{"context":c,"context_id":digest(c),"candidates":sorted([{"board":b,"rank_signature":rank(b)} for b in boards],key=lambda b:b["rank_signature"])}]}
        return p,seed

    def test_deterministic_exact_eight_and_canonical_chronology(self):
        from public_hist215 import select_m2_public_candidates
        p,seed=self.protocol();selected=select_m2_public_candidates(p,seed)
        self.assertEqual(len(selected),8)
        self.assertEqual(selected,select_m2_public_candidates(p,seed))
        # Independent hmac library message oracle, prior to source selection.
        import hmac,hashlib
        cid=p["contexts"][0]["context_id"]
        order=sorted(p["contexts"][0]["candidates"],key=lambda c:(hmac.digest(seed,b"public_hist215_m2_rank_v1\0"+cid.encode()+b"\0"+c["rank_signature"].encode(),"sha256"),c["rank_signature"]))[:8]
        self.assertEqual([x["board"] for x in selected],[x["board"] for x in sorted(order,key=lambda c:c["rank_signature"])])
        self.assertTrue(all(set(x)=={"context_id","rank_signature","board"} for x in selected))

    def test_wrong_seed_context_domain_duplicate_and_rank_refuse(self):
        from public_hist215 import select_m2_public_candidates
        p,seed=self.protocol()
        with self.assertRaises(ContractError):select_m2_public_candidates(p,bytes(32))
        for change in [lambda p:p.update(domain_separator="reroll"),lambda p:p["contexts"][0].update(context_id="b"*64),
                       lambda p:p["contexts"][0]["candidates"].append(copy.deepcopy(p["contexts"][0]["candidates"][0])),
                       lambda p:p["contexts"][0]["candidates"][0].update(rank_signature="3:bad")]:
            bad=copy.deepcopy(p);change(bad)
            with self.assertRaises(ContractError):select_m2_public_candidates(bad,seed)

    def test_seed_is_transport_only_and_does_not_change_checkpoint_bytes(self):
        from worker import artifact_upload_view
        artifact={"id":"synthetic","strategy_matrix_v2":{"selection_receipt":{"format":"seed_free"},"selection_receipt_checksum":"a"*64}}
        before=canonical_bytes(artifact);seed=bytes([0xa5])*32
        self.assertIs(artifact_upload_view(artifact,None),artifact)
        request=artifact_upload_view(artifact,seed)
        self.assertEqual(request["selection_seed"],seed.hex())
        self.assertNotIn("selection_seed",artifact)
        self.assertEqual(canonical_bytes(artifact),before)
        self.assertNotIn(seed.hex().encode(),before)
        with self.assertRaises(ContractError):artifact_upload_view(artifact,b"short")

    def test_authenticated_server_full_map_must_match_before_seed_open(self):
        import worker
        from unittest import mock
        from types import SimpleNamespace
        from pathlib import Path
        args=SimpleNamespace(manifest="unused",input_root="unused",machine="M2",preflight_only=False,m2_model_builds="index",m2_model_builds_checksum="a"*64,m2_seed_file="private-never-opened",work_directory="unused")
        manifest=SimpleNamespace(raw={"policy_representation":"public_hist215_v1","scenarios":[{"targets":[{"machine_id":"M2"}]}]},checksum="a"*64,provenance={})
        client=mock.Mock();client.call.side_effect=[{"state":"building","dataset_id":"11111111-1111-4111-8111-111111111111"},{}]
        with mock.patch.object(worker,"load_manifest",return_value=manifest),mock.patch.object(worker,"validate_pipeline_imports"),mock.patch.object(worker,"verify_environment"),mock.patch.dict(worker.os.environ,{"PIO_EXE":"/usr/bin/true"}),mock.patch.object(worker.GatewayClient,"from_environment",return_value=client),mock.patch("public_hist215.load_model_build_index",return_value={}),mock.patch.object(Path,"open") as seed_open,mock.patch.object(worker,"PioProcess") as pio:
            with self.assertRaises(ContractError):worker.run(args)
            self.assertEqual(client.call.call_args.args[0],"model_freeze_authority")
            seed_open.assert_not_called();pio.assert_not_called()

    def test_new_m2_worker_fails_before_seed_or_solver_without_selector(self):
        import worker
        from unittest import mock
        from types import SimpleNamespace
        args=SimpleNamespace(manifest="unused",input_root="unused",machine="M2",preflight_only=False)
        manifest=SimpleNamespace(raw={"policy_representation":"public_hist215_v1"})
        with mock.patch.object(worker,"load_manifest",return_value=manifest),mock.patch.object(worker,"validate_pipeline_imports"),mock.patch.object(worker,"PioProcess") as pio:
            with self.assertRaisesRegex(ContractError,"complete frozen Linux model index"):
                worker.run(args)
            pio.assert_not_called()


if __name__ == "__main__":
    unittest.main()
