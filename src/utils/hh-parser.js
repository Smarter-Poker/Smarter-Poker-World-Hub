/**
 * Hand History Parser (W8-1)
 * Extracts key Sandbox context (Hero Cards, Board, Pot, Villains) from raw text hand histories
 * Supports basic PokerStars and Ignition formats.
 */

export function parseHandHistory(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;

    const result = {
        heroHand: { card1: null, card2: null },
        board: { flop: [], turn: null, river: null },
        potSize: 0,
        villains: [],
        heroPosition: 'UNK',
        heroStack: 100,
        success: false,
        error: null
    };

    try {
        const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        let heroName = 'Hero';

        // 1. Find Hero Cards
        const dealtMatch = rawText.match(/Dealt to (.*?) \[([2-9TJQKA][shdc]) ([2-9TJQKA][shdc])\]/i);
        if (dealtMatch) {
            heroName = dealtMatch[1].trim();
            result.heroHand.card1 = dealtMatch[2];
            result.heroHand.card2 = dealtMatch[3];
        } else {
            // Ignition style
            const ignMatch = rawText.match(/(?:Hero|You) \[(.*?) (.*?)\]/i);
            if (ignMatch) {
                result.heroHand.card1 = ignMatch[1];
                result.heroHand.card2 = ignMatch[2];
            }
        }

        // 2. Find Board Cards
        const flopMatch = rawText.match(/\*\*\* FLOP \*\*\* \[([2-9TJQKA][shdc]) ([2-9TJQKA][shdc]) ([2-9TJQKA][shdc])\]/i) || rawText.match(/Flop: \[([2-9TJQKA][shdc]), ([2-9TJQKA][shdc]), ([2-9TJQKA][shdc])\]/i);
        if (flopMatch) {
            result.board.flop = [flopMatch[1], flopMatch[2], flopMatch[3]];
        }

        const turnMatch = rawText.match(/\*\*\* TURN \*\*\* .*? \[([2-9TJQKA][shdc])\]/i) || rawText.match(/Turn: .*? \[([2-9TJQKA][shdc])\]/i);
        if (turnMatch) {
            result.board.turn = turnMatch[1];
        }

        const riverMatch = rawText.match(/\*\*\* RIVER \*\*\* .*? \[([2-9TJQKA][shdc])\]/i) || rawText.match(/River: .*? \[([2-9TJQKA][shdc])\]/i);
        if (riverMatch) {
            result.board.river = riverMatch[1];
        }

        // 3. Estimate Pot Size (Naive Collect - Look for 'Total pot' or sum bets)
        const potMatch = rawText.match(/Total pot \$?([\d.]+) /i) || rawText.match(/Total Pot: \$?([\d.]+)/i);
        if (potMatch) {
            // Very naive, assumes $1/$2 blinds for BB conversion if we don't know the limits.
            // A better parser would extract limits. For sandbox, we'll rough it to BB if we find limits.
            let bbSize = 2;
            const limitMatch = rawText.match(/\(\$?[\d.]+\/\$?([\d.]+)/);
            if (limitMatch) bbSize = parseFloat(limitMatch[1]);

            result.potSize = parseFloat((parseFloat(potMatch[1]) / bbSize).toFixed(1));
        }

        // 4. Identify Villain (Naive: Just grab the first person who isn't Hero and put them in a generic position)
        const seatMatches = [...rawText.matchAll(/Seat \d+: (.*?) \(/g)];
        seatMatches.forEach(m => {
            const name = m[1].trim();
            if (name !== heroName && result.villains.length < 5) {
                result.villains.push({
                    id: `v_${Date.now()}_${Math.random()}`,
                    position: 'VIL',
                    range: 'GTO Core',
                    nodeLock: 'None',
                    color: '#ef4444'
                });
            }
        });

        // Ensure we have at least one villain if none matched the seat syntax
        if (result.villains.length === 0) {
            result.villains.push({
                id: `v_${Date.now()}`, position: 'VIL', range: 'GTO Core', nodeLock: 'None', color: '#ef4444'
            });
        }

        // Position guesser based on 'button'
        if (rawText.toLowerCase().includes('is the button')) {
            result.heroPosition = 'IP'; // Fallback generic
        }

        result.success = !!(result.heroHand.card1 || result.board.flop.length > 0);
        if (!result.success) result.error = 'Could not parse hole cards or board from text.';

        return result;

    } catch (e) {
        return { success: false, error: e.message };
    }
}
