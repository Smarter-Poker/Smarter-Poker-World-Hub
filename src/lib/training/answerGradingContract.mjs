import { gradeSolverDecision } from './solverDecisionEvidence.js';
import {
  applyDifficultyToQuestion,
  normalizeTrainingDifficultyMode,
} from './difficultyQuestionContract.mjs';
import {
  gradeRngAdherence,
  normalizeRngMode,
  resolveRngTarget,
} from './rngDecisionContract.mjs';

export class TrainingAnswerContractError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'TrainingAnswerContractError';
    this.code = code;
  }
}

function sameId(left, right) {
  return String(left || '').toLowerCase() === String(right || '').toLowerCase();
}

/**
 * Grade exactly the question shape that the selected difficulty serves.
 * Browser-supplied correctness, classification and RNG targets are never
 * authoritative: the API derives all three from its sealed canonical row.
 */
export function gradeTrainingAnswer({
  canonicalQuestion,
  selectedAnswer,
  difficultyMode,
  rng = null,
}) {
  const normalizedDifficulty = normalizeTrainingDifficultyMode(difficultyMode);
  const servedQuestion = applyDifficultyToQuestion(canonicalQuestion, normalizedDifficulty);
  const selectedOption = (servedQuestion?.options || []).find((option) => (
    sameId(option?.id ?? option, selectedAnswer)
  ));
  if (!selectedOption) {
    throw new TrainingAnswerContractError(
      'The selected answer is not part of the server-canonical question.',
      'TRAINING_ANSWER_NOT_CANONICAL',
    );
  }

  const canonicalGrade = gradeSolverDecision(servedQuestion, String(selectedAnswer));
  let effectiveGrade = canonicalGrade;
  let rngEvidence = null;

  if (rng && typeof rng === 'object') {
    if (canonicalGrade.solverVerified !== true) {
      throw new TrainingAnswerContractError(
        'Randomizer grading requires a provenance-verified solver distribution.',
        'TRAINING_RNG_REQUIRES_VERIFIED_SOLVER',
      );
    }
    const roll = Number(rng.roll);
    const mode = normalizeRngMode(rng.mode);
    if (!Number.isInteger(roll) || roll < 1 || roll > 100 || !mode) {
      throw new TrainingAnswerContractError(
        'Randomizer evidence must include a roll from 1 to 100 and a valid mode.',
        'TRAINING_RNG_INVALID',
      );
    }
    const target = resolveRngTarget(
      servedQuestion.options,
      servedQuestion.gtoFrequencies,
      roll,
      mode,
    );
    if (!target) {
      throw new TrainingAnswerContractError(
        'Randomizer roll does not resolve to a server-derived solver band.',
        'TRAINING_RNG_TARGET_UNAVAILABLE',
      );
    }
    const adherence = gradeRngAdherence(selectedAnswer, target);
    effectiveGrade = {
      ...canonicalGrade,
      isCorrect: adherence.isCorrect,
      classification: adherence.classification,
    };
    rngEvidence = {
      roll,
      mode,
      targetActionId: target.id,
      targetActionText: target.text,
    };
  }

  return {
    servedQuestion,
    difficultyMode: normalizedDifficulty,
    difficultyMembers: servedQuestion?._difficultyMembers || null,
    gradeMode: rngEvidence ? 'rng-adherence' : 'solver-decision',
    grade: effectiveGrade,
    canonicalSolverGrade: canonicalGrade,
    rng: rngEvidence,
  };
}
