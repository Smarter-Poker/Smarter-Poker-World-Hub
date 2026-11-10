const NON_SCORING_TOOLS = new Set(['focus-timer', 'risk-analyzer', 'gto-preloader']);
const VALID_VARIANTS = new Set(['nlh', 'plo4', 'plo5', 'plo6']);
const VALID_STREETS = new Set(['preflop', 'flop', 'turn', 'river']);
const VALID_POSITIONS = new Set(['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB']);

function verifiedCounts(session) {
  const total = Number(session?.hands_played ?? session?.total_questions ?? session?.questions_answered);
  const correct = Number(session?.correct_count ?? session?.questions_correct);
  if (!Number.isFinite(total) || total <= 0) return null;
  if (!Number.isFinite(correct) || correct < 0 || correct > total) return null;
  return { total, correct };
}

function inferVariant({ rawVariant, questionId, gameId, holeCards } = {}) {
  const v = String(rawVariant || '').trim().toLowerCase();
  if (VALID_VARIANTS.has(v)) return v;
  const qid = String(questionId || '').toLowerCase();
  if (qid.includes('plo6')) return 'plo6';
  if (qid.includes('plo5')) return 'plo5';
  if (qid.includes('plo4')) return 'plo4';
  if (Array.isArray(holeCards)) {
    if (holeCards.length === 6) return 'plo6';
    if (holeCards.length === 5) return 'plo5';
    if (holeCards.length === 4) return 'plo4';
  }
  const gid = String(gameId || '').toLowerCase();
  if (['cash-005', 'cash-015', 'mtt-018'].includes(gid)) return 'plo4';
  return 'nlh';
}

function inferStreet({ rawStreet, questionId, gameId } = {}) {
  const st = String(rawStreet || '').trim().toLowerCase();
  if (VALID_STREETS.has(st)) return st;
  const qid = String(questionId || '').toLowerCase();
  if (qid.includes('river')) return 'river';
  if (qid.includes('turn')) return 'turn';
  if (qid.includes('flop') || qid.includes('cbet') || qid.includes('check_raise')) return 'flop';
  if (qid.includes('preflop') || qid.includes('rfi') || qid.includes('bb_defense') || qid.includes('vs3bet')) return 'preflop';
  const gid = String(gameId || '').toLowerCase();
  if (gid.includes('preflop') || gid === 'cash-001' || gid === 'cash-018' || gid === 'mtt-001') return 'preflop';
  if (gid === 'cash-024' || gid === 'mtt-021') return 'turn';
  if (gid === 'cash-012' || gid === 'mtt-024') return 'river';
  return 'flop';
}

function inferPosition({ rawPosition, questionId, gameId } = {}) {
  const pos = String(rawPosition || '').trim().toUpperCase();
  if (VALID_POSITIONS.has(pos)) return pos;
  const qid = String(questionId || '').toLowerCase();
  if (qid.includes('_bb_') || qid.includes('bb_defense')) return 'BB';
  if (qid.includes('_sb_')) return 'SB';
  if (qid.includes('_btn_')) return 'BTN';
  if (qid.includes('_co_')) return 'CO';
  if (qid.includes('_mp_')) return 'MP';
  if (qid.includes('_utg_')) return 'UTG';
  const gid = String(gameId || '').toLowerCase();
  if (gid === 'cash-018' || gid === 'mtt-017') return 'BB';
  return 'BTN';
}

function estimateHandEvLossBb(entry, isCorrect) {
  const explicitEv = Number(entry?.ev_loss ?? entry?.evLoss ?? entry?.handData?.evLoss ?? 0);
  if (Number.isFinite(explicitEv) && explicitEv > 0) {
    return Math.round((explicitEv + Number.EPSILON) * 100) / 100;
  }
  if (isCorrect) return 0;
  const cls = String(entry?.classification ?? entry?.handData?.classification ?? '').toLowerCase();
  if (cls === 'blunder') return 1.25;
  if (cls === 'wrong') return 0.75;
  if (cls === 'inaccuracy') return 0.30;
  return 0.65;
}

function recommendationFor(gameId, area, accuracy, sample) {
  const evidence = `${area} is ${Math.round(accuracy)}% across ${sample} verified decisions.`;
  if (gameId.includes('preflop')) {
    return {
      category: 'Preflop',
      recommendation: `${evidence} Review each incorrect answer's authored or solver-backed explanation, then repeat the module.`,
    };
  }
  if (gameId.includes('icm') || gameId.includes('tournament')) {
    return {
      category: 'ICM / Math',
      recommendation: `${evidence} Recheck the payout, stack, and position context shown with each missed answer before repeating the module.`,
    };
  }
  if (gameId.includes('ev') || gameId.includes('geometry') || gameId.includes('odds')) {
    return {
      category: 'Postflop Math',
      recommendation: `${evidence} Rework the recorded calculation in each missed response, then repeat the module.`,
    };
  }
  if (gameId.includes('short-deck')) {
    return {
      category: 'Variant Rules',
      recommendation: `${evidence} Review the variant-specific explanation attached to each missed answer, then repeat the module.`,
    };
  }
  return {
    category: 'General Tactics',
    recommendation: `${evidence} Review the missed-answer explanations and repeat this module to confirm improvement.`,
  };
}

export function analyzeVerifiedTrainingWeaknesses(sessionsOrOptions, recentAnswersArg = []) {
  let sessions = sessionsOrOptions;
  let recentAnswers = recentAnswersArg;
  if (sessionsOrOptions && !Array.isArray(sessionsOrOptions) && typeof sessionsOrOptions === 'object') {
    sessions = sessionsOrOptions.sessions || [];
    recentAnswers = sessionsOrOptions.recentAnswers || sessionsOrOptions.answers || recentAnswersArg;
  }
  const hasSessions = Array.isArray(sessions) && sessions.length > 0;
  const hasAnswers = Array.isArray(recentAnswers) && recentAnswers.length > 0;
  if (!hasSessions && !hasAnswers) return null;

  let totalHands = 0;
  let totalCorrect = 0;
  const gameAccuracy = {};
  const spotBuckets = {};

  const recordSpotDecision = ({
    gameId,
    variant,
    street,
    position,
    isCorrect,
    evLossBb,
    countWeight = 1,
    correctWeight = isCorrect ? 1 : 0,
  }) => {
    const key = `${gameId}|${variant}|${street}|${position}`;
    if (!spotBuckets[key]) {
      spotBuckets[key] = {
        gameId,
        variant,
        street,
        position,
        total: 0,
        correct: 0,
        evLossBb: 0,
      };
    }
    spotBuckets[key].total += countWeight;
    spotBuckets[key].correct += correctWeight;
    spotBuckets[key].evLossBb = Math.round((spotBuckets[key].evLossBb + (Number(evLossBb) || 0)) * 100) / 100;
  };

  if (hasSessions) {
    for (const session of sessions) {
      const counts = verifiedCounts(session);
      if (!counts) continue;
      totalHands += counts.total;
      totalCorrect += counts.correct;

      const gameId = String(session?.game_id || session?.gameId || '').trim();
      if (!gameId || NON_SCORING_TOOLS.has(gameId)) continue;
      if (!gameAccuracy[gameId]) gameAccuracy[gameId] = { total: 0, correct: 0, evLossBb: 0 };
      gameAccuracy[gameId].total += counts.total;
      gameAccuracy[gameId].correct += counts.correct;
      const sessEvLoss = Number(session?.total_ev_loss ?? 0);
      const fallbackSessEvLoss = Number.isFinite(sessEvLoss) && sessEvLoss > 0
        ? sessEvLoss
        : Math.max(0, counts.total - counts.correct) * 0.65;
      gameAccuracy[gameId].evLossBb = Math.round((gameAccuracy[gameId].evLossBb + fallbackSessEvLoss) * 100) / 100;

      const cfg = session?.trainer_config && typeof session.trainer_config === 'object'
        ? session.trainer_config
        : {};
      const handHistory = Array.isArray(session?.hand_history) ? session.hand_history : [];

      if (handHistory.length > 0 && !hasAnswers) {
        for (const rawHand of handHistory) {
          const h = rawHand?.handData && typeof rawHand.handData === 'object' ? rawHand.handData : rawHand;
          const isCorrect = Boolean(
            h?.isCorrect ?? h?.is_correct ?? (String(h?.classification || '').toLowerCase() === 'best' || String(h?.classification || '').toLowerCase() === 'correct')
          );
          const variant = inferVariant({
            rawVariant: h?.variant || cfg?.variant,
            questionId: h?.questionId || h?.question_id || h?.id,
            gameId,
            holeCards: h?.heroCards || h?.holeCards,
          });
          const street = inferStreet({
            rawStreet: h?.street || cfg?.targetStreet || cfg?.street,
            questionId: h?.questionId || h?.question_id || h?.id,
            gameId,
          });
          const position = inferPosition({
            rawPosition: h?.heroPosition || h?.hero_position || h?.position || cfg?.position || (Array.isArray(cfg?.targetPositions) ? cfg.targetPositions[0] : cfg?.targetPositions),
            questionId: h?.questionId || h?.question_id || h?.id,
            gameId,
          });
          const evLossBb = estimateHandEvLossBb(h, isCorrect);
          recordSpotDecision({ gameId, variant, street, position, isCorrect, evLossBb });
        }
      } else if (!hasAnswers) {
        const variant = inferVariant({ rawVariant: cfg?.variant, gameId });
        const street = inferStreet({ rawStreet: cfg?.targetStreet || cfg?.street, gameId });
        const posStats = session?.position_stats && typeof session.position_stats === 'object'
          ? session.position_stats
          : null;
        if (posStats && Object.keys(posStats).length > 0) {
          for (const [posKey, pVal] of Object.entries(posStats)) {
            const pTotal = Number(pVal?.total ?? pVal?.played ?? 0);
            const pCorrect = Number(pVal?.correct ?? pVal?.won ?? 0);
            if (!Number.isFinite(pTotal) || pTotal <= 0) continue;
            const position = inferPosition({ rawPosition: posKey, gameId });
            const pMistakes = Math.max(0, pTotal - pCorrect);
            const pEvLoss = Number.isFinite(Number(pVal?.evLoss)) && Number(pVal.evLoss) > 0
              ? Number(pVal.evLoss)
              : pMistakes * 0.65;
            recordSpotDecision({
              gameId,
              variant,
              street,
              position,
              isCorrect: pMistakes === 0,
              evLossBb: pEvLoss,
              countWeight: pTotal,
              correctWeight: pCorrect,
            });
          }
        } else {
          const position = inferPosition({
            rawPosition: cfg?.position || (Array.isArray(cfg?.targetPositions) ? cfg.targetPositions[0] : cfg?.targetPositions),
            gameId,
          });
          recordSpotDecision({
            gameId,
            variant,
            street,
            position,
            isCorrect: counts.correct === counts.total,
            evLossBb: fallbackSessEvLoss,
            countWeight: counts.total,
            correctWeight: counts.correct,
          });
        }
      }
    }
  }

  if (hasAnswers) {
    for (const ans of recentAnswers) {
      const gameId = String(ans?.game_id || ans?.gameId || 'cash-001').trim();
      if (!gameId || NON_SCORING_TOOLS.has(gameId)) continue;
      const isCorrect = Boolean(ans?.is_correct ?? ans?.isCorrect);
      const variant = inferVariant({
        rawVariant: ans?.variant,
        questionId: ans?.question_id || ans?.questionId,
        gameId,
      });
      const street = inferStreet({
        rawStreet: ans?.street,
        questionId: ans?.question_id || ans?.questionId,
        gameId,
      });
      const position = inferPosition({
        rawPosition: ans?.hero_position || ans?.heroPosition || ans?.position,
        questionId: ans?.question_id || ans?.questionId,
        gameId,
      });
      const evLossBb = estimateHandEvLossBb(ans, isCorrect);
      recordSpotDecision({ gameId, variant, street, position, isCorrect, evLossBb });

      if (totalHands === 0 || !hasSessions) {
        // Also populate gameAccuracy if no completed 25-hand session rows existed yet
      }
    }
    if (Object.keys(gameAccuracy).length === 0) {
      for (const ans of recentAnswers) {
        const gameId = String(ans?.game_id || ans?.gameId || 'cash-001').trim();
        if (!gameId || NON_SCORING_TOOLS.has(gameId)) continue;
        const isCorrect = Boolean(ans?.is_correct ?? ans?.isCorrect);
        const evLossBb = estimateHandEvLossBb(ans, isCorrect);
        totalHands += 1;
        if (isCorrect) totalCorrect += 1;
        if (!gameAccuracy[gameId]) gameAccuracy[gameId] = { total: 0, correct: 0, evLossBb: 0 };
        gameAccuracy[gameId].total += 1;
        if (isCorrect) gameAccuracy[gameId].correct += 1;
        gameAccuracy[gameId].evLossBb = Math.round((gameAccuracy[gameId].evLossBb + evLossBb) * 100) / 100;
      }
    }
  }

  const spotLeaks = Object.values(spotBuckets)
    .filter((b) => b.total >= 3 && (b.correct / b.total) * 100 <= 85)
    .map((b, idx) => {
      const accuracy = (b.correct / b.total) * 100;
      const area = `${b.variant.toUpperCase()} · ${b.position} · ${b.street.charAt(0).toUpperCase() + b.street.slice(1)}`;
      const { category, recommendation } = recommendationFor(b.gameId, area, accuracy, b.total);
      return {
        id: idx + 1,
        cat: category,
        area,
        acc: Math.round(accuracy),
        sample: b.total,
        sampleCount: b.total,
        correct: b.correct,
        mistakes: Math.max(0, b.total - b.correct),
        evLossBb: b.evLossBb,
        avgEvLossBb: Number((b.evLossBb / b.total).toFixed(2)),
        tip: recommendation,
        sev: accuracy < 65 || b.evLossBb >= 2.0 ? 'High' : 'Medium',
        gameId: b.gameId,
        variant: b.variant,
        street: b.street,
        position: b.position,
        basis: 'verified-history',
      };
    })
    .sort((a, b) => (b.evLossBb - a.evLossBb) || (a.acc - b.acc) || (b.sample - a.sample));

  const leaks = Object.entries(gameAccuracy).flatMap(([gameId, counts], index) => {
    if (counts.total < 3) return [];
    const accuracy = (counts.correct / counts.total) * 100;
    if (accuracy > 85) return [];
    const area = gameId.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
    const { category, recommendation } = recommendationFor(gameId, area, accuracy, counts.total);
    const matchingSpot = spotLeaks.find((s) => s.gameId === gameId) || null;
    return [{
      id: index + 1,
      cat: category,
      area,
      acc: Math.round(accuracy),
      sample: counts.total,
      evLossBb: matchingSpot ? matchingSpot.evLossBb : counts.evLossBb,
      tip: recommendation,
      sev: accuracy < 65 ? 'High' : 'Medium',
      gameId,
      variant: matchingSpot ? matchingSpot.variant : inferVariant({ gameId }),
      street: matchingSpot ? matchingSpot.street : inferStreet({ gameId }),
      position: matchingSpot ? matchingSpot.position : inferPosition({ gameId }),
      basis: 'verified-history',
    }];
  }).sort((a, b) => a.acc - b.acc);

  const topSpotLeak = spotLeaks[0] || leaks[0] || null;

  return {
    overallAcc: totalHands > 0 ? (totalCorrect / totalHands) * 100 : null,
    totalHands,
    leaks,
    spotLeaks,
    topSpotLeak,
  };
}
