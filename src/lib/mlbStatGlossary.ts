// Central MLB stat glossary — plain-English descriptions for every abbreviation shown
// across the Players, Teams, and player-detail pages. Used to render hover/long-press
// tooltips so users always know what a stat means. Keyed by the UPPER-cased display
// label (look up via glossaryFor()).

export const STAT_GLOSSARY: Record<string, string> = {
  // ---- Hitting: standard ----
  AVG: 'Batting Average — hits divided by at-bats.',
  HR: 'Home Runs.',
  RBI: 'Runs Batted In.',
  R: 'Runs scored.',
  H: 'Hits.',
  '2B': 'Doubles.',
  '3B': 'Triples.',
  BB: 'Walks (bases on balls).',
  SO: 'Strikeouts.',
  K: 'Strikeouts.',
  SB: 'Stolen Bases.',
  CS: 'Caught Stealing.',
  PA: 'Plate Appearances — total trips to the plate (sample size).',
  AB: 'At-Bats.',
  HBP: 'Hit By Pitch.',
  // ---- Hitting: rate / advanced ----
  OBP: 'On-Base Percentage — how often a batter reaches base.',
  SLG: 'Slugging Percentage — total bases per at-bat.',
  OPS: 'On-Base Plus Slugging (OBP + SLG).',
  ISO: 'Isolated Power — extra bases per at-bat (SLG minus AVG).',
  'wRC+': 'Weighted Runs Created Plus — total offense vs league average (100 = average, higher is better).',
  wOBA: 'Weighted On-Base Average — overall offensive value per plate appearance.',
  xwOBA: 'Expected wOBA based on quality of contact (exit velocity & launch angle).',
  xAVG: 'Expected Batting Average from quality of contact.',
  xSLG: 'Expected Slugging from quality of contact.',
  BABIP: 'Batting Average on Balls In Play.',
  'BB%': 'Walk rate — walks per plate appearance.',
  'K%': 'Strikeout rate — strikeouts per plate appearance.',
  'HR/FB': 'Home runs per fly ball.',
  WAR: 'Wins Above Replacement — total value vs a replacement-level player.',
  // ---- Statcast / batted ball ----
  'Barrel%': 'Share of batted balls hit at the optimal exit velocity and launch angle.',
  EV: 'Average exit velocity off the bat (mph).',
  maxEV: 'Hardest-hit ball of the season (mph).',
  'HardHit%': 'Share of batted balls hit 95+ mph.',
  'GB%': 'Ground-ball rate.',
  'FB%': 'Fly-ball rate.',
  'LD%': 'Line-drive rate.',
  'Pull%': 'Share of batted balls pulled.',
  'Cent%': 'Share of batted balls hit up the middle.',
  'Oppo%': 'Share of batted balls hit to the opposite field.',
  'SwStr%': 'Swinging-strike rate.',
  'Contact%': 'Contact rate on swings.',
  'O-Swing%': 'Chase rate — swings at pitches outside the zone.',
  Spd: 'Speed Score — a measure of baserunning speed.',
  BsR: 'Base Running runs above average.',
  LA: 'Average launch angle off the bat (degrees).',
  Clutch: 'Performance in high-leverage situations vs a context-neutral baseline.',
  'Swing%': 'Share of all pitches the batter swings at.',
  'Z-Swing%': 'Swing rate on pitches inside the strike zone.',
  'Zone%': 'Share of pitches seen that were inside the strike zone.',
  'F-Strike%': 'Share of plate appearances where the first pitch was a strike.',
  // ---- Pitching: standard ----
  W: 'Wins.',
  L: 'Losses.',
  SV: 'Saves.',
  HLD: 'Holds.',
  BS: 'Blown Saves.',
  IP: 'Innings Pitched.',
  GS: 'Games Started.',
  G: 'Games (appearances).',
  QS: 'Quality Starts — 6+ innings, 3 or fewer earned runs.',
  CG: 'Complete Games.',
  ShO: 'Shutouts.',
  ER: 'Earned Runs.',
  TBF: 'Total Batters Faced.',
  BF: 'Batters Faced.',
  // ---- Pitching: rate / advanced ----
  ERA: 'Earned Run Average — earned runs allowed per 9 innings.',
  WHIP: 'Walks + Hits per Inning Pitched.',
  FIP: 'Fielding Independent Pitching — ERA estimate from K, BB, HBP and HR only (lower is better).',
  xFIP: 'Expected FIP, normalizing home-run rate to league average.',
  SIERA: 'Skill-Interactive ERA — accounts for balls in play and batted-ball type.',
  xERA: 'Expected ERA from quality of contact.',
  kwERA: 'Strikeout/Walk-based ERA estimate.',
  'K/9': 'Strikeouts per 9 innings.',
  'BB/9': 'Walks per 9 innings.',
  'HR/9': 'Home runs allowed per 9 innings.',
  'H/9': 'Hits allowed per 9 innings.',
  'K/BB': 'Strikeout-to-walk ratio.',
  'K-BB%': 'Strikeout rate minus walk rate.',
  'LOB%': 'Left-On-Base rate — share of baserunners stranded.',
  'Stuff+': 'Pitch-quality model (100 = average, higher is better).',
  'Location+': 'Pitch-location model (100 = average).',
  'Pitching+': 'Combined stuff + location model (100 = average).',
  // ---- Team ----
  'R/G': 'Runs scored per game.',
  'RA/G': 'Runs allowed per game.',
  GB: 'Games Behind the division leader.',
  PCT: 'Winning percentage.',
  L10: 'Record over the last 10 games.',
  STRK: 'Current win/loss streak.',
  DIFF: 'Run differential (runs scored minus runs allowed).',
  // ---- Matchup ----
  'vs SP': "The hitter's career numbers against today's opposing starting pitcher.",
  'vs Team': "The pitcher's career numbers against today's opposing team.",
};

// Look up a description tolerant of case / trailing punctuation differences.
export function glossaryFor(label: string): string | undefined {
  if (!label) return undefined;
  if (STAT_GLOSSARY[label]) return STAT_GLOSSARY[label];
  const upper = label.toUpperCase();
  const hit = Object.keys(STAT_GLOSSARY).find((k) => k.toUpperCase() === upper);
  return hit ? STAT_GLOSSARY[hit] : undefined;
}
