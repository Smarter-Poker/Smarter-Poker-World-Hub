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
  const d = Math.abs(pWin - pMarket);
  
  // Smart Bayesian Shrinkage
  // If the model and market strongly disagree, the market is usually right (injuries, scratches).
  let modelWeight = 0.5;
  if (locked) {
      // If confirmed and there's a big disagreement, it means the model is stale against a late scratch.
      // Trust the market almost entirely.
      if (d > 0.06) modelWeight = 0.1;
      else modelWeight = 0.8; // otherwise model has a good edge
  } else {
      // Unconfirmed: trust market a bit more to avoid phantom edges
      if (d > 0.06) modelWeight = 0.3;
      else modelWeight = 0.6;
  }
  
  const adjWin = pWin * modelWeight + pMarket * (1 - modelWeight);
  const newEv = evPct(adjWin, american);
  
  let newM = 1.0;
  if (!locked) newM *= 0.88; 
  if (newEv > 20) newM *= 0.8; 
  if (locked && d <= 0.05) newM *= 1.04;

  let newScore = Math.round(evValue(newEv) * newM);
  console.log(`pWin: ${pWin}, pMarket: ${pMarket}, lock: ${locked} => Score: ${newScore}, EV: ${newEv.toFixed(1)}%`);
}

console.log("--- Normal Favorite (agree) ---")
test(0.60, 0.60, -150, false); 
test(0.60, 0.60, -150, true);  

console.log("--- Rookie Pitcher Scratch (stale model 60%, market drops to 50%) ---")
test(0.60, 0.50, -107, false); 
test(0.60, 0.50, -107, true);  
