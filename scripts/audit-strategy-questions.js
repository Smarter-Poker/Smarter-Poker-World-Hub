/**
 * Audit strategy questions for math/logic errors
 * Checks for inconsistencies in pot odds, stack sizes, and claim verification
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STRATEGY_CATS = ['mtt_situations', 'cash_game_situations', 'icm_chip_ev', 'gto_scenarios'];

// Patterns that indicate potential math errors
const MATH_PATTERNS = [
    // Pot odds claims that may be wrong
    { regex: /(\d+):(\d+)\s*odds/i, check: 'pot_odds' },
    // Percentage claims
    { regex: /(\d+)%\s*equity/i, check: 'equity' },
    // Stack size vs action inconsistencies
    { regex: /(\d+)\s*BB.*shoves?\s*(?:for\s*)?(\d+)\s*BB/i, check: 'stack_shove' },
];

function auditQuestion(q) {
    const issues = [];
    const text = `${q.question} ${q.explanation || ''}`;

    // Check stack vs shove consistency
    const stackShove = text.match(/(\d+)\s*BB\s*effective.*?shoves?\s*(?:for\s*)?(\d+)\s*BB/i);
    if (stackShove) {
        const effective = parseInt(stackShove[1]);
        const shoveSize = parseInt(stackShove[2]);
        if (shoveSize > effective) {
            issues.push(`Shove size (${shoveSize}BB) exceeds effective stack (${effective}BB)`);
        }
    }

    // Check pot odds claims
    const oddsMatch = text.match(/getting\s*(\d+):(\d+)\s*odds/i);
    if (oddsMatch && stackShove) {
        const claimed = parseInt(oddsMatch[1]) / parseInt(oddsMatch[2]);
        // With SB shove from blinds, actual odds are roughly:
        // pot = shove_amount + our_blind(1BB), call = shove - 1BB
        // actual_odds = pot / call
        const shoveAmt = parseInt(stackShove[2]);
        const pot = shoveAmt + 1; // SB shove + our BB
        const callAmt = shoveAmt - 1; // We already posted 1BB
        const actualOdds = pot / callAmt;

        if (Math.abs(claimed - actualOdds) > 0.3) {
            issues.push(`Claimed ${oddsMatch[1]}:${oddsMatch[2]} odds (${claimed.toFixed(1)}:1) but actual is ~${actualOdds.toFixed(1)}:1`);
        }
    }

    // Check for nonsensical raise when facing all-in
    if (/shoves?\s*(?:all[- ]?in)?/i.test(text) || /all[- ]?in/i.test(text)) {
        const hasRaiseOption = q.options?.some(o => /^raise/i.test(o));
        if (hasRaiseOption && /effective/i.test(text)) {
            // Raising is only valid if we have more chips than the shover
            const effMatch = text.match(/(\d+)\s*BB\s*effective/i);
            if (effMatch) {
                issues.push(`Raise option exists when facing all-in with equal effective stacks`);
            }
        }
    }

    return issues;
}

async function main() {
    console.log('🔍 Strategy Question Quality Audit\n');

    let totalIssues = 0;
    let badIds = [];

    for (const cat of STRATEGY_CATS) {
        const { data, error } = await supabase
            .from('trivia_questions')
            .select('id, question, options, correct_index, explanation, difficulty')
            .eq('category', cat);

        if (error) { console.error(`Error fetching ${cat}:`, error.message); continue; }
        if (!data) continue;

        console.log(`\n📂 ${cat} (${data.length} questions)`);
        let catIssues = 0;

        for (const q of data) {
            const issues = auditQuestion(q);
            if (issues.length > 0) {
                catIssues++;
                totalIssues++;
                badIds.push(q.id);
                console.log(`  ❌ [${q.id}] ${q.question.substring(0, 80)}...`);
                issues.forEach(i => console.log(`     → ${i}`));
            }
        }

        if (catIssues === 0) {
            console.log(`  ✅ No issues found`);
        } else {
            console.log(`  ⚠️  ${catIssues} questions with issues`);
        }
    }

    console.log(`\n📊 SUMMARY: ${totalIssues} total questions with potential math/logic issues`);

    if (badIds.length > 0) {
        console.log(`\n🗑️  Removing ${badIds.length} flawed questions from daily rotation...`);

        // Clear daily_date from bad questions so they won't be served
        const { error: updateError } = await supabase
            .from('trivia_questions')
            .update({ daily_date: null })
            .in('id', badIds);

        if (updateError) {
            console.error('Error clearing bad questions:', updateError.message);
        } else {
            console.log('✅ Bad questions removed from daily rotation');
        }
    }

    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
