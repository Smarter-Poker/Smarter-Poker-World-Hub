function evValue(ev) {
  const e = Math.min(ev, 25);
  return 100 / (1 + Math.exp(-(e - 2) / 4));
}

function americanToDecimal(a) {
  return 1 + (a > 0 ? a / 100 : 100 / Math.abs(a));
}

function evPct(p, american) {
  const b = americanToDecimal(american) - 1;
  return (p * b - (1 - p)) * 100;
}

function test(pWin, pMarket, american, locked) {
  // Original
  let m = 1.0;
  if (!locked) m *= 0.88;
  const d = Math.abs(pWin - pMarket);
  m *= d <= 0.05 ? 1.0 : d <= 0.1 ? 0.95 : d <= 0.15 ? 0.84 : 0.7;
  if (evPct(pWin, american) > 20) m *= 0.8;
  if (locked && d <= 0.06) m *= 1.04;
  let oldScore = Math.round(evValue(evPct(pWin, american)) * m);

  // New Bayesian shrinkage
  // If unlocked, we trust the market more because lineups can change.
  // If locked, we trust our model a bit more, but still blend.
  const modelWeight = locked ? 0.6 : 0.4; 
  const adjWin = pWin * modelWeight + pMarket * (1 - modelWeight);
  const newEv = evPct(adjWin, american);
  
  let newM = 1.0;
  if (!locked) newM *= 0.88; 
  // still apply a small penalty for extreme disagreement (stale data guard)
  if (d > 0.10) newM *= 0.85;
  if (newEv > 20) newM *= 0.8; // stale line guard
  if (locked && d <= 0.05) newM *= 1.04;

  let newScore = Math.round(evValue(newEv) * newM);
  console.log(`pWin: ${pWin}, pMarket: ${pMarket}, lock: ${locked} => Old: ${oldScore}, New: ${newScore}, newEV: ${newEv.toFixed(1)}%`);
}

test(0.60, 0.60, -150, false); // normal favorite
test(0.60, 0.60, -150, true);  // normal favorite locked
test(0.60, 0.50, -107, false); // ace pitcher, market drops (injury risk)
test(0.60, 0.50, -107, true);  // rookie pitcher confirmed, model stale
