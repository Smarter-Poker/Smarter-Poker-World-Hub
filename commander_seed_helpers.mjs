/**
 * Commander Seed - Shared helpers and config
 */
import { readFileSync } from 'fs';

const envPath = new URL('.env.local', import.meta.url).pathname;
const envVars = {};
readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
    if (m) envVars[m[1]] = m[2].replace(/\\n$/, '');
});

export const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
export const SERVICE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

export const headers = {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
};

export function uuid() {
    return crypto.randomUUID();
}

export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function randomDate(daysAgo = 30) {
    const d = new Date();
    d.setDate(d.getDate() - randomInt(0, daysAgo));
    d.setHours(randomInt(8, 23), randomInt(0, 59));
    return d.toISOString();
}

export function dateAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
}

export function today() {
    return new Date().toISOString().split('T')[0];
}

export async function insert(table, rows) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    });
    if (!res.ok) {
        const err = await res.text();
        console.error(`  ❌ ${table}: ${err}`);
        return null;
    }
    const data = await res.json();
    console.log(`  ✅ ${table}: ${data.length} rows`);
    return data;
}

export async function fetchExisting(table, select = '*', limit = 50) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=${limit}`, { headers });
    if (!res.ok) return [];
    return res.json();
}

// Poker constants
export const GAME_TYPES = ['NLH', 'PLO', 'PLO5', 'NLH/PLO Mix', 'Stud', 'Omaha Hi-Lo'];
export const STAKES = ['1/2', '1/3', '2/5', '5/10', '10/20', '25/50'];
export const PLAYER_NAMES = [
    'Mike "The Grinder" Chen', 'Sarah "Aces" Rodriguez', 'Tommy Two-Stacks',
    'Big Dave Williams', 'Lightning Lisa Park', 'Quiet Phil Nguyen',
    'Action Jack Martinez', 'River Queen Rebecca', 'Danny "Donk" Brown',
    'Smooth Sam Taylor', 'Wild Card Wendy', 'Nit Nick Nelson',
    'Bluff Master Boris', 'Call Station Carol', 'Tank Top Tony',
    'Shark Eye Sierra', 'Chip Leader Charlie', 'All-In Alice',
    'Fold Emma Fischer', 'Royal Flush Ryan', 'Pocket Pair Pete',
    'Set Mining Sally', 'Overbet Oscar', 'Value Bet Vicky',
    'Three-Bet Theo', 'Squeeze Play Sophia', 'Float Fred',
    'Check-Raise Chris', 'Pot Control Paula', 'LAG Larry',
    'TAG Tina', 'Maniac Max', 'Rock Solid Rita',
    'Bubble Boy Ben', 'Final Table Fiona', 'Short Stack Steve',
    'Deep Stack Diana', 'Satellite Sam', 'ICM Igor',
    'Hero Call Hannah',
];

export const DEALER_NAMES = [
    'James "Quick Pitch" Morrison', 'Maria "Smooth" Gonzalez',
    'Tony "The Machine" Russo', 'Linda Chen',
    'Robert "Fast Hands" Williams', 'Ashley Kim',
    'Carlos "No Misdeal" Reyes', 'Patricia O\'Brien',
    'David "The Pro" Tanaka', 'Keisha Washington',
];
