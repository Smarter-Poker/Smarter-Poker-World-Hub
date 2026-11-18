"""Pure, fail-closed range-profile admission. Does not generate or solve ranges.

The expected receipt digest comes from the caller's frozen trusted manifest,
never from the supplied profile/receipt. A matching digest proves byte identity,
not the truth of the review or equilibrium correctness.
"""
import copy, hashlib, json, math, re

CONTEXT_KEYS=frozenset(('effective_stack_chips','chips_per_bb','rake','position_pair','pot_type'))
KINDS=frozenset(('solver_export','qualified_authored_reviewed'))

def _sha(raw): return hashlib.sha256(raw).hexdigest()
def _canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def profile_sha256(profile): return _sha(_canonical(profile))
def _json(raw):
    def unique(pairs):
        out={}
        for key,value in pairs:
            if key in out: raise ValueError('duplicate JSON key')
            out[key]=value
        return out
    return json.loads(raw,object_pairs_hook=unique)
def _number(value): return type(value) in (int,float) and math.isfinite(value)
def _context(context):
    if not isinstance(context,dict) or set(context)!=CONTEXT_KEYS:raise ValueError('exact preflop context required')
    for name in ('effective_stack_chips','chips_per_bb'):
        if not _number(context[name]) or context[name]<=0:raise ValueError('positive stack and chip scale required')
    rake=context['rake']
    if not isinstance(rake,list) or len(rake)!=2 or not all(_number(n) for n in rake) or not 0<=rake[0]<=1 or rake[1]<0:raise ValueError('explicit rake fraction and chip cap required')
    for name in ('position_pair','pot_type'):
        if not isinstance(context[name],str) or not context[name].strip():raise ValueError('position and pot type required')
    return _canonical(context)

def admit_range_profile(profile,context,source_bytes,receipt_bytes,*,expected_receipt_sha256):
    """Admit reviewed bytes for one exact context; always dormant/unqualified.

    Callers independently enforce the model's applicability/support gate. This
    API accepts no paths and has no file, network, solver or registration I/O.
    """
    expected_context=_context(context)
    if not isinstance(profile,dict) or profile.get('format')!='HV31_PREFLOP_RANGE_PROFILE_V1' or profile.get('kind') not in KINDS:raise ValueError('qualified profile kind required; proxy ranges refused')
    if _context(profile.get('context'))!=expected_context:raise ValueError('profile context mismatch')
    provenance=profile.get('provenance')
    if not isinstance(provenance,dict):raise ValueError('provenance required')
    fields=('producer','tool_version','export_id') if profile['kind']=='solver_export' else ('author','protocol','review_reference')
    if not all(isinstance(provenance.get(k),str) and provenance[k].strip() for k in fields):raise ValueError('complete source provenance required')
    if not isinstance(source_bytes,bytes) or not isinstance(receipt_bytes,bytes):raise ValueError('actual source and receipt bytes required')
    if not isinstance(expected_receipt_sha256,str) or not re.fullmatch('[0-9a-f]{64}',expected_receipt_sha256):raise ValueError('trusted frozen receipt digest required')
    if _sha(receipt_bytes)!=expected_receipt_sha256:raise ValueError('validation receipt checksum mismatch')
    source_sha=_sha(source_bytes)
    if profile.get('source_sha256')!=source_sha:raise ValueError('range source checksum mismatch')
    receipt=_json(receipt_bytes);profile_sha=profile_sha256(profile)
    if not isinstance(receipt,dict) or receipt.get('format')!='HV31_PREFLOP_RANGE_VALIDATION_V1' or receipt.get('accepted') is not True:raise ValueError('accepted validation receipt required')
    if receipt.get('profile_sha256')!=profile_sha or receipt.get('source_sha256')!=source_sha or receipt.get('evidence_kind')!=profile['kind'] or _context(receipt.get('context'))!=expected_context:raise ValueError('validation receipt binding mismatch')
    if not all(isinstance(receipt.get(k),str) and receipt[k].strip() for k in ('reviewer','reviewed_at')):raise ValueError('validation review provenance required')
    payload=_json(source_bytes)
    if not isinstance(payload,dict) or set(payload)!= {'IP','OOP'}:raise ValueError('two authored ROOT actor vectors required')
    ranges={}
    for actor,values in payload.items():
        if not isinstance(values,list) or len(values)!=1326 or not all(_number(n) and 0<=n<=1 for n in values) or not any(n>0 for n in values):raise ValueError('1326 finite nonzero ROOT range weights required')
        ranges[actor]=tuple(values)
    return dict(admission='REVIEWED_RANGE_BYTES_FOR_EXACT_CONTEXT',context=copy.deepcopy(context),ranges=ranges,profile_sha256=profile_sha,source_sha256=source_sha,receipt_sha256=expected_receipt_sha256,equilibrium_certified=False,model_qualified=False,live_play=False)
