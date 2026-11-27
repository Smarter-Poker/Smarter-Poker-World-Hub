/**
 * actionEngine.mjs - Legal-Action Engine + Pot Math (2-6 Player Multiway + Heads-Up)
 *
 * Pure state machine over actionHistory supporting 2-6 seats (Hero + 1-5 Villains),
 * per-seat actions (Fold, Check, Call, Bet, Raise, All-In), exact wager sizes
 * (amount / raiseTo) from imported hand histories, running pot, effective stack,
 * active players remaining per street, pot odds, MDF, SPR, and terminal states.
 * Preserves 100% backward compatibility for heads-up callers.
 */

export const ACTION_CATALOG = [
  { id: 'fold', label: 'Fold', tone: 'danger' },
  { id: 'check', label: 'Check', tone: 'neutral' },
  { id: 'call', label: 'Call', tone: 'warn' },
  { id: 'bet_33', label: 'Bet 33%', tone: 'success' },
  { id: 'bet_50', label: 'Bet 50%', tone: 'success' },
  { id: 'bet_66', label: 'Bet 66%', tone: 'success' },
  { id: 'bet_75', label: 'Bet 75%', tone: 'success' },
  { id: 'bet_100', label: 'Bet Pot', tone: 'success' },
  { id: 'bet_150', label: 'Bet 150%', tone: 'success' },
  { id: 'raise', label: 'Raise', tone: 'accent' },
  { id: 'allin', label: 'All-In', tone: 'warn' },
];

const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'];

function round1(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function normalizeMultiwaySeats({
  heroPosition = 'BTN',
  heroStack = 100,
  villainPosition = 'BB',
  villainStack = 100,
  villains = null,
}) {
  const cleanHeroStack = Math.max(0, Number(heroStack) || 0);
  const list = Array.isArray(villains) && villains.length > 0
    ? villains.slice(0, 5)
    : [{ id: 0, position: villainPosition || 'BB', stack: villainStack }];
  const isMultiway = list.length >= 2;

  const players = [
    {
      key: 'hero',
      seatIndex: 0,
      isHero: true,
      isVillain: false,
      name: 'Hero',
      label: `Hero (${heroPosition || 'BTN'})`,
      position: heroPosition || 'BTN',
      startStack: cleanHeroStack,
      invested: 0,
      streetIn: 0,
      folded: false,
      allIn: false,
    },
    ...list.map((v, idx) => {
      const key = isMultiway ? `villain_${idx}` : 'villain';
      const pos = v?.position || villainPosition || 'BB';
      const st = Math.max(0, Number(v?.stack ?? villainStack ?? 100) || 0);
      const name = v?.name || `Villain ${idx + 1}`;
      return {
        key,
        seatIndex: idx + 1,
        villainIndex: idx,
        isHero: false,
        isVillain: true,
        name,
        label: isMultiway ? `V${idx + 1} (${pos})` : `Villain (${pos})`,
        position: pos,
        startStack: st,
        invested: 0,
        streetIn: 0,
        folded: false,
        allIn: false,
      };
    }),
  ];

  return { players, isMultiway };
}

function resolveActorKey(entry, players, heroPosition) {
  if (!entry) return 'hero';
  if (entry.actorKey && players.some((p) => p.key === entry.actorKey)) return entry.actorKey;
  if (entry.actor === 'hero' || entry.isHero === true) return 'hero';
  if (entry.actor && players.some((p) => p.key === entry.actor)) return entry.actor;
  if (typeof entry.seatIndex === 'number' && players[entry.seatIndex]) return players[entry.seatIndex].key;
  if (typeof entry.villainIndex === 'number' && players[entry.villainIndex + 1]) return players[entry.villainIndex + 1].key;
  if (entry.player) {
    const byName = players.find((p) => p.name && p.name.toLowerCase() === String(entry.player).toLowerCase());
    if (byName) return byName.key;
  }
  if (entry.isVillain === true) {
    if (entry.position) {
      const byPos = players.find((p) => p.isVillain && !p.folded && p.position === entry.position)
        || players.find((p) => p.isVillain && p.position === entry.position);
      if (byPos) return byPos.key;
    }
    const firstActiveVillain = players.find((p) => p.isVillain && !p.folded) || players[1];
    return firstActiveVillain ? firstActiveVillain.key : 'villain';
  }
  if (entry.position) {
    if (entry.position === heroPosition) return 'hero';
    const byPos = players.find((p) => !p.folded && p.position === entry.position)
      || players.find((p) => p.position === entry.position);
    if (byPos) return byPos.key;
  }
  return 'hero';
}

function betPctOf(actionId) {
  const m = String(actionId || '').match(/^bet_(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const pct = parseFloat(m[1]);
  return Number.isFinite(pct) && pct > 0 ? pct : null;
}

/**
 * Replay an action line (heads-up OR 2-6 player multiway) and return the full hand state.
 */
export function computeHandState({
  basePot = 1.5, actions = [], heroPosition = 'BTN', villainPosition = 'BB',
  heroStack = 100, villainStack = 100, villains = null, street = 'preflop',
} = {}) {
  const { players, isMultiway } = normalizeMultiwaySeats({
    heroPosition, heroStack, villainPosition, villainStack, villains,
  });
  const byKey = Object.fromEntries(players.map((p) => [p.key, p]));

  const maxVillainStart = Math.max(0, ...players.filter((p) => p.isVillain).map((p) => p.startStack));
  const effective = Math.min(byKey.hero.startStack, maxVillainStart);

  // Heads-up preserves the historical effective-stack cap; multiway tracks each seat's real stack.
  const capFor = (p) => (isMultiway ? p.startStack : effective);
  const remainingOf = (p) => Math.max(0, capFor(p) - p.invested);

  let committed = Math.max(0, Number(basePot) || 0);
  let currentStreet = STREET_ORDER.includes(String(actions?.[0]?.street || '').toLowerCase())
    ? String(actions[0].street).toLowerCase()
    : 'preflop';
  let terminal = null; // 'fold' | 'allin' | null
  let winner = null;
  let lastActorIdx = -1;
  let streetClosed = false;
  let actedThisStreet = new Set();
  const perStreetActiveCounts = { [currentStreet]: players.length };

  const highestStreetBetNow = () => players.reduce((m, p) => Math.max(m, p.streetIn), 0);
  const totalStreetInNow = () => players.reduce((s, p) => s + p.streetIn, 0);

  const closeStreet = () => {
    committed += totalStreetInNow();
    players.forEach((p) => { p.streetIn = 0; });
    actedThisStreet = new Set();
    lastActorIdx = -1;
    streetClosed = false;
  };

  const evaluateTerminalAndClosure = () => {
    const active = players.filter((p) => !p.folded);
    if (active.length <= 1) {
      terminal = 'fold';
      winner = active[0]?.key || null;
      streetClosed = true;
      return;
    }
    const high = highestStreetBetNow();
    const ableToAct = active.filter((p) => !p.allIn && remainingOf(p) > 0.001);
    if (ableToAct.length === 0) {
      terminal = 'allin';
      streetClosed = true;
      return;
    }
    if (ableToAct.length === 1 && ableToAct[0].streetIn + 0.01 >= high) {
      const anyAllIn = active.some((p) => p.allIn || remainingOf(p) <= 0.001);
      if (anyAllIn) {
        terminal = 'allin';
        streetClosed = true;
        return;
      }
    }
    const allMatched = ableToAct.every(
      (p) => actedThisStreet.has(p.key) && p.streetIn + 0.01 >= high,
    );
    if (allMatched && ableToAct.length > 0) {
      streetClosed = true;
    }
  };

  (actions || []).forEach((entry) => {
    if (terminal) return;
    const whoKey = resolveActorKey(entry, players, heroPosition);
    const actor = byKey[whoKey];
    if (!actor || actor.folded) return;

    const entryStreetRaw = String(entry?.street || '').toLowerCase();
    const entryStreet = STREET_ORDER.includes(entryStreetRaw) ? entryStreetRaw : currentStreet;
    if (entryStreet !== currentStreet) {
      closeStreet();
      currentStreet = entryStreet;
    }

    const potNow = committed + totalStreetInNow();
    const highBefore = highestStreetBetNow();
    const toCall = Math.max(0, highBefore - actor.streetIn);
    const id = String(entry?.action || '').toLowerCase();
    const explicitAmount = Number.isFinite(Number(entry?.amount)) && Number(entry.amount) > 0
      ? Number(entry.amount)
      : null;
    const explicitRaiseTo = Number.isFinite(Number(entry?.raiseTo)) && Number(entry.raiseTo) > 0
      ? Number(entry.raiseTo)
      : null;

    const addChips = (amt) => {
      const capped = Math.max(0, Math.min(amt, remainingOf(actor)));
      actor.streetIn += capped;
      actor.invested += capped;
      if (remainingOf(actor) <= 0.001) actor.allIn = true;
      return capped;
    };

    if (id === 'fold') {
      actor.folded = true;
    } else if (id === 'check') {
      actedThisStreet.add(actor.key);
    } else if (id === 'call') {
      if (explicitAmount != null) {
        addChips(explicitAmount);
      } else if (toCall > 0) {
        addChips(toCall);
      }
      actedThisStreet.add(actor.key);
    } else if (id === 'raise') {
      let delta = 0;
      if (explicitAmount != null) {
        // When both explicitAmount (added chips from parser) and explicitRaiseTo exist,
        // explicitAmount accurately reflects preflop blind deductions already accounted for.
        delta = explicitAmount;
      } else if (explicitRaiseTo != null && explicitRaiseTo > actor.streetIn) {
        delta = explicitRaiseTo - actor.streetIn;
      } else {
        const target = highBefore > 0 ? highBefore * 3 : Math.max(potNow * 0.75, 2.5);
        delta = Math.max(target - actor.streetIn, toCall);
      }
      addChips(delta);
      if (actor.streetIn > highBefore + 0.001) {
        actedThisStreet = new Set([actor.key]);
      } else {
        actedThisStreet.add(actor.key);
      }
    } else if (id === 'allin' || entry?.allIn === true) {
      if (explicitAmount != null) {
        addChips(Math.min(explicitAmount, remainingOf(actor)));
      } else if (explicitRaiseTo != null && explicitRaiseTo > actor.streetIn) {
        addChips(Math.min(explicitRaiseTo - actor.streetIn, remainingOf(actor)));
      } else {
        addChips(remainingOf(actor));
      }
      actor.allIn = true;
      if (actor.streetIn > highBefore + 0.001) {
        actedThisStreet = new Set([actor.key]);
      } else {
        actedThisStreet.add(actor.key);
      }
    } else if (id === 'bet' || betPctOf(id) != null) {
      const pct = betPctOf(id);
      const delta = explicitAmount != null
        ? explicitAmount
        : (pct != null ? potNow * (pct / 100) : Math.max(potNow * 0.5, 1));
      addChips(delta);
      if (actor.streetIn > highBefore + 0.001) {
        actedThisStreet = new Set([actor.key]);
      } else {
        actedThisStreet.add(actor.key);
      }
    }

    lastActorIdx = actor.seatIndex;
    perStreetActiveCounts[currentStreet] = players.filter((p) => !p.folded).length;
    evaluateTerminalAndClosure();
  });

  const pot = round1(committed + totalStreetInNow());
  const activePlayersList = players.filter((p) => !p.folded);
  const activePlayerKeys = activePlayersList.map((p) => p.key);
  const foldedPlayerKeys = players.filter((p) => p.folded).map((p) => p.key);
  const ableToAct = activePlayersList.filter((p) => !p.allIn && remainingOf(p) > 0.001);

  let toAct = null;
  if (!terminal && !streetClosed && ableToAct.length > 0) {
    if (lastActorIdx < 0) {
      toAct = ableToAct[0].key;
    } else {
      for (let step = 1; step <= players.length; step += 1) {
        const candidate = players[(lastActorIdx + step) % players.length];
        if (!candidate.folded && !candidate.allIn && remainingOf(candidate) > 0.001) {
          toAct = candidate.key;
          break;
        }
      }
    }
  }

  const highestStreetBet = round1(highestStreetBetNow());
  const whoKey = toAct || (byKey.hero.folded ? (ableToAct[0]?.key || 'hero') : 'hero');
  const whoPlayer = byKey[whoKey] || byKey.hero;
  const toCall = Math.max(0, round1(highestStreetBetNow() - whoPlayer.streetIn));
  const facingBet = toCall > 0;
  const potOdds = facingBet && pot + toCall > 0 ? Math.round((toCall / (pot + toCall)) * 1000) / 10 : null;
  const mdf = facingBet && pot > 0 ? Math.round((pot / (pot + toCall)) * 1000) / 10 : null;

  const remainingBySeat = {};
  const investedBySeat = {};
  const streetInBySeat = {};
  players.forEach((p) => {
    remainingBySeat[p.key] = round1(remainingOf(p));
    investedBySeat[p.key] = round1(p.invested);
    streetInBySeat[p.key] = round1(p.streetIn);
  });

  const activeVillains = activePlayersList.filter((p) => p.isVillain);
  const deepestVillainRem = activeVillains.length > 0
    ? Math.max(...activeVillains.map((v) => remainingOf(v)))
    : (players[1] ? remainingOf(players[1]) : 0);
  const effectiveRemaining = round1(Math.min(remainingOf(byKey.hero), deepestVillainRem));
  const spr = pot > 0 ? round1(effectiveRemaining / pot) : null;

  const firstVillain = players[1];
  const remaining = {
    ...remainingBySeat,
    hero: remainingBySeat.hero,
    villain: firstVillain ? remainingBySeat[firstVillain.key] : 0,
  };
  const invested = {
    ...investedBySeat,
    hero: investedBySeat.hero,
    villain: firstVillain ? investedBySeat[firstVillain.key] : 0,
  };
  const streetIn = {
    ...streetInBySeat,
    hero: streetInBySeat.hero,
    villain: firstVillain ? streetInBySeat[firstVillain.key] : 0,
  };

  let legal;
  if (terminal) legal = [];
  else if (facingBet) legal = ['fold', 'call', 'raise', 'allin'];
  else legal = ['check', 'bet_33', 'bet_50', 'bet_66', 'bet_75', 'bet_100', 'bet_150', 'allin'];

  return {
    pot, toAct, toCall, facingBet, potOdds, mdf, spr,
    invested, remaining, effective, effectiveRemaining, terminal, winner,
    streetClosed, legal, street: currentStreet || street,
    streetIn, highestStreetBet,
    isMultiway,
    totalPlayers: players.length,
    activePlayers: activePlayerKeys,
    activePlayerCount: activePlayerKeys.length,
    foldedPlayers: foldedPlayerKeys,
    perStreetActiveCounts,
    players: players.map((p) => ({
      key: p.key,
      seatIndex: p.seatIndex,
      villainIndex: p.villainIndex,
      isHero: p.isHero,
      isVillain: p.isVillain,
      name: p.name,
      label: p.label,
      position: p.position,
      startStack: p.startStack,
      invested: round1(p.invested),
      remaining: round1(remainingOf(p)),
      streetIn: round1(p.streetIn),
      folded: p.folded,
      allIn: p.allIn,
    })),
  };
}

/** Legal action ids for a specific actor (hero, villain, or villain_0..4) given current street contributions. */
export function legalActionsFor(handState, who = 'hero') {
  if (!handState || handState.terminal) return [];
  const seat = Array.isArray(handState.players)
    ? handState.players.find((p) => p.key === who)
    : null;
  if (seat && (seat.folded || seat.allIn || seat.remaining <= 0)) return [];

  const streetIn = handState.streetIn || { hero: 0, villain: 0 };
  const highest = Number.isFinite(handState.highestStreetBet)
    ? handState.highestStreetBet
    : Math.max(0, ...Object.values(streetIn).map((v) => Number(v) || 0));
  const actorIn = Number(streetIn[who]) || 0;
  const toCall = Math.max(0, highest - actorIn);
  return toCall > 0
    ? ['fold', 'call', 'raise', 'allin']
    : ['check', 'bet_33', 'bet_50', 'bet_66', 'bet_75', 'bet_100', 'bet_150', 'allin'];
}

/** Convenience wrapper used for the page's pot readout. */
export function potFromActions(basePot, actions, opts = {}) {
  return computeHandState({ basePot, actions, ...opts }).pot;
}
