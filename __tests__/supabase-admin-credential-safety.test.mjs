import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN_SOURCE = fs.readFileSync(path.join(ROOT, 'lib/supabaseAdmin.ts'), 'utf8');

test('the unreferenced privileged user-dump script stays retired', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'get_user.js')), false);
});

test('supabase admin helper fails closed instead of falling back to anon credentials', () => {
  assert.match(ADMIN_SOURCE, /const key = process\.env\.SUPABASE_SERVICE_ROLE_KEY;/);
  assert.match(ADMIN_SOURCE, /SUPABASE_SERVICE_ROLE_KEY is required/);
  assert.doesNotMatch(ADMIN_SOURCE, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
});
