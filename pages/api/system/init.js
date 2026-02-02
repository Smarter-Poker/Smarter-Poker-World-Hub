/**
 * 🚀 SMARTER.POKER SYSTEM INITIALIZATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GET /api/system/init
 *
 * One-click initialization that:
 * 1. Creates the Smarter.Poker system account if it doesn't exist
 * 2. Triggers the news scraper to populate content
 * 3. Returns status of all operations
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SYSTEM_UUID = '00000000-0000-0000-0000-000000000001';

export default async function handler(req, res) {
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('🚀 SMARTER.POKER SYSTEM INITIALIZATION');
    console.log('═'.repeat(70));
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log('');

    const results = {
        timestamp: new Date().toISOString(),
        systemAccount: { exists: false, created: false, error: null },
        scraper: { triggered: false, error: null },
        database: { connected: false, tables: {} }
    };

    try {
        // ─────────────────────────────────────────────────────────────────────
        // STEP 1: Check Database Connection
        // ─────────────────────────────────────────────────────────────────────
        console.log('📡 Step 1: Checking database connection...');

        if (!SUPABASE_URL) {
            throw new Error('Missing SUPABASE_URL environment variable');
        }

        // Test connection by checking profiles table
        const { count: profileCount, error: profileError } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true });

        if (profileError) {
            console.log('   ❌ Database connection failed:', profileError.message);
            results.database.error = profileError.message;
        } else {
            console.log('   ✅ Database connected');
            results.database.connected = true;
            results.database.tables.profiles = profileCount || 0;
        }

        // Check other tables
        const tables = ['social_posts', 'poker_news', 'poker_videos'];
        for (const table of tables) {
            const { count, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });

            if (!error) {
                results.database.tables[table] = count || 0;
                console.log(`   ✅ Table '${table}': ${count || 0} rows`);
            } else {
                console.log(`   ⚠️  Table '${table}': ${error.message}`);
            }
        }
        console.log('');

        // ─────────────────────────────────────────────────────────────────────
        // STEP 2: Create/Verify System Account
        // ─────────────────────────────────────────────────────────────────────
        console.log('👤 Step 2: Setting up Smarter.Poker system account...');

        // Check if exists
        const { data: existing, error: checkError } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .eq('id', SYSTEM_UUID)
            .single();

        if (existing) {
            console.log('   ✅ System account already exists');
            console.log(`      Username: ${existing.username}`);
            console.log(`      Display: ${existing.full_name || 'Smarter.Poker'}`);
            results.systemAccount.exists = true;
        } else {
            console.log('   📝 Creating system account...');

            const { data: created, error: createError } = await supabase
                .from('profiles')
                .insert({
                    id: SYSTEM_UUID,
                    username: 'smarter.poker',
                    full_name: 'Smarter.Poker',
                    avatar_url: '/images/smarter-poker-logo.png',
                    bio: 'Official Smarter.Poker News & Updates'
                })
                .select()
                .single();

            if (createError) {
                console.log('   ❌ Failed to create:', createError.message);
                results.systemAccount.error = createError.message;
            } else {
                console.log('   ✅ System account created successfully!');
                console.log(`      Username: ${created.username}`);
                results.systemAccount.exists = true;
                results.systemAccount.created = true;
            }
        }
        console.log('');

        // ─────────────────────────────────────────────────────────────────────
        // STEP 3: Trigger News Scraper
        // ─────────────────────────────────────────────────────────────────────
        console.log('📰 Step 3: Triggering news scraper...');

        try {
            // Get the host from the request
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            const host = req.headers.host;
            const scraperUrl = `${protocol}://${host}/api/cron/news-scraper`;

            console.log(`   Calling: ${scraperUrl}`);

            const scraperResponse = await fetch(scraperUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (scraperResponse.ok) {
                const scraperData = await scraperResponse.json();
                console.log('   ✅ Scraper completed');
                console.log(`      Articles: ${scraperData.results?.articles?.saved || 0} saved`);
                console.log(`      Videos: ${scraperData.results?.videos?.saved || 0} saved`);
                results.scraper.triggered = true;
                results.scraper.results = scraperData.results;
            } else {
                const errorText = await scraperResponse.text();
                console.log('   ⚠️  Scraper returned error:', errorText.substring(0, 100));
                results.scraper.error = errorText.substring(0, 200);
            }
        } catch (scraperError) {
            console.log('   ⚠️  Could not trigger scraper:', scraperError.message);
            results.scraper.error = scraperError.message;
        }
        console.log('');

        // ─────────────────────────────────────────────────────────────────────
        // DONE
        // ─────────────────────────────────────────────────────────────────────
        console.log('═'.repeat(70));
        console.log('✅ INITIALIZATION COMPLETE');
        console.log('═'.repeat(70));

        return res.status(200).json({
            success: true,
            message: 'System initialization complete',
            results
        });

    } catch (error) {
        console.error('❌ Initialization failed:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message,
            results
        });
    }
}
