#!/usr/bin/env node
/**
 * Get horses missing avatars
 */

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const { data, error } = await supabase
    .from('content_authors')
    .select('id, name, avatar_url, gender')
    .eq('is_active', true)
    .is('avatar_url', null)
    .order('name');

if (error) {
    console.error('Error:', error.message);
    process.exit(1);
}

console.log(`Found ${data.length} horses missing avatars:\n`);
data.forEach(h => console.log(`${h.id}: ${h.name} (${h.gender})`));
