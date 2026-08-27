import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { calculateNewELO, DEFAULT_ELO, getRankTitle } from '../../../src/lib/memoryElo';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { reportApiError } from '../../../src/lib/sentryWrap';

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        _supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
        );
    }
    return _supabase;
}

function finiteNumber(value, min, max) {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

export default async function handler(req, res) {
    try {
        const limit = req.method === 'GET' ? LIMITS.read : LIMITS.write;
        if (!applyRateLimit(req, res, limit)) return;

        if (!['GET', 'POST'].includes(req.method)) {
            return res.status(405).json({ success: false, error: 'Method not allowed' });
        }

        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

        const supabase = getSupabase();
        const { user, error: authError } = await getServerUserWithFallback(req, supabase);
        if (authError || !user) {
            return res.status(401).json({ success: false, error: 'Invalid token' });
        }

        const { data: profile, error: readError } = await supabase
            .from('profiles')
            .select('memory_elo')
            .eq('id', user.id)
            .maybeSingle();

        if (readError) throw readError;
        const currentELO = Number.isFinite(profile?.memory_elo) ? profile.memory_elo : DEFAULT_ELO;

        if (req.method === 'GET') {
            res.setHeader('Cache-Control', 'private, max-age=15');
            return res.status(200).json({ success: true, elo: currentELO, rank: getRankTitle(currentELO) });
        }

        if (JSON.stringify(req.body || {}).length > 2048) {
            return res.status(413).json({ success: false, error: 'Request body too large' });
        }

        const level = finiteNumber(req.body?.level, 1, 10);
        const accuracy = finiteNumber(req.body?.accuracy, 0, 100);
        const gamesPlayed = finiteNumber(req.body?.gamesPlayed, 0, 1000000);
        if (level === null || accuracy === null || gamesPlayed === null) {
            return res.status(400).json({ success: false, error: 'Invalid ELO result data' });
        }

        const result = calculateNewELO(currentELO, level, accuracy, gamesPlayed);
        const { error: updateError } = await supabase
            .from('profiles')
            .update({ memory_elo: result.newELO })
            .eq('id', user.id);

        if (updateError) throw updateError;

        return res.status(200).json({
            success: true,
            result: { ...result, rank: getRankTitle(result.newELO) },
        });
    } catch (error) {
        reportApiError(error, { route: 'memory/elo' });
        return res.status(500).json({ success: false, error: 'Unable to update ELO' });
    }
}
