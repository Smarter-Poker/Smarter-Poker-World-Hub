import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const PAGE = fs.readFileSync('pages/hub/memory-games.js', 'utf8');
const LOCAL_VS = fs.readFileSync('src/games/TournamentModeGame.jsx', 'utf8');

test('Preflop Charts has no paid entry gate or signed-in launch reward promise', () => {
  assert.doesNotMatch(PAGE, /\bGAME_COST\b/);
  assert.doesNotMatch(PAGE, /checkAndDeductDiamonds|DiamondEngine\.deduct\s*\(/);
  assert.doesNotMatch(PAGE, /GameCostPopup|OutOfDiamondsModal|showOutOfDiamonds/);
  assert.doesNotMatch(PAGE, /label:\s*['"]REWARD['"]/);
  assert.match(PAGE, /Free Local Practice \/ No Entry Fee/);
  assert.match(
    PAGE,
    /stats:\s*\[[\s\S]*?\{ label: 'FORMAT', value: '5 Local Rounds' \}[\s\S]*?\{ label: 'SETTLEMENT', value: 'No Account Changes' \}[\s\S]*?\]/
  );
});

test('authenticated economy and entitlement failures fail closed', () => {
  assert.match(PAGE, /const \{ user, initializing: authInitializing \} = useAvatar\(\)/);
  assert.match(
    PAGE,
    /if \(!userId && getAccessToken\(\)\) \{[\s\S]*?throw new Error\('Authenticated identity is unresolved'\)/
  );
  assert.match(PAGE, /const proof = await getHeaderStats\(\{ userId, force: true \}\)/);
  assert.match(
    PAGE,
    /if \(\s*!proof\?\.success \|\|\s*!proof\.profile \|\|\s*!Number\.isFinite\(Number\(proof\.profile\.diamonds\)\)\s*\) \{[\s\S]*?throw new Error\('Authenticated economy proof unavailable'\)/
  );
  assert.doesNotMatch(PAGE, /DiamondEngine\.init\(null\)/);
  assert.match(
    PAGE,
    /catch \(e\) \{[\s\S]*?setDiamondBalance\(null\);[\s\S]*?setIsVIP\(null\);[\s\S]*?setEconomyReady\(false\)/
  );
  assert.match(PAGE, /DiamondEngine=\{economyReady \? DiamondEngine : null\}/);
  assert.match(
    PAGE,
    /if \(isVIP !== true\) \{[\s\S]*?AI Mode Is Unavailable Until VIP Access Is Verified/
  );
});

test('the retired Smart Practice state setter cannot crash a successful launch', () => {
  assert.doesNotMatch(PAGE, /setCoachAnalysis\s*\(/);
  assert.match(
    PAGE,
    /if \(result\.success && result\.scenario\) \{[\s\S]*?setCurrentScenario\(result\.scenario\);[\s\S]*?setMode\('game'\)/
  );
});

test('Local VS is deterministic session practice, never real ranked matchmaking', () => {
  assert.match(LOCAL_VS, /const SIMULATED_COACHES = \[/);
  assert.match(LOCAL_VS, /getSimulatedOpponent\(roundsPlayed\)/);
  assert.match(
    LOCAL_VS,
    /Array\.from\([\s\S]*?TOURNAMENT_CHALLENGES\[\(offset \+ index\) % TOURNAMENT_CHALLENGES\.length\]/
  );
  assert.match(LOCAL_VS, /LOCAL VS PRACTICE/);
  assert.match(
    LOCAL_VS,
    /No Player Search Is Running\. This Browser Is Loading A Scripted Practice Coach\./
  );
  assert.match(
    LOCAL_VS,
    /No Live Opponent, Matchmaking, Account Rank, Leaderboard, Or Diamond Settlement/
  );
  assert.match(LOCAL_VS, /Scores Exist Only In This Run/);
  assert.doesNotMatch(
    LOCAL_VS,
    /localStorage|content_authors|from\(['"]horses['"]\)|calculateElo|getRankTier|playerElo|opponent\.elo|startMatchmaking/
  );
  assert.doesNotMatch(LOCAL_VS, /VS RANKED|FIND MATCH|PLAYERS ONLINE|ELO CHANGE|NEW ELO/);
  assert.doesNotMatch(LOCAL_VS, /DiamondEngine\.award\s*\(/);
});

test('Local VS keeps manual feedback, session-only results, and optional power-ups fail closed', () => {
  assert.match(
    LOCAL_VS,
    /const purchase = await purchasePowerUp\(pu, DiamondEngine\);[\s\S]*?if \(!purchase\.success\) return/
  );
  assert.match(LOCAL_VS, /diamondBalance=\{diamondBalance\}/);
  assert.match(LOCAL_VS, /Correct - You Win This Practice Round/);
  assert.match(LOCAL_VS, /Review This Spot - The Simulated Coach Wins This Round/);
  assert.match(LOCAL_VS, /onClick=\{handleNextRound\}/);
  assert.match(LOCAL_VS, /Settlement['"], value: ['"]Session Only/);
  assert.match(
    LOCAL_VS,
    /setMatchHistory\(prev => \[\.\.\.prev, \{[\s\S]*?accuracy,[\s\S]*?\}\]\)/
  );
});

test('the prior daily-practice honesty contract remains intact', () => {
  assert.match(
    PAGE,
    /This Unsigned Drill Does Not Record Challenge Completion, Streaks, Rankings, Or Diamond\s+Rewards\./
  );
  assert.match(
    PAGE,
    /This Launch Does Not Record Completion, Extend A Streak, Change Rankings,\s+Or Award Diamonds\./
  );
});
