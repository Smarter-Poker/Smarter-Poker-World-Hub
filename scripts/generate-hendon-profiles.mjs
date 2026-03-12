/**
 * GENERATE HENDONMOB MOCKUPS FOR ALL HORSES
 * Maps realistic tournament statistics to all 308 horses based on their specialty.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helpers to generate realistic numbers
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randCash = (min, max) => Math.floor(randInt(min, max) / 100) * 100; // Round to nearest 100

function generateHendonStats(specialty, name) {
    let totalEarnings, totalCashes, biggestCash, bestFinish;

    // Base generation on specialty curves
    switch (specialty) {
        case 'tournaments':
        case 'mtt_grinder':
            // Pros: 100k - 2M earnings
            totalCashes = randInt(40, 180);
            totalEarnings = randCash(150000, 2500000);
            biggestCash = randCash(Math.floor(totalEarnings * 0.15), Math.floor(totalEarnings * 0.45));
            bestFinish = '1st';
            break;
            
        case 'high_stakes':
        case 'high_roller':
            // Crushers: 1M - 15M earnings
            totalCashes = randInt(25, 90);
            totalEarnings = Math.floor(randInt(1000000, 15000000) / 1000) * 1000;
            biggestCash = randCash(Math.floor(totalEarnings * 0.25), Math.floor(totalEarnings * 0.60));
            bestFinish = '1st';
            break;

        case 'cash_game':
        case 'live_cash':
        case 'plo_specialist':
            // Cash players don't play as many tourneys: 5k - 80k
            totalCashes = randInt(2, 15);
            totalEarnings = randCash(5000, 85000);
            biggestCash = randCash(Math.floor(totalEarnings * 0.40), Math.floor(totalEarnings * 0.85));
            bestFinish = randInt(1, 4) === 1 ? '1st' : `${randInt(2, 9)}th`;
            break;

        case 'recreational':
        case 'vlogger':
            // Recs: 1k - 25k
            totalCashes = randInt(1, 8);
            totalEarnings = randCash(1000, 25000);
            biggestCash = randCash(Math.floor(totalEarnings * 0.50), Math.floor(totalEarnings * 0.90));
            bestFinish = `${randInt(3, 15)}th`;
            break;

        default:
            // Standard Vegas local: 25k - 400k
            totalCashes = randInt(15, 60);
            totalEarnings = randCash(25000, 450000);
            biggestCash = randCash(Math.floor(totalEarnings * 0.20), Math.floor(totalEarnings * 0.35));
            bestFinish = randInt(1, 3) === 1 ? '1st' : `${randInt(2, 5)}th`;
    }

    // Generate a believable Hendon URL format
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const hendon_url = `https://pokerdb.thehendonmob.com/player.php?a=r&n=${slug}-${randInt(10000, 99999)}`;

    return {
        hendon_url,
        hendon_total_cashes: totalCashes,
        hendon_total_earnings: totalEarnings,
        hendon_biggest_cash: biggestCash,
        hendon_best_finish: bestFinish
    };
}

async function run() {
    console.log('Generating realistic HendonMob profiles for all horses...\n');

    // Fetch all horses that have a profile_id
    const { data: horses, error: fetchErr } = await supabase
        .from('content_authors')
        .select('id, profile_id, name, specialty')
        .not('profile_id', 'is', null);

    if (fetchErr) {
        console.error('Error fetching horses:', fetchErr);
        process.exit(1);
    }

    console.log(`Found ${horses.length} horses to process.`);

    let successCount = 0;

    // Process in batches of 50 to avoid overloading the DB
    for (let i = 0; i < horses.length; i += 50) {
        const batch = horses.slice(i, i + 50);
        
        // Prepare bulk update array for this batch
        const promises = batch.map(horse => {
            const stats = generateHendonStats(horse.specialty || 'unknown', horse.name);
            return supabase
                .from('profiles')
                .update(stats)
                .eq('id', horse.profile_id);
        });

        const results = await Promise.all(promises);
        
        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
            console.error(`Batch ${i/50 + 1} had ${errors.length} errors:`, errors[0].error.message);
        } else {
            successCount += batch.length;
            process.stdout.write(`\rUpdated ${successCount}/${horses.length} resumes...`);
        }
    }

    console.log(`\n\n✅ Done! Successfully generated and linked Poker Resumes for ${successCount} synthetic profiles.`);
}

run();
