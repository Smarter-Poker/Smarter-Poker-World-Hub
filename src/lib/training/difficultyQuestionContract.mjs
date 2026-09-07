import { simplifyActions, DIFFICULTY } from '../../engines/DifficultyEngine.js';
import { enforceTrainingQuestionContract } from './questionContract.mjs';

function actionToken(option) {
  const id = String(option?.id || '').toLowerCase();
  const text = String(option?.text || '').toLowerCase();
  if (id === 'f' || id === 'fold' || id === 'simple_fold' || text.startsWith('fold')) return 'fold';
  if (id === 'x' || id === 'check' || text.startsWith('check')) return 'check';
  if (id === 'c' || id === 'call' || text.startsWith('call')) return 'call';
  if (id === 'allin' || id === 'push' || text.includes('all-in') || text.includes('all in') || text.startsWith('push') || text.startsWith('shove') || text.startsWith('jam')) return 'allin';
  if (/^r\d*$/.test(id) || id === 'raise' || text.startsWith('raise') || text.includes('3-bet') || text.includes('4-bet')) return 'raise';
  if (/^b\d*$/.test(id) || id === 'bet' || text.startsWith('bet')) return 'bet';
  return text.split(' ')[0] || id;
}

export function normalizeTrainingDifficultyMode(difficultyMode) {
  const normalized = String(difficultyMode || '').toLowerCase();
  // Keep the canonical contract vocabulary unambiguous. `standard` is the UI
  // middle tier, while DifficultyEngine historically used the same word for
  // its exact-sizings tier. Returning `exact` here makes normalization
  // idempotent and prevents `expert -> standard -> grouped` double mapping.
  if (normalized === 'beginner' || normalized === DIFFICULTY.SIMPLE) return DIFFICULTY.SIMPLE;
  if (normalized === 'expert' || normalized === 'exact') return 'exact';
  if (normalized === 'standard' || normalized === DIFFICULTY.GROUPED) return DIFFICULTY.GROUPED;
  return DIFFICULTY.GROUPED;
}

/**
 * Apply the exact action grouping used by the Arena to a server-canonical
 * question. Both the browser and record-question API call this function, so a
 * grouped action can never be displayed as Best while being stored as Wrong.
 */
export function applyDifficultyToQuestion(question, difficultyMode) {
  if (!question || !Array.isArray(question.options)) return question;
  const normalizedMode = normalizeTrainingDifficultyMode(difficultyMode);
  const engineMode = normalizedMode === 'exact' ? DIFFICULTY.STANDARD : normalizedMode;
  if (question._difficultyApplied === normalizedMode) return enforceTrainingQuestionContract(question);
  if (engineMode === DIFFICULTY.STANDARD) return enforceTrainingQuestionContract(question);

  try {
    const potSize = question.scenario?.pot || 10;
    const enriched = question.options.map((option) => ({
      id: option.id,
      text: option.text,
      action: actionToken(option),
      frequency: question.gtoFrequencies?.[option.id] || 0,
    }));
    // The product contract requires four meaningful choices except literal
    // Yes/No and Push/Fold decisions. The legacy SIMPLE engine collapses a
    // node to at most three generic actions (for example Check | Bet), which
    // forces the question contract to invent an overlapping exact-size fourth
    // choice. Beginner therefore uses the same legal sizing-band vocabulary as
    // GROUPED, while the UI still controls whether frequencies/EV are exposed.
    const actionMode = engineMode === DIFFICULTY.SIMPLE
      ? DIFFICULTY.GROUPED
      : engineMode;
    const simplified = simplifyActions(enriched, actionMode, potSize);
    if (!simplified?.length) return enforceTrainingQuestionContract(question);

    const idsByToken = {};
    for (const option of enriched) {
      if (!idsByToken[option.action]) idsByToken[option.action] = [];
      idsByToken[option.action].push(option.id);
    }
    const memberIds = (simplifiedOption) => {
      const mapped = (simplifiedOption.mappedFrom || [])
        .map((member) => (typeof member === 'string' ? member : member.id))
        .filter(Boolean);
      if (mapped.length) return mapped;
      if (
        simplifiedOption.isSimplified
        && (simplifiedOption.label === 'Raise' || simplifiedOption.label === 'Bet')
      ) {
        return [
          ...(idsByToken.bet || []),
          ...(idsByToken.raise || []),
          ...(idsByToken.allin || []),
        ];
      }
      return idsByToken[simplifiedOption.action] || [];
    };

    const options = simplified.map((option) => {
      const id = option.id || option.action;
      return {
        id,
        text: option.text || option.label,
        // chooseFour ranks non-answer distractors by solver relevance. Keep
        // the aggregate on the option itself rather than only in the keyed
        // frequency map so >4 grouped nodes are deterministic.
        frequency: memberIds(option).reduce(
          (sum, member) => sum + (question.gtoFrequencies?.[member] || 0),
          0,
        ),
      };
    });
    const originalCorrect = question.correctAnswer;
    const correctOwner = simplified.find((option) => (
      memberIds(option).includes(originalCorrect)
      || option.action === originalCorrect
      || option.id === originalCorrect
    ));
    const correctAnswer = correctOwner
      ? (correctOwner.id || correctOwner.action)
      : originalCorrect;
    if (!options.some((option) => option.id === correctAnswer)) {
      return enforceTrainingQuestionContract(question);
    }

    let gtoFrequencies = question.gtoFrequencies;
    if (question.gtoFrequencies) {
      gtoFrequencies = {};
      for (const option of simplified) {
        const id = option.id || option.action;
        gtoFrequencies[id] = memberIds(option).reduce(
          (sum, member) => sum + (question.gtoFrequencies[member] || 0),
          0,
        );
      }
    }

    const remapEVs = (evs) => {
      if (!evs || typeof evs !== 'object') return evs;
      const mapped = {};
      for (const option of simplified) {
        const id = option.id || option.action;
        const members = memberIds(option).filter((member) => typeof evs[member] === 'number');
        if (!members.length) continue;
        let weighted = 0;
        let totalFrequency = 0;
        let best = -Infinity;
        for (const member of members) {
          const frequency = question.gtoFrequencies?.[member] || 0;
          weighted += evs[member] * frequency;
          totalFrequency += frequency;
          if (evs[member] > best) best = evs[member];
        }
        mapped[id] = Math.round((totalFrequency > 0 ? weighted / totalFrequency : best) * 100) / 100;
      }
      return mapped;
    };

    const actionEVs = remapEVs(question.actionEVs);
    const evData = question.evData
      ? { ...question.evData, actionEVs: remapEVs(question.evData.actionEVs) }
      : question.evData;

    const contracted = enforceTrainingQuestionContract({
      ...question,
      options,
      correctAnswer,
      gtoFrequencies,
      actionEVs,
      evData,
      _originalOptions: question.options,
      _originalCorrect: originalCorrect,
      _originalFrequencies: question.gtoFrequencies,
      _originalActionEVs: question.actionEVs,
      _difficultyApplied: normalizedMode,
      _difficultyMembers: Object.fromEntries(
        simplified.map((option) => [option.id || option.action, memberIds(option)]),
      ),
    });
    // Never present a synthesized zero-frequency sizing bucket as though the
    // solver had actually solved it. If grouping collapses the source below
    // the four-choice contract, serve the original four exact solver actions.
    if (
      contracted.questionContract?.valid !== true
      || contracted.options?.some((option) => option.contractDistractor === true)
    ) {
      const exact = enforceTrainingQuestionContract(question);
      return {
        ...exact,
        _difficultyApplied: normalizedMode,
        _difficultyFallback: 'exact-solver-actions',
        _difficultyMembers: Object.fromEntries(
          (exact.options || []).map((option) => [option.id, [option.id]]),
        ),
      };
    }
    return contracted;
  } catch {
    return enforceTrainingQuestionContract(question);
  }
}
