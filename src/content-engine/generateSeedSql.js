/**
 * 🐴 GENERATE SQL SEED FILE
 * Generates a complete SQL file to seed all 100 personas
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load personas
const personas = JSON.parse(readFileSync(join(__dirname, 'personas.json'), 'utf-8'));

function escapeSql(str) {
    if (!str) return 'NULL';
    // Handle strings that might contain single quotes
    return "'" + str.replace(/'/g, "''") + "'";
}

const sqlHeader = `-- 🐴 GHOST FLEET - COMPLETE 100 HORSES SEED
-- Generated: ${new Date().toISOString()}

-- 1. Ensure Table Exists
CREATE TABLE IF NOT EXISTS content_authors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    gender TEXT CHECK (gender IN ('male', 'female', 'other')),
    location TEXT NOT NULL,
    timezone TEXT NOT NULL,
    birthday DATE,
    alias TEXT UNIQUE NOT NULL,
    specialty TEXT,
    stakes TEXT,
    bio TEXT,
    voice TEXT,
    avatar_seed TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS (Idempotent)
ALTER TABLE content_authors ENABLE ROW LEVEL SECURITY;

-- 3. Apply Policies (Critical for Visibility)
-- Drop to ensure clean slate if rerunning
DROP POLICY IF EXISTS "Public can read authors" ON content_authors;
CREATE POLICY "Public can read authors" ON content_authors FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage authors" ON content_authors;
CREATE POLICY "Admins manage authors" ON content_authors FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- 4. Insert Personas
INSERT INTO content_authors (name, gender, location, timezone, birthday, alias, specialty, stakes, bio, voice, avatar_seed)
VALUES
`;

const values = personas.personas.map(p => {
    return `(
    ${escapeSql(p.name)},
    ${escapeSql(p.gender)},
    ${escapeSql(p.location)},
    ${escapeSql(p.timezone)},
    ${escapeSql(p.birthday)},
    ${escapeSql(p.alias)},
    ${escapeSql(p.specialty)},
    ${escapeSql(p.stakes)},
    ${escapeSql(p.bio)},
    ${escapeSql(p.voice)},
    ${escapeSql(p.avatar_seed)}
)`;
}).join(',\n');

const sqlFooter = `
ON CONFLICT (alias) DO UPDATE SET
    name = EXCLUDED.name,
    gender = EXCLUDED.gender,
    location = EXCLUDED.location,
    timezone = EXCLUDED.timezone,
    birthday = EXCLUDED.birthday,
    specialty = EXCLUDED.specialty,
    stakes = EXCLUDED.stakes,
    bio = EXCLUDED.bio,
    voice = EXCLUDED.voice,
    avatar_seed = EXCLUDED.avatar_seed;

DO $$ 
BEGIN 
    RAISE NOTICE '✅ GHOST FLEET DEPLOYED: 100 HORSES STABLED';
END $$;
`;

const fullSql = sqlHeader + values + sqlFooter;

const outputPath = join(__dirname, '../../supabase/migrations/013_ghost_fleet_complete.sql');
writeFileSync(outputPath, fullSql);

console.log(`\n✅ Generated SQL migration at: supabase/migrations/013_ghost_fleet_complete.sql`);
console.log(`Contains ${personas.personas.length} personas and security policies.`);
