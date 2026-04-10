/**
 * Poker Brain -- Session Audit & Decision Analysis
 * ==================================================
 * Analyzes a completed session's hand history to evaluate decision quality,
 * identify leaks, and generate improvement recommendations.
 *
 * Works with the hand records from HandStateMachine, which include:
 *   - streetDecisions: { preflop: {...}, flop: {...}, turn: {...}, river: {...} }
 *   - Each decision: { action, raiseAmount, equity, potOdds, confidence, reasoning, at }
 *   - Hand context: position, potAtStart, stackAtStart, gameType, bigBlind
 *
 * Usage:
 *   const audit = analyzeSession(hands);
 *   // audit.grade, audit.leaks, audit.recommendations, audit.handReviews
 */

/**
 * @typedef {object} HandRecord
 * @property {string} handId
 * @property {object} streetDecisions - { preflop: Decision, flop: Decision, ... }
 * @property {string} position
 * @property {string} gameType
 * @property {number} bigBlind
 * @property {Array} holeCards
 * @property {Array} finalBoard
 */

/**
 * Evaluate a single decision at a specific street.
 * Returns a quality score (0-100) and a comment.
 */
function evaluateDecision(decision, street, context) {
  if (!decision) return { score: null, comment: 'No decision recorded' };

  const { action, equity, potOdds, confidence } = decision;
  let score = 50; // baseline
  const comments = [];

  // High equity + aggressive action = good
  if (equity > 65 && (action === 'RAISE' || action === 'CALL')) {
    score += 20;
    comments.push('Strong hand played aggressively');
  }

  // High equity but folded = mistake
  if (equity > 50 && action === 'FOLD') {
    score -= 30;
    comments.push('Folded with positive equity -- potential leak');
  }

  // Low equity but called/raised = speculative or mistake
  if (equity < 30 && action === 'CALL') {
    // Check pot odds
    if (potOdds > 0 && equity > potOdds) {
      score += 10;
      comments.push('Correct pot odds call');
    } else {
      score -= 20;
      comments.push('Called with poor equity and bad pot odds');
    }
  }

  if (equity < 20 && action === 'RAISE') {
    if (street === 'preflop') {
      // Preflop raises with low equity could be positional or bluffs
      score -= 5;
      comments.push('Preflop raise with low equity -- positional play or bluff');
    } else {
      score -= 15;
      comments.push('Raised with very low equity postflop');
    }
  }

  // Confidence-based adjustments
  if (confidence >= 80) {
    score += 5;
  } else if (confidence < 50) {
    score -= 5;
    comments.push('Low confidence decision');
  }

  // Correct fold with bad equity
  if (equity < 25 && action === 'FOLD') {
    score += 15;
    comments.push('Correct fold with poor equity');
  }

  // Pot odds discipline
  if (potOdds > 0 && equity > 0) {
    if (equity >= potOdds && action === 'FOLD') {
      score -= 15;
      comments.push('Folded getting correct pot odds');
    }
    if (equity < potOdds && action === 'CALL') {
      score -= 10;
      comments.push('Called without pot odds');
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    comment: comments.join('; ') || 'Standard play',
    action,
    equity: Math.round(equity || 0),
    potOdds: Math.round(potOdds || 0),
    confidence: Math.round(confidence || 0),
  };
}

/**
 * Analyze a single hand's decision quality across all streets.
 * @param {HandRecord} hand
 * @returns {object} hand review with per-street grades
 */
export function analyzeHand(hand) {
  if (!hand || !hand.streetDecisions) {
    return { handId: hand?.handId, grade: null, streetGrades: {}, comments: ['No decision data'] };
  }

  const context = {
    position: hand.position,
    gameType: hand.gameType,
    bigBlind: hand.bigBlind,
  };

  const streetGrades = {};
  let totalScore = 0;
  let streetCount = 0;

  for (const [street, decision] of Object.entries(hand.streetDecisions)) {
    const evaluation = evaluateDecision(decision, street, context);
    streetGrades[street] = evaluation;
    if (evaluation.score !== null) {
      totalScore += evaluation.score;
      streetCount++;
    }
  }

  const avgScore = streetCount > 0 ? Math.round(totalScore / streetCount) : null;

  // Letter grade
  let grade = 'N/A';
  if (avgScore !== null) {
    if (avgScore >= 85) grade = 'A';
    else if (avgScore >= 70) grade = 'B';
    else if (avgScore >= 55) grade = 'C';
    else if (avgScore >= 40) grade = 'D';
    else grade = 'F';
  }

  // Flag hands with potential mistakes
  const mistakes = [];
  for (const [street, sg] of Object.entries(streetGrades)) {
    if (sg.score !== null && sg.score < 35) {
      mistakes.push({ street, ...sg });
    }
  }

  return {
    handId: hand.handId,
    grade,
    score: avgScore,
    streetGrades,
    mistakes,
    holeCards: hand.holeCards,
    finalBoard: hand.finalBoard,
    position: hand.position,
  };
}

/**
 * Analyze an entire session of hands.
 * @param {HandRecord[]} hands
 * @returns {object} session audit report
 */
export function analyzeSession(hands) {
  if (!hands || hands.length === 0) {
    return {
      grade: 'N/A',
      overallScore: 0,
      totalHands: 0,
      handsAnalyzed: 0,
      handReviews: [],
      leaks: [],
      recommendations: [],
      streetBreakdown: {},
      positionBreakdown: {},
    };
  }

  const handReviews = hands.map(analyzeHand);
  const scored = handReviews.filter(r => r.score !== null);

  // Overall score
  const overallScore = scored.length > 0
    ? Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length)
    : 0;

  // Letter grade
  let grade;
  if (overallScore >= 85) grade = 'A';
  else if (overallScore >= 70) grade = 'B';
  else if (overallScore >= 55) grade = 'C';
  else if (overallScore >= 40) grade = 'D';
  else grade = 'F';

  // Leak detection: aggregate patterns
  const leaks = [];
  const streetScores = { preflop: [], flop: [], turn: [], river: [] };
  const positionScores = {};
  let foldedWithEquity = 0;
  let calledWithoutOdds = 0;
  let totalDecisions = 0;

  for (const review of handReviews) {
    for (const [street, sg] of Object.entries(review.streetGrades)) {
      if (sg.score !== null) {
        if (streetScores[street]) streetScores[street].push(sg.score);
        totalDecisions++;

        if (sg.comment.includes('Folded with positive equity')) foldedWithEquity++;
        if (sg.comment.includes('Called without pot odds')) calledWithoutOdds++;
      }
    }

    if (review.position) {
      if (!positionScores[review.position]) positionScores[review.position] = [];
      if (review.score !== null) positionScores[review.position].push(review.score);
    }
  }

  // Identify specific leaks
  if (foldedWithEquity > 2 && foldedWithEquity / totalDecisions > 0.1) {
    leaks.push({
      type: 'over-folding',
      severity: foldedWithEquity > 5 ? 'high' : 'medium',
      description: `Folded ${foldedWithEquity} times with positive equity (>${Math.round(foldedWithEquity/totalDecisions*100)}% of decisions).`,
      fix: 'Review hand ranges and pot odds before folding. Consider calling more often when getting correct price.',
    });
  }

  if (calledWithoutOdds > 2 && calledWithoutOdds / totalDecisions > 0.1) {
    leaks.push({
      type: 'calling-station',
      severity: calledWithoutOdds > 5 ? 'high' : 'medium',
      description: `Called ${calledWithoutOdds} times without correct pot odds.`,
      fix: 'Tighten calling range. Fold when equity is below pot odds threshold.',
    });
  }

  // Street-specific leak detection
  const streetBreakdown = {};
  for (const [street, scores] of Object.entries(streetScores)) {
    if (scores.length === 0) continue;
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    streetBreakdown[street] = { avgScore: avg, hands: scores.length };

    if (avg < 45 && scores.length >= 3) {
      leaks.push({
        type: `weak-${street}`,
        severity: avg < 30 ? 'high' : 'medium',
        description: `Average ${street} score of ${avg}/100 across ${scores.length} hands.`,
        fix: street === 'preflop'
          ? 'Review opening ranges and 3-bet frequencies for your position.'
          : `Work on ${street} decision-making. Consider bet sizing and equity realization.`,
      });
    }
  }

  // Position-specific analysis
  const positionBreakdown = {};
  for (const [pos, scores] of Object.entries(positionScores)) {
    if (scores.length === 0) continue;
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    positionBreakdown[pos] = { avgScore: avg, hands: scores.length };

    if (avg < 40 && scores.length >= 3) {
      leaks.push({
        type: `positional-leak-${pos}`,
        severity: 'medium',
        description: `Weak play from ${pos} position (${avg}/100 avg across ${scores.length} hands).`,
        fix: `Review strategy for playing from ${pos}. ${pos === 'early' ? 'Tighten opening range.' : pos === 'bb' ? 'Improve BB defense.' : 'Adjust aggression.'}`,
      });
    }
  }

  // Recommendations
  const recommendations = [];
  if (overallScore >= 80) {
    recommendations.push('Strong session overall. Focus on the few flagged hands to push toward optimal play.');
  } else if (overallScore >= 60) {
    recommendations.push('Solid play with room for improvement. Review the lowest-scored hands and look for patterns.');
  } else {
    recommendations.push('Session had significant decision quality issues. Focus on the identified leaks and review fundamental strategy.');
  }

  if (leaks.some(l => l.type === 'over-folding')) {
    recommendations.push('You are folding too many profitable hands. Practice calculating pot odds in real-time.');
  }
  if (leaks.some(l => l.type === 'calling-station')) {
    recommendations.push('Too many loose calls. Focus on hand reading and folding when the math does not support a call.');
  }

  // Sort hand reviews by score (worst first) for easy review
  const sortedReviews = [...handReviews].sort((a, b) => (a.score || 100) - (b.score || 100));

  return {
    grade,
    overallScore,
    totalHands: hands.length,
    handsAnalyzed: scored.length,
    handReviews: sortedReviews,
    leaks,
    recommendations,
    streetBreakdown,
    positionBreakdown,
  };
}
