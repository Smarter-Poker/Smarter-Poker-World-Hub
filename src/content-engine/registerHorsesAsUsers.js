/**
 * 🐴 REGISTER HORSES AS OFFICIAL USERS
 * Creates profiles for all 100 horses so they can:
 * - Appear in social pages
 * - Be added to clubs as members
 * 
 * Player numbers: 101-200
 * 
 * Run: node src/content-engine/registerHorsesAsUsers.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
const envPath = join(__dirname, '../../.env.local');
let env = {};
try {
    const envContent = readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) env[match[1].trim()] = match[2].trim();
    });
} catch {
    // Fallback to production credentials
    env = {
        NEXT_PUBLIC_SUPABASE_URL: 'https://kuklfnapbkmacvwxktbh.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
    };
}

const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Load personas from JSON
const personas = JSON.parse(readFileSync(join(__dirname, 'personas.json'), 'utf-8'));

async function registerHorsesAsUsers() {
    console.debug('📋 Registering personas as official users...\n');

    // Create profiles for each persona
    const profiles = personas.personas.map((p, index) => {
        const playerNumber = 101 + index; // 101-200

        return {
            id: `player-${String(playerNumber).padStart(3, '0')}`, // player-101, player-102, etc.
            username: p.alias,
            display_name: p.name,
            avatar_url: null, // Will use DiceBear or stored avatar
            player_number: playerNumber,
            bio: p.bio,
            location: p.location,
            specialty: p.specialty,
            stakes: p.stakes,
            is_bot: false,
            is_active: true,
            total_hands: Math.floor(Math.random() * 50000) + 5000, // Random hands
            created_at: new Date().toISOString()
        };
    });

    console.debug(`📋 Preparing ${profiles.length} profiles...\n`);

    // Insert in batches
    const batchSize = 25;
    let inserted = 0;
    let errors = [];

    for (let i = 0; i < profiles.length; i += batchSize) {
        const batch = profiles.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;

        const { data, error } = await supabase
            .from('profiles')
            .upsert(batch, {
                onConflict: 'id',
                ignoreDuplicates: false
            })
            .select();

        if (error) {
            console.warn(`❌ Batch ${batchNum} error:`, error.message);
            errors.push({ batch: batchNum, error: error.message });
        } else {
            inserted += data?.length || 0;
            console.debug(`✅ Batch ${batchNum}: Registered ${data?.length || 0} players`);

            // Show first few names
            if (data?.length > 0) {
                const names = data.slice(0, 3).map(p => p.display_name);
                console.debug(`   → ${names.join(', ')}${data.length > 3 ? '...' : ''}`);
            }
        }
    }

    console.debug('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.debug(`🎉 Done! ${inserted} players registered as official users.`);
    console.debug(`   Player Numbers: 101-${100 + inserted}`);

    if (errors.length > 0) {
        console.debug(`\n⚠️  ${errors.length} batches had errors`);
    }

    // Show sample users
    console.debug('\n📊 Sample registered players:');
    const { data: samples } = await supabase
        .from('profiles')
        .select('id, username, display_name, player_number')
        .like('id', 'player-%')
        .limit(5);

    if (samples) {
        samples.forEach(p => {
            console.debug(`   #${p.player_number} - ${p.display_name} (@${p.username})`);
        });
    }
}

// Run
registerHorsesAsUsers().catch(console.warn);
