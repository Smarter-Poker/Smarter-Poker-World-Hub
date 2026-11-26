"""Provenance-qualified range intake; proxy simulations never gain certification."""
from range_profile import admit_range_profile

def range_status(profile=None,context=None,source_bytes=None,receipt_bytes=None,*,expected_receipt_sha256=None):
 if profile is None:
  return dict(state='BLOCKED_NO_QUALIFIED_DEPTH_RAKED_PROFILE',simulation_range='authored80bb_zero_rake_proxy',realistic_preflop_qualification=False,equilibrium_certified=False,model_qualified=False,live_play=False)
 return admit_range_profile(profile,context,source_bytes,receipt_bytes,expected_receipt_sha256=expected_receipt_sha256)
