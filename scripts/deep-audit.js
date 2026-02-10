#!/usr/bin/env node
/**
 * DEEP FACTUAL ACCURACY AUDIT
 * Goes beyond structural validation — checks if answers are factually correct
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const issues = [];

function flag(severity, cat, id, issue, question) {
    issues.push({ severity, cat, id, issue, q: (question || '').substring(0, 120) });
}

async function auditCategory(cat) {
    const { data, error } = await supabase
        .from('trivia_questions')
        .select('id, question, options, correct_index, explanation, difficulty')
        .eq('category', cat);

    if (error || !data) {
        console.log(`❌ Failed to fetch ${cat}: ${error?.message}`);
        return;
    }

    console.log(`Auditing ${cat}: ${data.length} questions...`);

    for (const q of data) {
        const correct = q.options[q.correct_index];
        const ql = q.question.toLowerCase();
        const cl = correct.toLowerCase();
        const el = (q.explanation || '').toLowerCase();
        const allText = ql + ' ' + cl + ' ' + el;

        // ======= FORMAT CHECKS =======

        // Answer text has letter prefix like "B) ..."
        if (correct.match(/^[A-D]\)\s/)) {
            flag('FORMAT', cat, q.id, 'Answer has letter prefix: ' + correct.substring(0, 40), q.question);
        }

        // Empty or very short explanation
        if (!q.explanation || q.explanation.length < 20) {
            flag('FORMAT', cat, q.id, 'Missing or very short explanation', q.question);
        }

        // ======= WRONG POKER MATH =======

        // Gutshot != 4 outs
        const gutshotMatch = allText.match(/gutshot[^.]*?(\d+)\s*outs/i);
        if (gutshotMatch && parseInt(gutshotMatch[1]) !== 4) {
            flag('WRONG_MATH', cat, q.id, `Gutshot = 4 outs, not ${gutshotMatch[1]}`, q.question);
        }

        // OESD != 8 outs
        const oesdMatch = allText.match(/(?:open[- ]?ended|oesd)[^.]*?(\d+)\s*outs/i);
        if (oesdMatch && parseInt(oesdMatch[1]) !== 8) {
            flag('WRONG_MATH', cat, q.id, `OESD = 8 outs, not ${oesdMatch[1]}`, q.question);
        }

        // Flush draw != 9 outs
        const flushMatch = allText.match(/flush\s*draw[^.]*?(\d+)\s*outs/i);
        if (flushMatch && parseInt(flushMatch[1]) !== 9) {
            flag('WRONG_MATH', cat, q.id, `Flush draw = 9 outs, not ${flushMatch[1]}`, q.question);
        }

        // MDF for half pot = 67%, not 75%
        if (allText.includes('mdf') || allText.includes('minimum defense')) {
            if (allText.match(/half[- ]?pot|1\/2\s*pot/i)) {
                if (cl.includes('75%') || cl.includes('50%') || cl.includes('80%')) {
                    flag('WRONG_MATH', cat, q.id, `MDF for half-pot = 67%, answer says: ${correct}`, q.question);
                }
            }
        }

        // ======= WRONG STRATEGY =======

        // Fold top pair / overpair with ≤12BB 
        const bbMatch = q.question.match(/(\d+)\s*BB/i);
        const bb = bbMatch ? parseInt(bbMatch[1]) : 999;

        if (bb <= 12 && bb >= 4 && cl.includes('fold')) {
            if (allText.includes('top pair') || allText.includes('overpair')) {
                flag('WRONG_STRATEGY', cat, q.id, `Fold top pair/overpair with ${bb}BB — ALWAYS call`, q.question);
            }
        }

        // Overpair mislabel: e.g., 88 called "overpair" when board has T or higher
        if (allText.includes('overpair')) {
            const pocketMatch = q.question.match(/([2-9TJQKA])[♠♣♥♦]\1/);
            if (pocketMatch) {
                const pairRank = pocketMatch[1];
                const rankOrder = '23456789TJQKA';
                const pairIdx = rankOrder.indexOf(pairRank);

                // Find board cards
                const boardSection = q.question.match(/board[^:]*?:?\s*(.*?)(?:\.|,\s*(?:and|giving|with))/i);
                if (boardSection) {
                    const boardRanks = boardSection[1].match(/([2-9TJQKA])[♠♣♥♦]/g);
                    if (boardRanks) {
                        for (const br of boardRanks) {
                            const boardIdx = rankOrder.indexOf(br[0]);
                            if (boardIdx > pairIdx) {
                                flag('WRONG_FACT', cat, q.id, `${pairRank}${pairRank} NOT overpair — board has ${br[0]} which is higher`, q.question);
                                break;
                            }
                        }
                    }
                }
            }
        }

        // ======= WRONG FACTS =======

        // Moneymaker bluff was 5♠4♠ (or 5♦4♦ at different points), NOT K♠7♥
        if (allText.includes('moneymaker') && q.question.match(/k[♠♣♥♦]7/i)) {
            flag('WRONG_FACT', cat, q.id, 'Moneymaker famous bluff was 5♠4♠, not K♠7♥', q.question);
        }

        // Kristen Bicknell: 0 WSOP bracelets through 2023
        if (allText.includes('bicknell') && allText.match(/(?:two|2|three|3)\s*(?:wsop\s*)?bracelet/i)) {
            flag('WRONG_FACT', cat, q.id, 'Bicknell had 0 WSOP bracelets through 2023', q.question);
        }

        // Johnny Chan popularizing Asian poker — debatable/wrong
        if (allText.includes('chan') && allText.includes('asia') && allText.includes('popular')) {
            flag('SUSPICIOUS', cat, q.id, 'Chan credited with popularizing poker in Asia — unverifiable', q.question);
        }

        // First WSOP was 1970 (not 1969 or 1971)
        if (ql.match(/first.*wsop|wsop.*first|when.*wsop.*start/i)) {
            if (cl.includes('1969') || cl.includes('1971') || cl.includes('1972')) {
                flag('WRONG_FACT', cat, q.id, `First WSOP was 1970, answer says ${correct}`, q.question);
            }
        }

        // WSOP ME buy-in became $10K in 1972
        // The 1971 event was $5K — $10K starting 1972

        // ======= ANSWER-EXPLANATION SYNC =======

        // Check if correct answer action word appears in explanation
        const actionWords = ['fold', 'call', 'raise', 'shove', 'check', 'bet'];
        const correctAction = actionWords.find(a => cl.startsWith(a));
        if (correctAction && el) {
            // Count how many times explanation mentions each action
            for (const alt of actionWords) {
                if (alt === correctAction) continue;
                const altRegex = new RegExp(`\\b${alt}(?:ing|s|ed)?\\b`, 'gi');
                const correctRegex = new RegExp(`\\b${correctAction}(?:ing|s|ed)?\\b`, 'gi');
                const altCount = (el.match(altRegex) || []).length;
                const correctCount = (el.match(correctRegex) || []).length;

                // If explanation recommends a different action more
                if (altCount > 3 && altCount > correctCount * 2) {
                    flag('SYNC_ISSUE', cat, q.id, `Explanation mentions "${alt}" ${altCount}x but correct answer starts with "${correctAction}" (${correctCount}x)`, q.question);
                }
            }
        }

        // ======= DUPLICATE DETECTION =======
        // (handled later by comparing question text similarity)
    }
}

async function main() {
    const categories = [
        'poker_history', 'famous_hands', 'player_profiles',
        'rule_knowledge', 'tournament_facts',
        'gto_theory', 'mtt_situations', 'cash_game_situations',
        'icm_chip_ev', 'gto_scenarios'
    ];

    for (const cat of categories) {
        await auditCategory(cat);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('DEEP FACTUAL AUDIT — COMPLETE RESULTS');
    console.log('═'.repeat(60));
    console.log(`Total issues found: ${issues.length}\n`);

    // Group by severity
    const grouped = {};
    for (const i of issues) {
        if (!grouped[i.severity]) grouped[i.severity] = [];
        grouped[i.severity].push(i);
    }

    for (const [severity, items] of Object.entries(grouped)) {
        console.log(`\n--- ${severity} (${items.length}) ---`);
        for (const item of items) {
            console.log(`  ID: ${item.id}`);
            console.log(`  CAT: ${item.cat}`);
            console.log(`  !!! ${item.issue}`);
            console.log(`  Q: ${item.q}`);
            console.log('');
        }
    }

    // Print IDs for deletion
    const deleteIds = issues.filter(i => ['WRONG_MATH', 'WRONG_FACT', 'WRONG_STRATEGY', 'SYNC_ISSUE'].includes(i.severity)).map(i => i.id);
    console.log('\n=== IDs TO DELETE (' + deleteIds.length + ') ===');
    console.log(JSON.stringify(deleteIds));

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
