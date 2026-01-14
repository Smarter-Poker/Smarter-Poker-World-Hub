#!/usr/bin/env node
/**
 * Upload pre-generated horse avatars to Supabase
 * Maps local PNG files to horse names and uploads them
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase credentials');
    console.error('URL:', SUPABASE_URL ? 'SET' : 'MISSING');
    console.error('KEY:', SUPABASE_KEY ? 'SET' : 'MISSING');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Directory where generated avatars are stored
const AVATARS_DIR = '/Users/smarter.poker/.gemini/antigravity/brain/0a6ef17e-e0ca-427c-82bb-bc22ebc45d87';

/**
 * Extract horse name from filename
 * e.g., horse_avatar_aaron_bell_1768386201481.png -> Aaron Bell
 */
function extractHorseName(filename) {
    // Remove prefix and extension
    const match = filename.match(/horse_avatar_(.+?)_\d+\.png$/);
    if (!match) return null;

    let namePart = match[1];

    // Remove suffixes like _home, _win, _v2
    namePart = namePart.replace(/_home$/, '');
    namePart = namePart.replace(/_win$/, '');
    namePart = namePart.replace(/_v2$/, '');

    // Convert underscores to spaces and capitalize
    return namePart
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

/**
 * Upload a single avatar and update the database
 */
async function uploadAndAssignAvatar(filePath, horse) {
    const fileName = `horse_avatar_${horse.id}_${Date.now()}.png`;
    const storagePath = `avatars/${fileName}`;

    const fileBuffer = fs.readFileSync(filePath);

    // Upload to Supabase storage
    const { error: uploadError } = await supabase.storage
        .from('social-media')
        .upload(storagePath, fileBuffer, {
            contentType: 'image/png',
            upsert: true
        });

    if (uploadError) {
        console.error(`  ❌ Upload failed: ${uploadError.message}`);
        return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
        .from('social-media')
        .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // Update content_authors
    const { error: authorError } = await supabase
        .from('content_authors')
        .update({ avatar_url: publicUrl })
        .eq('id', horse.id);

    if (authorError) {
        console.error(`  ❌ Author update failed: ${authorError.message}`);
    }

    // Update profiles if profile_id exists
    if (horse.profile_id) {
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ avatar_url: publicUrl })
            .eq('id', horse.profile_id);

        if (profileError) {
            console.error(`  ⚠️ Profile update failed: ${profileError.message}`);
        }
    }

    console.log(`  ✅ Uploaded -> ${publicUrl.split('/').pop()}`);
    return publicUrl;
}

/**
 * Main upload function
 */
async function uploadAllAvatars() {
    console.log('\n🐴🐴🐴 HORSE AVATAR UPLOADER 🐴🐴🐴');
    console.log('═'.repeat(60));

    // Get all horses from database
    const { data: horses, error } = await supabase
        .from('content_authors')
        .select('id, profile_id, name, avatar_url')
        .eq('is_active', true)
        .order('name');

    if (error) {
        console.error('Failed to fetch horses:', error.message);
        process.exit(1);
    }

    console.log(`Found ${horses.length} horses in database\n`);

    // Create a map of horse names to horse records (lowercase for matching)
    const horseMap = new Map();
    for (const horse of horses) {
        horseMap.set(horse.name.toLowerCase(), horse);
    }

    // Get all avatar files
    const files = fs.readdirSync(AVATARS_DIR)
        .filter(f => f.startsWith('horse_avatar_') && f.endsWith('.png'));

    console.log(`Found ${files.length} avatar files\n`);

    // Track results
    let uploaded = 0;
    let skipped = 0;
    let notFound = 0;
    const assignments = [];

    // Use a Set to track which horses have been assigned (prefer latest version)
    const assignedHorses = new Set();

    // Sort files by timestamp (newest first) so we prefer v2/latest versions
    files.sort((a, b) => {
        const timestampA = parseInt(a.match(/_(\d+)\.png$/)?.[1] || '0');
        const timestampB = parseInt(b.match(/_(\d+)\.png$/)?.[1] || '0');
        return timestampB - timestampA;
    });

    for (const file of files) {
        const horseName = extractHorseName(file);
        if (!horseName) {
            console.log(`⚠️  Could not parse name from: ${file}`);
            skipped++;
            continue;
        }

        const horse = horseMap.get(horseName.toLowerCase());
        if (!horse) {
            console.log(`⚠️  No horse found for "${horseName}"`);
            notFound++;
            continue;
        }

        // Skip if we already have a newer avatar for this horse
        if (assignedHorses.has(horse.id)) {
            console.log(`⏭️  ${horseName} - already has newer avatar`);
            skipped++;
            continue;
        }

        console.log(`🐴 ${horseName} (ID: ${horse.id})`);

        const filePath = path.join(AVATARS_DIR, file);
        const url = await uploadAndAssignAvatar(filePath, horse);

        if (url) {
            uploaded++;
            assignedHorses.add(horse.id);
            assignments.push({
                name: horseName,
                id: horse.id,
                avatar_url: url
            });
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📊 UPLOAD SUMMARY');
    console.log('═'.repeat(60));
    console.log(`✅ Uploaded: ${uploaded}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Not found: ${notFound}`);
    console.log(`📋 Total horses with avatars: ${assignedHorses.size}`);

    // Check for horses without avatars
    const horsesWithoutAvatars = horses.filter(h => !assignedHorses.has(h.id));
    if (horsesWithoutAvatars.length > 0) {
        console.log(`\n⚠️  Horses still missing avatars (${horsesWithoutAvatars.length}):`);
        horsesWithoutAvatars.slice(0, 10).forEach(h => console.log(`   - ${h.name}`));
        if (horsesWithoutAvatars.length > 10) {
            console.log(`   ... and ${horsesWithoutAvatars.length - 10} more`);
        }
    }

    console.log('\n✅ Upload complete! Horses now remember their faces.');
}

// Run it
uploadAllAvatars().catch(console.error);
