// @@PUB_REGION_01@@
        // IMP-1 FIX: Filter out scenarios that generated questions the user already saw
        const safeSeenIds = Array.isArray(seenIds) ? seenIds : [];
        let pool = scenarios;
// @@PUB_REGION_02@@
        // ═══ Phase 76: DYNAMIC EXPLANATION DEPTH ═══
        const explanationDepth = this._getExplanationDepth(street, handStrength, optimalAction, ctx.nodeType, ctx.spotType);
        const coachingNote = this._getDepthCoachingNote(explanationDepth, street, handStrength, optimalAction);
// @@PUB_REGION_03@@
                }
            }
        }
// @@PUB_REGION_04@@
            if (street === 'river') {
                if (texture.flushy || texture.monotone) return `At the bluff-catching threshold on a flushy river board. Missed flush draws are a large part of villain's bluffing range — calling just enough to prevent them from auto-profiting with bluffs.`;
                return `At the exact bluff-catching threshold on the river. Calling too much lets villain profit by over-bluffing; folding too much lets villain steal pots unchallenged. The solver calls just enough to keep villain indifferent.`;
// @@PUB_REGION_05@@
            parts.push('Turn cards to watch:');
        } else {
            parts.push('River cards to watch:');
// @@PUB_REGION_06@@
                accuracy: 1 - (v.mistakes / v.total),
            }))
            .sort((a, b) => b.mistakeRate - a.mistakeRate);
// @@PUB_REGION_07@@
    /**
     * Phase 110: Explain probe bets — when you bet into the PFR after they
     * checked the previous street.
// @@PUB_REGION_08@@
    /**
     * Phase 138: How well does each player's range interact with this board?
     */
// @@PUB_REGION_09@@
    /**
     * Phase 167: Explain the concept of node locking for exploitative play.
     */
// @@PUB_ZONE_Q1@@
        const alts = Object.entries(handActions || {}).filter(([a, f]) => f > 0.1 && a !== correctAction).sort((a, b) => b[1] - a[1]);
        for (const [a, f] of alts.slice(0, 2)) {
            analysis.alternativeLines.push({ action: this._actionLabel(a), frequency: (f * 100).toFixed(0) + '%' });
// @@PUB_ZONE_Q2@@
                    desc: `Ready to learn ${nextConcept.concept.replace(/_/g, ' ')}`,
                    filters: { nodeTypes: [nextConcept.concept] },
                    priority: 'NORMAL',
// @@PUB_ZONE_Q3@@
            river_play: [
                { front: 'Why is river play the most important street?', back: 'The pot is largest on the river, so mistakes are most expensive. EV loss from a single bad river call can exceed all other street mistakes combined.' },
                { front: 'What is a bluff-catcher?', back: 'A hand that beats all bluffs but loses to all value bets. On the river, you must decide if opponent is value-betting or bluffing.' },
// @@PUB_ZONE_Q4@@
            const curr = recent.slice(i - 2, i + 1).filter(Boolean).length / 3;
            if (curr > prev) improving++;
            else if (curr < prev) declining++;
// @@PUB_ZONE_Q5@@
        const handsWithFreqs = this._sessionStats.history.filter(h => h.frequencies && Object.keys(h.frequencies || {}).length >= 2);
        if (handsWithFreqs.length === 0) return null;
        const hand = handsWithFreqs[Math.floor(Math.random() * handsWithFreqs.length)];
// @@PUB_ZONE_Q6@@
                else mediumBets++;
            }
        });
// @@PUB_REGION_15@@
    getGTOComplianceScore() {
        if (!this._sessionStats?.history || this._sessionStats.history.length < 5) return null;
        const history = this._sessionStats.history;
// @@PUB_REGION_16@@
