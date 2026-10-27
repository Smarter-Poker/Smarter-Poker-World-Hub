const CHECKSUM = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUIRED = ['bundle_key', 'bundle_version', 'range_bundle_checksum',
  'source_combo_order_checksum', 'icm_model_checksum', 'files', 'approval_note'];
const OPTIONAL = ['feature_contract_version', 'policy_export_schema'];
const FILE_KINDS = new Set(['range', 'combo_order', 'icm_model', 'payout_model', 'scenario_manifest']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const checksum = (value) => typeof value === 'string' && CHECKSUM.test(value) && value !== '0'.repeat(64);

/** Review the parsed payload that the original authenticated RPC will receive. */
export function reviewV31InputApproval(text) {
  if (typeof text !== 'string' || !text.trim() || new TextEncoder().encode(text).length > 262144) {
    throw new Error('Paste An Input Approval Payload Under 256 KiB.');
  }
  let bundle;
  try { bundle = JSON.parse(text); } catch { throw new Error('The Input Approval Payload Is Not Valid JSON.'); }
  if (!object(bundle) || REQUIRED.some((key) => !Object.hasOwn(bundle, key))
    || Object.keys(bundle).some((key) => !REQUIRED.includes(key) && !OPTIONAL.includes(key))) {
    throw new Error('Use The Input Approval Payload Produced By The V31 Bundle Preparer.');
  }
  if (typeof bundle.bundle_key !== 'string' || !/^[a-z0-9][a-z0-9._:-]{2,127}$/.test(bundle.bundle_key)
    || typeof bundle.bundle_version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(bundle.bundle_version)
    || typeof bundle.approval_note !== 'string' || !bundle.approval_note.trim() || bundle.approval_note.length > 2000
    || OPTIONAL.some((key) => Object.hasOwn(bundle, key) && (typeof bundle[key] !== 'string' || !bundle[key]))) {
    throw new Error('The Bundle Identity Or Approval Note Is Incomplete.');
  }
  for (const key of ['range_bundle_checksum', 'source_combo_order_checksum', 'icm_model_checksum']) {
    if (!checksum(bundle[key])) throw new Error('Every Input Checksum Must Be A Nonzero SHA-256 Value.');
  }
  if (!Array.isArray(bundle.files) || !bundle.files.length || bundle.files.some((file) => (
    !object(file) || Object.keys(file).length !== 3
    || !['kind', 'path', 'checksum'].every((key) => Object.hasOwn(file, key))
    || !FILE_KINDS.has(file.kind) || !checksum(file.checksum)
    || typeof file.path !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{1,255}$/.test(file.path)
    || file.path.split('/').some((part) => !part || part === '.' || part === '..')
  )) || new Set(bundle.files.map((file) => file.path)).size !== bundle.files.length) {
    throw new Error('The Input File Receipts Are Invalid Or Repeated.');
  }
  for (const [kind, key] of [['range', 'range_bundle_checksum'], ['combo_order', 'source_combo_order_checksum'], ['icm_model', 'icm_model_checksum']]) {
    const matches = bundle.files.filter((file) => file.kind === kind);
    if (matches.length !== 1 || matches[0].checksum !== bundle[key]) {
      throw new Error('The Input File Receipts Do Not Match The Bundle Checksums.');
    }
  }
  const manifests = bundle.files.filter((file) => file.kind === 'scenario_manifest');
  if (manifests.length !== 1) throw new Error('Exactly One Scenario Manifest Receipt Is Required.');
  return { bundle, scenarioManifest: manifests[0] };
}

/** The configured browser client supplies its genuine current bearer token. */
export async function approveReviewedV31Input(client, operatorId, reviewed) {
  if (typeof operatorId !== 'string' || !UUID.test(operatorId)) {
    throw new Error('The Signed-In Operator Could Not Be Verified.');
  }
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || auth?.user?.id !== operatorId) {
    throw new Error('The Signed-In Operator Changed. Reload This Console Before Approving.');
  }
  const { data, error } = await client.rpc('ca_gto_v31_approve_input_bundle', {
    p_bundle: reviewed.bundle,
  });
  if (error) throw new Error(error.message || 'Input Approval Was Not Confirmed.');
  if (typeof data !== 'string' || !UUID.test(data)) {
    throw new Error('The Database Did Not Return A Valid Input Approval Receipt. Verify Stored State Before Retrying.');
  }
  return data;
}
