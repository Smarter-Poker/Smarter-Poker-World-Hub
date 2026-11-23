import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readRailOptIn,
  saveProfileAppSettings,
  saveProfileRailOptIn,
} from '../src/lib/hubSettingsSync.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const settingsPageSource = readFileSync(join(ROOT, 'pages/hub/settings.js'), 'utf8');

function createFakeProfilesDb({
  initialSettings = {},
  initialAppSettings = {},
  selectError = null,
  updateError = null,
} = {}) {
  const row = {
    settings: structuredClone(initialSettings),
    app_settings: structuredClone(initialAppSettings),
  };
  const calls = [];

  const db = {
    from(table) {
      assert.equal(table, 'profiles');
      return {
        select(columns) {
          calls.push({ op: 'select', columns });
          return {
            eq(col, val) {
              calls.push({ op: 'select.eq', col, val });
              return {
                async maybeSingle() {
                  if (selectError) return { data: null, error: selectError };
                  return { data: structuredClone(row), error: null };
                },
              };
            },
          };
        },
        update(payload) {
          calls.push({ op: 'update', payload: structuredClone(payload) });
          return {
            async eq(col, val) {
              calls.push({ op: 'update.eq', col, val });
              if (updateError) return { error: updateError };
              if ('settings' in payload) row.settings = structuredClone(payload.settings);
              if ('app_settings' in payload) row.app_settings = structuredClone(payload.app_settings);
              return { error: null };
            },
          };
        },
      };
    },
  };

  return { db, row, calls };
}

test('readRailOptIn is strictly opt-in and accepts boolean true or string true', () => {
  assert.equal(readRailOptIn(null), false);
  assert.equal(readRailOptIn(undefined), false);
  assert.equal(readRailOptIn({}), false);
  assert.equal(readRailOptIn({ rail_opt_in: false }), false);
  assert.equal(readRailOptIn({ rail_opt_in: 'false' }), false);
  assert.equal(readRailOptIn({ rail_opt_in: 1 }), false);
  assert.equal(readRailOptIn({ rail_opt_in: true }), true);
  assert.equal(readRailOptIn({ rail_opt_in: 'true' }), true);
});

test('saveProfileRailOptIn performs read-merge-write on profiles.settings and preserves sibling keys', async () => {
  const { db, row, calls } = createFakeProfilesDb({
    initialSettings: {
      training_sound: true,
      toke_default_venue: 'Bellagio',
    },
  });

  const enableResult = await saveProfileRailOptIn(db, 'user-1', true);
  assert.equal(enableResult.ok, true);
  assert.equal(row.settings.rail_opt_in, true);
  assert.equal(String(row.settings.rail_opt_in), 'true');
  assert.equal(row.settings.training_sound, true);
  assert.equal(row.settings.toke_default_venue, 'Bellagio');
  assert.equal(calls[0].op, 'select');
  assert.equal(calls[0].columns, 'settings');

  const disableResult = await saveProfileRailOptIn(db, 'user-1', false);
  assert.equal(disableResult.ok, true);
  assert.equal(row.settings.rail_opt_in, false);
  assert.equal(row.settings.training_sound, true);
  assert.equal(row.settings.toke_default_venue, 'Bellagio');
});

test('saveProfileRailOptIn aborts safely when SELECT fails without overwriting profiles.settings', async () => {
  const { db, row, calls } = createFakeProfilesDb({
    initialSettings: { training_sound: true, rail_opt_in: true },
    selectError: { message: 'transient timeout' },
  });

  const result = await saveProfileRailOptIn(db, 'user-1', false);
  assert.equal(result.ok, false);
  assert.equal(result.aborted, true);
  assert.equal(calls.some((call) => call.op === 'update'), false, 'must not UPDATE after SELECT failure');
  assert.deepEqual(row.settings, { training_sound: true, rail_opt_in: true });
});

test('saveProfileAppSettings preserves poker_card_presets and other keys via read-merge-write', async () => {
  const presets = [
    { id: 'preset-1', name: 'Big Slick', markup: 'Hand [[sp-card:As]][[sp-card:Kh]]' },
  ];
  const { db, row } = createFakeProfilesDb({
    initialAppSettings: {
      poker_card_presets: presets,
      poker_sound_pack: 'classic',
      display_name_preference: 'real_name',
      showOnlineStatus: true,
    },
  });

  const result = await saveProfileAppSettings(
    db,
    'user-1',
    { showOnlineStatus: false, railOptIn: true },
    ['display_name_preference'],
  );

  assert.equal(result.ok, true);
  assert.deepEqual(row.app_settings.poker_card_presets, presets);
  assert.equal(row.app_settings.poker_sound_pack, 'classic');
  assert.equal(row.app_settings.showOnlineStatus, false);
  assert.equal('display_name_preference' in row.app_settings, false);
  assert.equal('railOptIn' in row.app_settings, false);
});

test('saveProfileAppSettings aborts safely when SELECT fails so poker_card_presets are never clobbered', async () => {
  const presets = [
    { id: 'preset-1', name: 'Aces', markup: 'Hand [[sp-card:As]][[sp-card:Ah]]' },
  ];
  const { db, row, calls } = createFakeProfilesDb({
    initialAppSettings: { poker_card_presets: presets },
    selectError: { message: 'connection reset' },
  });

  const result = await saveProfileAppSettings(db, 'user-1', { showStats: false });
  assert.equal(result.ok, false);
  assert.equal(result.aborted, true);
  assert.equal(calls.some((call) => call.op === 'update'), false, 'must not UPDATE after SELECT failure');
  assert.deepEqual(row.app_settings.poker_card_presets, presets);
});

test('/hub/settings wires Allow Tournament Rail Updates strictly opt-in and uses read-merge-write', () => {
  assert.match(settingsPageSource, /railOptIn:\s*false,/);
  assert.match(settingsPageSource, /\.select\('app_settings, settings'\)/);
  assert.match(settingsPageSource, /readRailOptIn\(profile\.settings\)/);
  assert.match(settingsPageSource, /saveProfileRailOptIn\(supabase,\s*user\.id,\s*nextValue\)/);
  assert.match(settingsPageSource, /saveProfileAppSettings\(supabase,\s*user\.id,\s*\{\s*\[key\]:\s*value\s*\},\s*RETIRED_SETTING_KEYS\)/);
  assert.doesNotMatch(settingsPageSource, /\.update\(\{\s*app_settings:\s*newSettings\s*\}\)/);

  assert.match(settingsPageSource, /label="Allow Tournament Rail Updates"/);
  assert.match(
    settingsPageSource,
    /description="Allow Players In Your Running Tournaments To Share Anonymous Rail Updates About Your Table Stack\. Your Name Is Never Shown\."/,
  );
  assert.match(settingsPageSource, /value=\{settings\.railOptIn\}/);
  assert.match(settingsPageSource, /onChange=\{\(v\) => updateSetting\('railOptIn', v\)\}/);

  const toggleSnippet = settingsPageSource.slice(
    settingsPageSource.indexOf('label="Allow Tournament Rail Updates"'),
    settingsPageSource.indexOf('label="Allow Tournament Rail Updates"') + 360,
  );
  assert.doesNotMatch(toggleSnippet, /\bbots?\b/i, 'rail opt-in UI copy must never mention bots');
  assert.doesNotMatch(toggleSnippet, /[\u2014\u2013]/, 'rail opt-in UI copy must not contain em/en dashes');
});
