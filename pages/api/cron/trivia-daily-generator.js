/**
 * DAILY TRIVIA ROTATION — Pool-Based Question Selector
 * Runs at 11:59 PM CST daily via Vercel cron
 * 
 * Selects 20 questions per category from the existing pool for tomorrow.
 * All users see the same 20 questions per category each day.
 * 60-day uniqueness: no question repeats within 60 days.
 * 
 * Total: 20 questions × 10 categories = 200 daily-tagged questions
 */

import { createClient } from '../../../src/lib/supabaseServerClient';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const QUESTIONS_PER_CATEGORY = 20;

// All 10 trivia categories
const CATEGORIES = [
    'poker_history',
    'famous_hands',
    'player_profiles',
    'rule_knowledge',
    'tournament_facts',
    'gto_theory',
    'mtt_situations',
    'cash_game_situations',
    'icm_chip_ev',
    'gto_scenarios'
];

// ═══════════════════════════════════════════════════════════════════════════
// DATE UTILITIES (CST)
// ═══════════════════════════════════════════════════════════════════════════

function getTomorrowCST() {
    const now = new Date();
    const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    cst.setDate(cst.getDate() + 1);
    const year = cst.getFullYear();
    const month = String(cst.getMonth() + 1).padStart(2, '0');
    const day = String(cst.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getSixtyDaysAgoCST() {
    const now = new Date();
    const cst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    cst.setDate(cst.getDate() - 60);
    const year = cst.getFullYear();
    const month = String(cst.getMonth() + 1).padStart(2, '0');
    const day = String(cst.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FISHER-YATES SHUFFLE
// ═══════════════════════════════════════════════════════════════════════════

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECT DAILY QUESTIONS FOR ONE CATEGORY
// ═══════════════════════════════════════════════════════════════════════════

async function selectDailyForCategory(category, targetDate, sixtyDaysAgo) {
    // Step 1: Get questions that haven't been used in the last 60 days
    // (daily_date is NULL or older than the 60-day window)
    const { data: freshQuestions, error: freshError } = await supabase
        .from('trivia_questions')
        .select('id')
        .eq('category', category)
        .or(`daily_date.is.null,daily_date.lt.${sixtyDaysAgo}`)
        .limit(500);

    if (freshError) {
        console.error(`[Rotation] Error fetching fresh questions for ${category}:`, freshError.message);
        return { selected: 0, recycled: false };
    }

    let pool = freshQuestions || [];
    let recycled = false;

    // Step 2: If not enough fresh questions, recycle from oldest-used
    if (pool.length < QUESTIONS_PER_CATEGORY) {

        const { data: allQuestions, error: allError } = await supabase
            .from('trivia_questions')
            .select('id')
            .eq('category', category)
            .neq('daily_date', targetDate) // Don't re-select already tagged for this date
            .order('daily_date', { ascending: true, nullsFirst: true })
            .limit(500);

        if (!allError && allQuestions) {
            pool = allQuestions;
            recycled = true;
        }
    }

    // Step 3: Shuffle and pick 20
    const selected = shuffleArray(pool).slice(0, QUESTIONS_PER_CATEGORY);
    const selectedIds = selected.map(q => q.id);

    if (selectedIds.length === 0) {
        console.error(`[Rotation] ${category}: No questions available!`);
        return { selected: 0, recycled };
    }

    // Step 4: Tag selected questions with tomorrow's date
    const { error: updateError } = await supabase
        .from('trivia_questions')
        .update({ daily_date: targetDate })
        .in('id', selectedIds);

    if (updateError) {
        console.error(`[Rotation] ${category}: Failed to tag questions:`, updateError.message);
        return { selected: 0, recycled };
    }

    return { selected: selectedIds.length, recycled };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════

export default async function handler(req, res) {
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    if (cronSecret !== process.env.CRON_SECRET && process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const targetDate = getTomorrowCST();
    const sixtyDaysAgo = getSixtyDaysAgoCST();


    const results = {
        date: targetDate,
        categorySummary: {},
        totalSelected: 0,
        totalRecycled: 0
    };

    try {
        // Check if questions are already tagged for this date
        const { count: existingCount } = await supabase
            .from('trivia_questions')
            .select('*', { count: 'exact', head: true })
            .eq('daily_date', targetDate)
                .limit(100);

        if (existingCount >= QUESTIONS_PER_CATEGORY * CATEGORIES.length) {
            return res.status(200).json({
                success: true,
                message: `Already rotated for ${targetDate}`,
                alreadyDone: true,
                existingCount
            });
        }

        // Select 20 questions for each category
        for (const category of CATEGORIES) {
            const { selected, recycled } = await selectDailyForCategory(category, targetDate, sixtyDaysAgo);

            results.categorySummary[category] = { selected, recycled };
            results.totalSelected += selected;
            if (recycled) results.totalRecycled++;

        }


        return res.status(200).json({
            success: true,
            message: `Rotated ${results.totalSelected} questions for ${targetDate}`,
            ...results
        });

    } catch (error) {
        console.error('[Rotation] Fatal error:', error);
        return res.status(500).json({ success: false, error: error.message, ...results });
    }
}

export const config = {
    maxDuration: 30 // Pool rotation is fast, no AI calls needed
};
