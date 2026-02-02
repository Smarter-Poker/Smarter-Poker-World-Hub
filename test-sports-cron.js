/**
 * 🧪 TEST SPORTS CRON JOB
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Manually test the sports-clips cron job locally
 * 
 * Run: node test-sports-cron.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { getGrokClient } from './src/lib/grokClient.js';
import {
    applyWritingStyle,
    getTimeOfDayEnergy,
    shouldHorsePostToday
} from './src/content-engine/pipeline/HorseScheduler.js';

// Load sports clip library
const {
    getRandomSportsClip,
    getRandomSportsCaption,
    SPORTS_CLIP_LIBRARY
} = await import('./src/content-engine/pipeline/SportsClipLibrary.js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const grok = getGrokClient();

console.log('\n' + '═'.repeat(60));
console.log('🏈 TESTING SPORTS CLIPS CRON');
console.log('═'.repeat(60));

// Check sports clip library
console.log(`\n📚 Sports Clip Library: ${SPORTS_CLIP_LIBRARY.length} clips loaded`);

// Get a random sports clip
const clip = getRandomSportsClip();
console.log(`\n📺 Random Sports Clip:`);
console.log(`   Title: ${clip.title}`);
console.log(`   Source: ${clip.source}`);
console.log(`   Category: ${clip.category}`);
console.log(`   URL: ${clip.source_url}`);

// Get caption
const caption = getRandomSportsCaption(clip.category);
console.log(`\n💬 Template Caption: "${caption}"`);

// Get random horse
const { data: horses } = await supabase
    .from('content_authors')
    .select('*')
    .eq('is_active', true)
    .not('profile_id', 'is', null)
    .limit(5);

if (horses && horses.length > 0) {
    const horse = horses[0];
    console.log(`\n🐴 Test Horse: ${horse.alias}`);

    // Apply writing style
    const styledCaption = applyWritingStyle(caption, horse.profile_id);
    console.log(`   Styled Caption: "${styledCaption}"`);

    // Create final caption
    const finalCaption = `${styledCaption}\n\n${clip.source_url}`;
    console.log(`\n📝 Final Post:`);
    console.log(`   ${finalCaption}`);

    console.log(`\n✅ Sports cron logic is working correctly!`);
} else {
    console.log(`\n❌ No horses found in database`);
}

console.log('\n' + '═'.repeat(60));

process.exit(0);
