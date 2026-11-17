import copy, hashlib, json, unittest, sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent/'src'))
from range_profile import admit_range_profile, profile_sha256

class RangeProfileContracts(unittest.TestCase):
    def fixture(self,kind='solver_export'):
        context=dict(effective_stack_chips=20000,chips_per_bb=100,rake=[.1,250],position_pair='HJ_vs_BB',pot_type='single_raised')
        source=json.dumps({'IP':[.5]*1326,'OOP':[1.]*1326}).encode();sha=hashlib.sha256(source).hexdigest()
        provenance=dict(producer='synthetic',tool_version='TEST',export_id='SYNTHETIC') if kind=='solver_export' else dict(author='synthetic',protocol='TEST_ONLY',review_reference='SYNTHETIC')
        profile=dict(format='HV31_PREFLOP_RANGE_PROFILE_V1',kind=kind,context=copy.deepcopy(context),source_sha256=sha,provenance=provenance)
        return context,source,profile
    def receipt(self,context,source,profile,**changes):
        receipt=dict(format='HV31_PREFLOP_RANGE_VALIDATION_V1',accepted=True,context=context,source_sha256=hashlib.sha256(source).hexdigest(),profile_sha256=profile_sha256(profile),evidence_kind=profile['kind'],reviewer='synthetic',reviewed_at='2026-11-17T00:00:00Z');receipt.update(changes);raw=json.dumps(receipt).encode();return raw,hashlib.sha256(raw).hexdigest()
    def call(self,context,source,profile,**changes):
        raw,pin=self.receipt(context,source,profile,**changes);return admit_range_profile(profile,context,source,raw,expected_receipt_sha256=pin)
    def test_reviewed_exact_bytes_admit_without_equilibrium_or_activation_claim(self):
        for kind in ('solver_export','qualified_authored_reviewed'):
            c,s,p=self.fixture(kind);r=self.call(c,s,p);self.assertFalse(r['equilibrium_certified']);self.assertFalse(r['model_qualified']);self.assertFalse(r['live_play']);self.assertEqual(len(r['ranges']['IP']),1326);c['pot_type']='other';self.assertEqual(r['context']['pot_type'],'single_raised')
    def test_authored_80bb_zero_rake_proxy_cannot_claim_200bb_realism(self):
        c,s,p=self.fixture('qualified_authored_reviewed');p['kind']='authored_proxy'
        with self.assertRaises(ValueError):self.call(c,s,p)
        c,s,p=self.fixture('qualified_authored_reviewed');p['context'].update(effective_stack_chips=8000,rake=[0,0])
        with self.assertRaises(ValueError):self.call(c,s,p)
    def test_each_context_dimension_and_missing_provenance_fail_closed(self):
        for field,value in (('effective_stack_chips',22000),('chips_per_bb',1),('rake',[.05,125]),('position_pair','UTG_vs_BB'),('pot_type','three_bet')):
            c,s,p=self.fixture();p['context'][field]=value
            with self.assertRaises(ValueError):self.call(c,s,p)
        c,s,p=self.fixture();p['provenance'].pop('tool_version')
        with self.assertRaises(ValueError):self.call(c,s,p)
    def test_actual_receipt_and_source_pins_bind_before_admission(self):
        c,s,p=self.fixture();raw,pin=self.receipt(c,s,p)
        for supplied in ('', '0'*64):
            with self.assertRaises(ValueError):admit_range_profile(p,c,s,raw,expected_receipt_sha256=supplied)
        with self.assertRaises(ValueError):admit_range_profile(p,c,s+b' ',raw,expected_receipt_sha256=pin)
        for changes in (dict(accepted=False),dict(profile_sha256='0'*64),dict(source_sha256='0'*64),dict(evidence_kind='authored_proxy'),dict(reviewer='')):
            with self.assertRaises(ValueError):self.call(c,s,p,**changes)
    def test_malformed_root_vectors_and_ambiguous_json_refuse_even_with_matching_digest(self):
        payloads=[{'IP':[0.]*1326,'OOP':[1.]*1326},{'IP':[.5]*1325,'OOP':[1.]*1326},{'IP':[True]*1326,'OOP':[1.]*1326},{'IP':[float('nan')]*1326,'OOP':[1.]*1326},{'IP':[1.1]*1326,'OOP':[1.]*1326}]
        for payload in payloads:
            c,_,p=self.fixture();s=json.dumps(payload).encode();p['source_sha256']=hashlib.sha256(s).hexdigest()
            with self.assertRaises(ValueError):self.call(c,s,p)
        c,_,p=self.fixture();s=b'{"IP":[],"IP":[],"OOP":[]}';p['source_sha256']=hashlib.sha256(s).hexdigest()
        with self.assertRaises(ValueError):self.call(c,s,p)

if __name__=='__main__':unittest.main()
