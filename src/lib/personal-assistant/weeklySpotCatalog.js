export const CURATED_WEEKLY_SPOTS = [
  { id: 'week_default_1', scenario_json: { heroHand: { card1: 'Ah', card2: 'Kd' }, heroPosition: 'CO', heroStack: 100, gameType: 'cash', board: { flop: ['Ks', '7h', '2c'], turn: null, river: null }, villains: [{ position: 'BB', archetype: { id: 'calling_station', name: 'Calling Station' }, stack: 100 }], actionHistory: [{ position: 'CO', action: 'bet_66', label: 'Bet 66%' }] }, correct_action: 'Bet 66%', description: 'Top pair, top kicker vs a calling station. How thin should you value bet?' },
  { id: 'week_default_2', scenario_json: { heroHand: { card1: '9s', card2: '8s' }, heroPosition: 'BTN', heroStack: 100, gameType: 'cash', board: { flop: ['7h', '6d', '2c'], turn: null, river: null }, villains: [{ position: 'BB', archetype: { id: 'gto_neutral', name: 'GTO Neutral' }, stack: 100 }], actionHistory: [] }, correct_action: 'Bet 33%', description: 'Open-ended straight draw with backdoor flush. C-bet or check back?' },
  { id: 'week_default_3', scenario_json: { heroHand: { card1: 'Qh', card2: 'Jh' }, heroPosition: 'BTN', heroStack: 100, gameType: 'tournament', board: { flop: ['Th', '4h', '2d'], turn: null, river: null }, villains: [{ position: 'BB', archetype: { id: 'nit', name: 'Nit' }, stack: 80 }], actionHistory: [{ position: 'BB', action: 'check', label: 'Check' }] }, correct_action: 'Bet 50%', description: 'Flush draw + two overs on a dry board. Semi-bluff or slow play?' },
];

export function curatedWeeklySpotById(id) {
  return CURATED_WEEKLY_SPOTS.find((spot) => spot.id === id) || null;
}
