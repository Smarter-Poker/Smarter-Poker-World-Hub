import {
  SOLVER_POLICY_CONTRACT_VERSION,
  SOLVER_POLICY_VERSION,
  SOLVER_POLICY_SCHEMA_SHA256,
  POLICY_KIND,
  QUALITY_SEAL,
} from '../../../src/lib/training/solverPolicyContract.js';
import { SOLVER_POLICY_CONSUMERS } from '../../../src/services/SolverPolicyService.js';

/** Public metadata probe. It exposes the contract, never solver policy data. */
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'GET only' });
  }
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  return res.status(200).json({
    success: true,
    contractVersion: SOLVER_POLICY_CONTRACT_VERSION,
    policyVersion: SOLVER_POLICY_VERSION,
    schemaSha256: SOLVER_POLICY_SCHEMA_SHA256,
    policyKinds: Object.values(POLICY_KIND),
    qualitySeals: Object.values(QUALITY_SEAL),
    consumers: SOLVER_POLICY_CONSUMERS,
    artifactEnvelope: {
      format: 'SolverPolicyArtifactBundle',
      transport: 'versioned_offline_artifact',
      actionClockRemoteQueries: false,
    },
  });
}
