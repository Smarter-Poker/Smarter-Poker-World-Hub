/**
 * THE ADMIN LIABILITY PAGE READS THE LIVE NUMBER, AND DOES NOT CALL IT A BREAKER.
 *
 * `/api/admin/admin/diamond-liability` exists so somebody can open one page and
 * see how much diamond liability the platform has taken on this month. On
 * 2026-09-08 it was reporting **1,210** diamonds issued in September. The real
 * figure was **2,371,393** - wrong by a factor of 1,960, and wrong in the
 * reassuring direction, on the page you open to check for trouble.
 *
 * It read `diamond_platform_budget.spent_diamonds`, which had been a running
 * total until that morning. It stopped being one when `ca_diamond_engine_spend`
 * replaced it: the single row's lock was held to the awarding transaction's
 * commit, which serialised the whole platform and lost 5,861 awards worth
 * 399,948 diamonds in one morning. The column became a frozen baseline. Nothing
 * told the page, so the page kept dividing a dead number by a budget and
 * printing "0.05% used" with a remaining balance beside it.
 *
 * There is a second, quieter error in the same panel. It described itself as
 * "the platform-wide circuit breaker", and ruling 21 had removed the platform
 * budget from every refusal path - Dan: "THERE SHOULDN'T BE A PLATFORM BUDGET ON
 * THINGS LIKE THIS, ONLY A USER BUDGET". A panel that names itself a control it
 * is not teaches whoever reads it that something is being guarded. What actually
 * refuses a player is the per-user daily cap, and the page has to say so.
 *
 * Both are the shape club-arena CLAUDE.md 10.86 is about: a signal that answers
 * confidently when it does not know. So the pins are (1) read the live figure,
 * (2) never the frozen column, (3) an unreadable answer is UNKNOWN and never
 * zero, and (4) say what refuses players, since this does not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
const route = readFileSync(join(root, 'pages/api/admin/diamond-liability.js'), 'utf8');
const config = readFileSync(join(root, 'src/config/diamondRewards.js'), 'utf8');
// Strip comments so a pin cannot be satisfied by prose that merely mentions the thing.
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('the liability page reads the live number', () => {
  const body = code(route);

  it('asks for issuance through the function that sums the live journal', () => {
    expect(body).toContain('fn_ca_diamond_budget_reality');
  });

  it('never reads the frozen baseline column as if it were a running total', () => {
    expect(body).not.toContain('diamond_platform_budget');
    expect(body).not.toMatch(/spent_diamonds/);
  });

  it('reports an unreadable answer as UNKNOWN, never as zero', () => {
    // A missing function or a failed call must not silently render 0 issued.
    expect(route).toMatch(/UNKNOWN, not zero/);
    expect(route.match(/UNKNOWN, not zero/g).length).toBeGreaterThanOrEqual(2);
  });

  it('skips engines with no plan rather than counting them as a zero budget', () => {
    expect(body).toContain('enginesWithoutAPlan');
    expect(body).toMatch(/r\.budgeted !== null/);
  });

  it('says plainly that it refuses nobody, and names what does', () => {
    expect(body).toContain('refusesPlayers: false');
    expect(route).toContain('not a circuit breaker');
    expect(route).toContain('diamond_engine_daily_caps');
  });

  it('surfaces budget lines that are fiction instead of averaging them away', () => {
    expect(body).toContain('ALREADY OVER');
    expect(body).toContain('FUTURE PLAN BELOW');
  });
});

describe('the reward config does not claim a breaker that was removed', () => {
  it('no longer says award_diamonds_v2 returns budget_exhausted', () => {
    expect(config).not.toMatch(/returns reason 'budget_exhausted' for everyone/);
  });

  it('records ruling 21 and why a platform-wide breaker was the wrong shape', () => {
    expect(config).toMatch(/[Rr]uling 21/);
    expect(config).toMatch(/punishes arrival order|refuses the player who\s*\n?\s*\*?\s*happens to earn last/);
  });

  it('warns that the surviving budget_exhausted strings are not evidence it exists', () => {
    expect(config).toContain('deployed code is not a law');
  });

  it('keeps the number, which is still the monthly liability plan', () => {
    expect(config).toContain('export const PLATFORM_MONTHLY_BUDGET = 2500000');
  });
});
