// Exact heads-up Hold'em outcomes over every five-card board for the listed suits.
const percent = (probability) => (100 * probability).toFixed(1) + '%';

export const PREFLOP_MATCHUPS = [
  ['Overpair Vs Underpair', 'A♠ A♥', 'K♦ K♣', 1388072, 317694, 6538],
  ['Overpair Vs Two Undercards', 'Q♠ Q♥', '8♦ 7♦', 1327573, 379204, 5527],
  ['Two Overcards Vs Pocket Pair (Coinflip)', 'A♠ K♠', 'Q♦ Q♣', 787966, 917606, 6732],
  ['Two Overcards Vs Pocket Pair (Offsuit)', 'A♠ K♥', '9♦ 9♣', 756208, 950774, 5322],
  ['Dominated Kicker (Higher Ace Vs Lower Ace)', 'A♠ K♥', 'A♦ Q♣', 1228082, 405624, 78598],
  ['Pocket Pair Vs Two Overcards', 'J♠ J♥', 'A♦ Q♦', 920695, 785191, 6418],
  ['Suited Connectors Vs Lower Suited Connectors', '10♠ 9♠', '7♦ 6♦', 1061858, 622244, 28202],
].map(([type, h1, h2, wins1, wins2, ties]) => {
  const boards = wins1 + wins2 + ties;
  return { type, h1, h2, e1: percent(wins1 / boards), e2: percent(wins2 / boards), tie: percent(ties / boards) };
});

// Unknown opponent cards. A flopped set picks up three extra outs on a blank turn.
export const DRAW_ODDS = [
  ['Open-Ended Straight Draw', 8, 8],
  ['Flush Draw', 9, 9],
  ['Open-Ended Straight And Flush Draw', 15, 15],
  ['Inside Straight Draw', 4, 4],
  ['Pair Either Overcard', 6, 6],
  ['Set To Full House Or Quads', 7, 10],
].map(([draw, flopOuts, turnOuts]) => ({
  draw,
  outs: flopOuts === turnOuts ? String(flopOuts) : '7 Then 10',
  turn: percent(turnOuts / 46),
  river: percent(1 - (47 - flopOuts) * (46 - turnOuts) / (47 * 46)),
}));
