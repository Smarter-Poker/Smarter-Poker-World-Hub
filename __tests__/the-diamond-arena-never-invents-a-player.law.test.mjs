/**
 * THE DIAMOND ARENA NEVER INVENTS A PLAYER, A RESULT, OR A PRICE.
 *
 * Five pages under /hub/diamond-arena shipped hard-coded data that rendered as
 * real, in a currency players actually own, for a room that has never opened:
 *
 *   - schedule.js   a "Daily Diamond Freeroll" and a "Sunday Million" with a
 *                   50,000 prize pool, a 100-Diamond buy-in and "234/500
 *                   registered", each beside a Register button with no onClick.
 *                   Fixed earlier: a quote for something nobody can sell.
 *   - leaderboard.js  three invented names - PokerPro2024 on 147,832 diamonds,
 *                   DiamondKing, SharkMaster - with game counts and win rates,
 *                   plus a realtime subscription to `diamond_arena_scores`,
 *                   WHICH IS NOT A TABLE ON THIS DATABASE.
 *   - history.js    two sessions dated with `new Date()` so they always looked
 *                   like today and yesterday: +2,450 over 127 hands, +5,000
 *                   over 89. It rendered as the READER'S OWN history.
 *   - stats.js      1,247 games, 147,832 diamonds won, a 68 percent win rate -
 *                   the same 147,832 as the leaderboard's top row, which is how
 *                   invented numbers start to look corroborated.
 *
 * The Diamond Arena's club row was created on 2026-09-08 (`clubs.is_platform`)
 * and holds no tables, no tournaments and no diamonds. Every true figure is
 * zero, and zero is what these pages must show until real ones exist.
 *
 * This law does not forbid rendering data. It forbids rendering data that came
 * from nowhere.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const DIR = join(process.cwd(), 'pages', 'hub', 'diamond-arena');
const pages = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.js')) : [];
const read = (f) => readFileSync(join(DIR, f), 'utf8');

/** The exact figures that shipped. If any comes back, so has the defect. */
const INVENTED = [
  'PokerPro2024',
  'DiamondKing',
  'SharkMaster',
  '147832',
  '132451',
  '118923',
  'Daily Diamond Freeroll',
  'Sunday Million',
];

describe('the diamond arena never invents a player', () => {
  it('has pages to check', () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  for (const f of pages) {
    it(`${f} carries none of the invented figures`, () => {
      const src = read(f);
      // strip comments: the pages explain what they used to show, by name
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const needle of INVENTED) {
        expect(code).not.toContain(needle);
      }
    });
  }

  it('subscribes to no table that does not exist', () => {
    for (const f of pages) {
      const code = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      expect(code).not.toContain('diamond_arena_scores');
    }
  });

  it('imports no hook it does not call (World Hub rule 2, breaks SSG)', () => {
    for (const f of pages) {
      const src = read(f);
      const imported = [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'react'/g)]
        .flatMap((m) => m[1].split(',').map((s) => s.trim()))
        .filter((s) => s.startsWith('use'));
      for (const hook of imported) {
        expect(new RegExp(`${hook}\\s*\\(`).test(src)).toBe(true);
      }
    }
  });

  it('says plainly that the arena has not opened where a list is empty', () => {
    for (const f of ['leaderboard.js', 'history.js']) {
      if (!pages.includes(f)) continue;
      expect(read(f)).toContain('Has Not Opened');
    }
  });
});
