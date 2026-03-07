#!/usr/bin/env node
/**
 * Spot-check flagged questions to verify audit accuracy before mass deletion.
 * Pull 3 random questions from each error type and display full details.
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    // Check the "First WSOP" false positives
    console.log('═══ FACT-05: "First WSOP" CHECKS ═══\n');
    const factIds = [
        'a4bb98a9-a7aa-424d-a449-059e3ab044df', // "not 2007"
        '34c79434-37f1-471b-9f70-d11b49ae3a56', // "not 2005"
        '10c1bc01-c267-4414-9d29-15d4141fa66a', // "not 1971"
    ];
    for (const id of factIds) {
        const { data: q } = await s.from('trivia_questions').select('*').eq('id', id).maybeSingle();
        if (!q) continue;
        console.log(`ID: ${id}`);
        console.log(`Q: ${q.question}`);
        console.log(`A: ${q.options[q.correct_index]}`);
        console.log(`E: ${q.explanation.substring(0, 200)}`);
        console.log('---\n');
    }

    // Check RANK-01 "top pair" false positives
    console.log('\n═══ RANK-01: "TOP PAIR" CHECKS ═══\n');
    const rankIds = [
        'eb6364b4-2980-4570-a804-a3117018063a', // hero J9 vs board Q
        'c4851141-e6e9-4602-9530-e9646bfa4b9c', // hero QJ vs board T
    ];
    for (const id of rankIds) {
        const { data: q } = await s.from('trivia_questions').select('*').eq('id', id).maybeSingle();
        if (!q) continue;
        console.log(`ID: ${id}`);
        console.log(`Q: ${q.question}`);
        console.log(`A: ${q.options[q.correct_index]}`);
        console.log(`E: ${q.explanation.substring(0, 200)}`);
        console.log('---\n');
    }

    // Check RANK-04 "flush draw" false positives — sample one
    console.log('\n═══ RANK-04: "FLUSH DRAW" CHECKS ═══\n');
    const flushIds = [
        '73212e06-1f8e-451e-a9e8-45e710e3caf9', // 0 board cards match
        '4594ca3e-14ba-4aaf-8d5d-e5cf0369e3f5', // 0 board cards match
    ];
    for (const id of flushIds) {
        const { data: q } = await s.from('trivia_questions').select('*').eq('id', id).maybeSingle();
        if (!q) continue;
        console.log(`ID: ${id}`);
        console.log(`Q: ${q.question}`);
        console.log(`A: ${q.options[q.correct_index]}`);
        console.log(`E: ${q.explanation.substring(0, 200)}`);
        console.log('---\n');
    }

    // Check RIVER-02 — are these really river questions?
    console.log('\n═══ RIVER-02: OUTS ON RIVER CHECKS ═══\n');
    const riverIds = [
        '7c130d21-3e5a-4c48-943c-f308471b41a2',
        'dbd91ee4-603f-488f-a20f-08034eb02232',
    ];
    for (const id of riverIds) {
        const { data: q } = await s.from('trivia_questions').select('*').eq('id', id).maybeSingle();
        if (!q) continue;
        console.log(`ID: ${id}`);
        console.log(`Q: ${q.question}`);
        console.log(`A: ${q.options[q.correct_index]}`);
        console.log(`E: ${q.explanation.substring(0, 250)}`);
        console.log('---\n');
    }

    // Check FACT-02 "Hellmuth bracelets"
    console.log('\n═══ FACT-02: HELLMUTH BRACELET CHECKS ═══\n');
    const { data: hellmuth } = await s.from('trivia_questions').select('id, question, options, correct_index, explanation')
        .or('question.ilike.%hellmuth%,explanation.ilike.%hellmuth%');

    for (const q of (hellmuth || []).slice(0, 3)) {
        const braceletMatch = (`${q.question} ${q.explanation}`).match(/(\d+)\s*bracelets?/i);
        console.log(`ID: ${q.id}`);
        console.log(`Q: ${q.question.substring(0, 100)}`);
        console.log(`Bracelet count: ${braceletMatch ? braceletMatch[1] : 'N/A'}`);
        console.log(`E: ${q.explanation.substring(0, 150)}`);
        console.log('---\n');
    }

    // CARD-COL-01 — definitely need to check these
    console.log('\n═══ CARD-COL-01: CARD COLLISION CHECKS ═══\n');
    const colIds = [
        'b26ab545-45fe-4e75-bfa5-0e6aebc76a6c',
        'a3b0c1d6-16bc-4452-bebe-3c74979b2896',
    ];
    for (const id of colIds) {
        const { data: q } = await s.from('trivia_questions').select('*').eq('id', id).maybeSingle();
        if (!q) continue;
        console.log(`ID: ${id}`);
        console.log(`Q: ${q.question}`);
        console.log(`A: ${q.options[q.correct_index]}`);
        console.log(`E: ${q.explanation.substring(0, 200)}`);
        console.log('---\n');
    }

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
