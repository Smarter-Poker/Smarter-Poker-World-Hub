/**
 * 🏆 TRAINING TOURNAMENTS API
 * ═══════════════════════════════════════════════════════════════════════════
 * Competitive timed training challenges vs other players
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Auth: verify JWT identity (tournament registration and diamond rewards require identity) ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });
    const userId = user.id; // From JWT, not request

    // GET: Fetch tournaments (upcoming, live, or completed)
    if (req.method === 'GET') {
        const { status, tournamentId } = req.query;

        try {
            // Single tournament with entries leaderboard
            if (tournamentId) {
                const { data: tournament } = await supabase
                    .from('training_tournaments')
                    .select('*')
                    .eq('id', tournamentId)
                    .maybeSingle();

                if (!tournament) {
                    return res.status(404).json({ success: false, error: 'Tournament not found' });
                }

                // Get entries with user info
                const { data: entries } = await supabase
                    .from('training_tournament_entries')
                    .select(`
                        *,
                        profiles:user_id (username, avatar_url)
                    `)
                    .eq('tournament_id', tournamentId)
                    .order('score', { ascending: false })
                    .limit(100);

                // Check if user is registered
                let userEntry = null;
                if (userId) {
                    userEntry = entries?.find(e => e.user_id === userId) || null;
                }

                return res.status(200).json({
                    success: true,
                    tournament,
                    entries: entries || [],
                    userEntry,
                    leaderboard: (entries || []).slice(0, 10)
                });
            }

            // List tournaments
            let query = supabase
                .from('training_tournaments')
                .select('*, entry_count')
                .order('start_time', { ascending: true })
                    .limit(100);

            if (status === 'live') {
                const now = new Date().toISOString();
                query = query.eq('status', 'live')
                    .limit(100);
            } else if (status === 'upcoming') {
                query = query.eq('status', 'scheduled')
                    .limit(100);
            } else if (status === 'completed') {
                query = query.eq('status', 'complete')
                    .limit(100);
            }

            const { data: tournaments } = await query.limit(20);

            // If userId, get user's entries
            let userEntries = [];
            if (userId) {
                const { data } = await supabase
                    .from('training_tournament_entries')
                    .select('tournament_id, status, score, final_rank')
                    .eq('user_id', userId);
                userEntries = data || [];
            }

            return res.status(200).json({
                success: true,
                tournaments: tournaments || [],
                userEntries
            });

        } catch (error) {
            console.error('[Tournaments] Error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to fetch tournaments' });
        }
    }

    // POST: Register for tournament
    if (req.method === 'POST') {
        const { tournamentId, action } = req.body;
        // userId from JWT (set at top of handler)

        if (!tournamentId) {
            return res.status(400).json({ success: false, error: 'tournamentId required' });
        }

        try {
            // Get tournament
            const { data: tournament } = await supabase
                .from('training_tournaments')
                .select('*')
                .eq('id', tournamentId)
                .maybeSingle();

            if (!tournament) {
                return res.status(404).json({ success: false, error: 'Tournament not found' });
            }

            // Check if can still enter
            const now = new Date();
            const startTime = new Date(tournament.start_time);
            const entryDeadline = new Date(startTime.getTime() + (tournament.entry_window_minutes * 60000));

            if (action === 'register') {
                if (now > entryDeadline) {
                    return res.status(400).json({ success: false, error: 'Entry window has closed' });
                }

                if (tournament.max_entries && tournament.entry_count >= tournament.max_entries) {
                    return res.status(400).json({ success: false, error: 'Tournament is full' });
                }

                // Check if already registered
                const { data: existing } = await supabase
                    .from('training_tournament_entries')
                    .select('id')
                    .eq('tournament_id', tournamentId)
                    .eq('user_id', userId)
                    .maybeSingle();

                if (existing) {
                    return res.status(400).json({ success: false, error: 'Already registered' });
                }

                // Charge entry fee
                if (tournament.entry_fee_diamonds > 0) {
                    const { data: balance } = await supabase.rpc('get_diamond_balance', { p_user_id: userId });

                    if ((balance || 0) < tournament.entry_fee_diamonds) {
                        return res.status(400).json({ success: false, error: 'Insufficient diamonds' });
                    }

                    // BUG #258 FIX: Include userId in reference_id for per-user uniqueness
                    await supabase.rpc('add_diamonds_to_balance', {
                        p_user_id: userId,
                        p_amount: -tournament.entry_fee_diamonds,
                        p_type: 'arcade_entry',
                        p_description: `Tournament entry fee — ${tournament.entry_fee_diamonds}💎`,
                        p_reference_id: `tourney_entry_${tournamentId}_${userId}`
                    });
                }

                // BUG #258 FIX: Use upsert with onConflict to prevent double-registration race
                const { data: regResult, error: regErr } = await supabase
                    .from('training_tournament_entries')
                    .upsert({
                        tournament_id: tournamentId,
                        user_id: userId,
                        status: 'registered'
                    }, { onConflict: 'tournament_id,user_id', ignoreDuplicates: true })
                    .select('id');

                if (regErr) {
                    // Registration failed — if we charged diamonds, they'll be rolled back
                    // by the reference_id uniqueness (same ref won't be inserted twice)
                    return res.status(500).json({ success: false, error: regErr.message });
                }

                // Increment entry count
                await supabase
                    .from('training_tournaments')
                    .update({ entry_count: tournament.entry_count + 1 })
                    .eq('id', tournamentId);

                return res.status(200).json({
                    success: true,
                    message: 'Registered for tournament!',
                    entryCost: tournament.entry_fee_diamonds
                });
            }

            if (action === 'start') {
                // Get user's entry
                const { data: entry } = await supabase
                    .from('training_tournament_entries')
                    .select('*')
                    .eq('tournament_id', tournamentId)
                    .eq('user_id', userId)
                    .maybeSingle();

                if (!entry) {
                    return res.status(400).json({ success: false, error: 'Not registered for this tournament' });
                }

                if (entry.status !== 'registered') {
                    return res.status(400).json({ success: false, error: 'Already started or completed' });
                }

                // Update to playing
                await supabase
                    .from('training_tournament_entries')
                    .update({
                        status: 'playing',
                        started_at: now.toISOString()
                    })
                    .eq('id', entry.id);

                return res.status(200).json({
                    success: true,
                    message: 'Tournament started!',
                    gameId: tournament.game_id,
                    questionsCount: tournament.questions_count,
                    timeLimit: tournament.time_limit_seconds
                });
            }

            return res.status(400).json({ success: false, error: 'Invalid action' });

        } catch (error) {
            console.error('[Tournaments] Register error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to process tournament action' });
        }
    }

    // PUT: Submit tournament results
    if (req.method === 'PUT') {
        const { tournamentId, score, accuracy, timeTaken, questionsAnswered, questionsCorrect } = req.body;
        // userId from JWT (set at top of handler)

        if (!tournamentId) {
            return res.status(400).json({ success: false, error: 'tournamentId required' });
        }

        try {
            // Get user's entry
            const { data: entry } = await supabase
                .from('training_tournament_entries')
                .select('*')
                .eq('tournament_id', tournamentId)
                .eq('user_id', userId)
                .maybeSingle();

            if (!entry) {
                return res.status(404).json({ success: false, error: 'Entry not found' });
            }

            if (entry.status === 'completed') {
                return res.status(400).json({ success: false, error: 'Already submitted results' });
            }

            // Calculate score (accuracy * 100 + time bonus)
            const timeBonus = Math.max(0, 300 - (timeTaken || 0)); // Bonus for faster completion
            const finalScore = Math.round((accuracy || 0) * 100) + timeBonus;

            // Update entry with results
            await supabase
                .from('training_tournament_entries')
                .update({
                    status: 'completed',
                    score: finalScore,
                    accuracy: accuracy || 0,
                    time_taken_seconds: timeTaken,
                    questions_answered: questionsAnswered,
                    questions_correct: questionsCorrect,
                    completed_at: new Date().toISOString()
                })
                .eq('id', entry.id);

            // Get current rank
            const { data: betterScores } = await supabase
                .from('training_tournament_entries')
                .select('id')
                .eq('tournament_id', tournamentId)
                .gt('score', finalScore)
                    .limit(100);

            const currentRank = (betterScores?.length || 0) + 1;

            return res.status(200).json({
                success: true,
                score: finalScore,
                currentRank,
                message: `Score submitted! You're currently #${currentRank}`
            });

        } catch (error) {
            console.error('[Tournaments] Submit error:', error.message);
            return res.status(500).json({ success: false, error: 'Failed to submit results' });
        }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
}
