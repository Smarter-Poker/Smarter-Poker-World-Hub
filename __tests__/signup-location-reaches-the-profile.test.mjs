// Signup location must land on the player's profile (2026-10-22).
//
// Signup defaults every player to the United States with a state dropdown;
// "Outside The US" swaps it for a country dropdown. The location travels in
// auth metadata, and the database trigger handle_new_user is what creates the
// profile row. Before 20261022163125 that trigger never copied city, state or
// country, so /api/auth/ensure-profile always found an existing row and its
// insert (the only code that copied them) never ran: 33 of 33 recent signups
// had lost their state. These checks keep every link of that chain wired.
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const MIGRATIONS = path.join(ROOT, 'supabase/migrations');

test('signup defaults to the US and swaps State for Select Your Country outside it', () => {
    const signup = read('pages/auth/signup.js');
    assert.match(signup, /outsideUs: false/, 'everyone starts in the United States');
    assert.match(signup, /Outside The US/);
    assert.match(signup, /Select Your Country/);
    assert.match(signup, /formData\.outsideUs \? !formData\.country : !formData\.state/, 'state for the US, country elsewhere');
    assert.match(signup, /country: formData\.outsideUs \? formData\.country : US_COUNTRY/, 'auth metadata carries the country');
    assert.match(signup, /state: formData\.outsideUs \? null : formData\.state/, 'no state outside the US');
});

test('the country list is complete and does not offer the United States', async () => {
    const { NON_US_COUNTRIES, US_COUNTRY } = await import(path.join(ROOT, 'src/lib/countries.js'));
    assert.equal(US_COUNTRY, 'United States');
    assert.ok(NON_US_COUNTRIES.length > 190);
    assert.ok(!NON_US_COUNTRIES.includes(US_COUNTRY));
    assert.equal(new Set(NON_US_COUNTRIES).size, NON_US_COUNTRIES.length, 'no duplicates');
});

test('the newest handle_new_user copies city, state and country onto the profile', () => {
    const defining = fs.readdirSync(MIGRATIONS)
        .filter((f) => /^\d{14}_.*\.sql$/.test(f))
        .sort()
        .filter((f) => /FUNCTION\s+public\.handle_new_user\s*\(/i.test(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8')));
    const latest = defining.at(-1);
    assert.ok(latest, 'a migration defines handle_new_user');
    const sql = fs.readFileSync(path.join(MIGRATIONS, latest), 'utf8');
    for (const field of ['city', 'state', 'country']) {
        assert.match(sql, new RegExp(`raw_user_meta_data->>'${field}'`), `${latest} reads ${field} from metadata`);
        assert.match(sql, new RegExp(`\\b${field}\\s+=\\s+CASE WHEN COALESCE\\(profiles\\.${field}`), `${latest} fills ${field} on conflict without overwriting`);
    }
    assert.match(sql, /city, state, country,/, `${latest} inserts the location columns`);
});

test('ensure-profile also carries the country for any profile it creates', () => {
    assert.match(read('pages/api/auth/ensure-profile.js'), /country: metadata\?\.country \|\| null/);
});

test('a public profile shows the country for players outside the US', () => {
    const page = read('pages/hub/user/[username].js');
    assert.match(page, /const profileCountry = isUsCountry \? null : profile\.country;/);
    assert.match(page, /profileCountry \? `, \$\{profileCountry\}` : ''/, 'Lives In shows the country');
});
