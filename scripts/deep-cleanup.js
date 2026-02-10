#!/usr/bin/env node
/**
 * DELETE BAD QUESTIONS + FIX FORMAT ISSUES
 * Found by deep-audit.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 31 questions with wrong facts, wrong strategy, sync issues, or wrong math
const DELETE_IDS = [
    'af1af6a3-e82c-4fd4-a39f-3b6daa8d3e25', // WRONG_FACT: famous_hands
    '2ad0a5f1-c784-4119-8311-a00b2a097739', // WRONG_FACT: famous_hands
    'cba00d12-0658-4e15-b0af-90f24cb06b33', // WRONG_FACT: famous_hands
    '9dff807d-7cc4-44e8-b7c5-7b4df9b17ef7', // WRONG_FACT: famous_hands
    '549ac362-bfff-4af2-9eb6-b64c6fa64872', // WRONG_FACT: famous_hands
    '6e6a2166-cd92-491d-8428-9862af824a0d', // WRONG_FACT: famous_hands
    '9f1899c7-c569-402c-aedf-74a5678be268', // WRONG_FACT: famous_hands
    'e8247e8c-0337-4642-9824-c638f7eabf34', // WRONG_FACT: famous_hands
    'ea8e0bb5-37ac-45e3-917e-30a9c5c2b305', // WRONG_FACT: famous_hands
    'c9207e31-3d2b-48e0-a053-1c8af2cba756', // WRONG_FACT: famous_hands
    '9a5e817b-951d-437d-adb8-395f8616f102', // WRONG_FACT: famous_hands
    '26ff873b-3de6-406e-9b6b-e01d6a2575bc', // WRONG_FACT: famous_hands
    '98a60f0c-0b75-46b4-848b-4a2269c06c9a', // WRONG_FACT: player_profiles (Bicknell bracelets)
    '8532347f-0993-4aea-99c9-83fb285a4600', // WRONG_FACT: player_profiles (Bicknell bracelets)
    '13122919-6d34-48e7-a576-b0370c5880f1', // WRONG_FACT: player_profiles
    '17743cf6-f62c-40b6-8647-ffb114aeffc9', // WRONG_FACT: tournament_facts (Moneymaker hand)
    '1f4a3856-b63d-4f32-94fc-5f116079bd9f', // WRONG_FACT: tournament_facts (Moneymaker hand)
    '5edbfd3b-f141-43af-8d94-92dd7d6c9f4a', // WRONG_FACT: tournament_facts (Moneymaker hand)
    '3668c790-1d81-42de-bd0c-3231578ed570', // WRONG_STRATEGY: poker_history (fold TP 12BB)
    '36e400cc-07b4-4aba-b022-ba5f772cd041', // WRONG_STRATEGY: player_profiles (fold TP 8BB)
    'f60c92eb-9928-46ac-9c9e-ec53819cced2', // WRONG_STRATEGY: tournament_facts (fold TP 12BB)
    'e45eb7d1-7080-434f-9031-3785d01cdf28', // WRONG_STRATEGY: gto_theory (fold TP 10BB)
    'bc3b3dbb-36df-485f-8523-5297bf29af00', // WRONG_STRATEGY: icm_chip_ev (fold 99 12BB)
    'c871b3d0-2882-4708-8b7f-4800fe0a843d', // SYNC_ISSUE: player_profiles
    '642ae9d5-2c71-4c9f-a3d5-3de8059e656b', // WRONG_MATH: gto_theory (flush draw ≠ 9)
    'f1f0b90e-fab8-4bc3-9cab-b1c828b03a89', // WRONG_MATH: mtt_situations (flush draw ≠ 9)
    '28c03e43-c067-4b75-b830-bbe87c8ea090', // SYNC_ISSUE: mtt_situations
    '147b52c7-2b5e-44e8-aebc-4a0f00429daa', // SYNC_ISSUE: mtt_situations
    '6cf579fe-663c-49bd-ad9f-12be1cb619a4', // SYNC_ISSUE: mtt_situations
    '52fbbe1b-c456-44b9-9978-3aef9e50c33d', // SYNC_ISSUE: mtt_situations
    '949cfcb5-388d-41e6-bb3f-e93cef165fea', // SUSPICIOUS: poker_history (Chan Asia claim)
];

// 12 questions with letter prefixes in answer text (some overlap with DELETE_IDS)
const FORMAT_FIX_IDS = [
    '5ec2a7be-5f8d-415f-bc93-e26d9a6152a2',
    '53ee83d2-45c1-4212-8da9-36d461072498',
    'e45d593f-0409-4e98-9156-e2b885cb2821', // also in DELETE
    '61243ba5-13ab-41e2-9716-ba7fa7a260ec',
    '7940918c-a3d8-48fb-85ee-e183a85e21f2',
    '9f78c1f8-0399-4e25-ab6e-16266cadde15',
    'a57f0eb8-9719-404c-92b9-fcb3f143235c',
    '84db5bd2-ac6e-4017-aab8-57ff544ebb4f',
    'a9afdc40-3ed0-4fe6-9740-64cc1fcc0405',
    'ffd6a8bd-cf31-45d6-bd6e-12c6e9c65ee7',
    'f5e36f74-dbda-4b59-8afa-f4e9ca881b01',
    '9b9a5811-7c6e-4d54-9976-9250be189d72',
];

async function main() {
    console.log('🗑️  Step 1: Deleting ' + DELETE_IDS.length + ' bad questions...');

    // Delete in batches of 10 to avoid timeouts
    for (let i = 0; i < DELETE_IDS.length; i += 10) {
        const batch = DELETE_IDS.slice(i, i + 10);
        const { error } = await supabase.from('trivia_questions').delete().in('id', batch);
        if (error) {
            console.log('  ❌ Batch ' + i + ': ' + error.message);
        } else {
            console.log('  ✅ Deleted batch ' + (Math.floor(i / 10) + 1) + ' (' + batch.length + ' questions)');
        }
    }

    console.log('\n🔧 Step 2: Fixing ' + FORMAT_FIX_IDS.length + ' format issues...');

    let fixCount = 0;
    for (const fid of FORMAT_FIX_IDS) {
        if (DELETE_IDS.includes(fid)) {
            console.log('  ⏭️  Skipping ' + fid + ' (already deleted)');
            continue;
        }

        const { data: q } = await supabase
            .from('trivia_questions')
            .select('id, options')
            .eq('id', fid)
            .single();

        if (!q) {
            console.log('  ⏭️  ' + fid + ' not found');
            continue;
        }

        let changed = false;
        const fixedOptions = q.options.map(opt => {
            const cleaned = opt.replace(/^[A-D]\)\s*/, '');
            if (cleaned !== opt) changed = true;
            return cleaned;
        });

        if (changed) {
            const { error } = await supabase
                .from('trivia_questions')
                .update({ options: fixedOptions })
                .eq('id', fid);

            if (!error) {
                fixCount++;
                console.log('  ✅ Fixed: ' + fid);
            } else {
                console.log('  ❌ Error: ' + fid + ' - ' + error.message);
            }
        }
    }

    console.log('\n✅ Fixed ' + fixCount + ' format issues');

    // Final count
    const { count } = await supabase
        .from('trivia_questions')
        .select('*', { count: 'exact', head: true });

    console.log('\n📊 Remaining questions: ' + count);

    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
