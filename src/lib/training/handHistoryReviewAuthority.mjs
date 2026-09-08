const COMPLETE_SERVER_AUDIT_SOURCE = /^(?:DETERMINISTIC_SOLVER|PIO_DATABASE|PIO|PIOSOLVER|SOLVER_PROVENANCE_VERIFIED)\|hand-audit-v3$/i;
const AUDITED_CLASSIFICATIONS = new Set(['best', 'correct', 'inaccuracy', 'wrong', 'blunder']);
const AUDITED_STREETS = new Set(['preflop', 'flop', 'turn', 'river']);

export function isProvenanceCompleteAuditedDecision(decision) {
  if (!decision || decision.solverVerified !== true || decision.matchTier !== 1) return false;
  if (!COMPLETE_SERVER_AUDIT_SOURCE.test(String(decision.solverSource || ''))) return false;
  if (!AUDITED_CLASSIFICATIONS.has(String(decision.classification || '').toLowerCase())) return false;
  if (!AUDITED_STREETS.has(String(decision.street || '').toLowerCase())) return false;
  if (!String(decision.playerAction || '').trim() || !String(decision.solverAction || '').trim()) return false;
  if (decision.evLossMeasured !== true) return true;
  if (decision.evLoss === null || decision.evLoss === undefined || decision.evLoss === '') return false;
  const evLoss = Number(decision.evLoss);
  return Number.isFinite(evLoss) && evLoss >= 0;
}

/**
 * Summarize one server audit without ever grading a partially verified hand.
 * A single missing/tampered decision makes the whole hand replay-only because
 * a subset score would look like a grade for decisions the server did not
 * actually price.
 */
export function summarizeProvenanceCompleteHandAudit(audit) {
  const decisions = Array.isArray(audit?.decisions) ? audit.decisions : [];
  if (decisions.length === 0 || !decisions.every(isProvenanceCompleteAuditedDecision)) {
    return {
      authority: 'replay_only_unpriced',
      solverVerified: false,
      decisions: [],
      score: null,
      evLoss: null,
      correctDecisions: 0,
      mistakeDecisions: null,
    };
  }

  const correctDecisions = decisions.filter(decision => (
    ['best', 'correct'].includes(String(decision.classification).toLowerCase())
  )).length;
  const measured = decisions.filter(decision => decision.evLossMeasured === true);
  return {
    authority: 'provenance_complete_server_audit',
    solverVerified: true,
    decisions,
    score: Math.round((correctDecisions / decisions.length) * 100),
    evLoss: measured.length > 0
      ? +measured.reduce((sum, decision) => sum + Number(decision.evLoss), 0).toFixed(3)
      : null,
    correctDecisions,
    mistakeDecisions: decisions.length - correctDecisions,
  };
}
