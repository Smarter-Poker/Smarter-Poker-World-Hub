/**
 * GET /api/training/next-street
 * Fetches the next street question for multi-street hand progression.
 * Uses the DeterministicGTOEngine to query solver data for turn/river.
 *
 * Query params:
 * - gameId: Game identifier
 * - heroHand: Hero's hand notation (e.g., 'AKs')
 * - boardCards: Current board cards (comma-separated, e.g., '3h,7c,7s,9d')
 * - street: Street to query ('turn' or 'river')
 * - pot: Current pot size in BB
 * - stackDepth: Stack depth in BB
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { deterministicEngine } from '../../../src/engines/DeterministicGTOEngine';
import { pioQueryService } from '../../../src/services/PIOQueryService';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    // Auth
    const _token = req.headers.authorization?.replace('Bearer ', '');
    if (!_token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
    if (_authErr || !_authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { gameId, heroHand, boardCards, street, pot, stackDepth, heroPosition, villainPosition } = req.query;

    if (!gameId || !street || !boardCards) {
        return res.status(400).json({ success: false, error: 'gameId, street, and boardCards are required' });
    }

    try {
        // Parse board cards from comma-separated string
        const parsedBoardCards = boardCards.split(',').map(c => c.trim()).filter(Boolean);

        // Get PIO game config
        const gameConfig = pioQueryService.getGameConfig(gameId);
        if (!gameConfig) {
            return res.status(404).json({ success: false, error: 'Game config not found' });
        }

        // Deal a new card for the next street
        const SUITS = ['s', 'h', 'd', 'c'];
        const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
        const deadCards = new Set([...parsedBoardCards.map(c => c.toLowerCase())]);
        // Add hero hand cards to dead cards
        if (heroHand && heroHand.length >= 2) {
            const r1 = heroHand[0], r2 = heroHand[1];
            const suffix = heroHand.length >= 3 ? heroHand[2] : '';
            if (r1 === r2) { deadCards.add(`${r1}h`); deadCards.add(`${r2}s`); }
            else if (suffix === 's') { deadCards.add(`${r1}s`); deadCards.add(`${r2}s`); }
            else { deadCards.add(`${r1}s`); deadCards.add(`${r2}h`); }
        }

        // Deal new card
        const allCards = [];
        for (const r of RANKS) {
            for (const s of SUITS) {
                if (!deadCards.has((r + s).toLowerCase())) {
                    allCards.push(r + s);
                }
            }
        }
        const newCard = allCards[Math.floor(Math.random() * allCards.length)];
        const newBoardCards = [...parsedBoardCards, newCard];

        // Query solver for this street
        const question = await deterministicEngine.queryNextStreet({
            gameConfig,
            heroHand: heroHand || 'AKs',
            boardCards: newBoardCards,
            street,
            pot: parseFloat(pot) || 6,
            stackDepth: parseInt(stackDepth) || 100,
            heroPosition: heroPosition || 'BTN',
            villainPosition: villainPosition || 'BB',
        });

        if (question) {
            // Attach the new card dealt
            question.scenario = {
                ...question.scenario,
                board: newBoardCards.join(' '),
                isMultiStreet: true,
            };

            return res.status(200).json({
                success: true,
                question,
                newCard,
                boardCards: newBoardCards,
                street,
            });
        }

        // No solver data for next street
        return res.status(200).json({
            success: false,
            error: 'No solver data available for next street',
            boardCards: newBoardCards,
            newCard,
        });

    } catch (err) {
        console.error('[NextStreet] Error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
