/**
 * API: Preflop reference charts.
 *
 * This endpoint intentionally exposes only the exact static corpus that exists
 * in src/config/solverRanges.js: 6-max cash at 100BB. The source file is an
 * authored teaching reference, not a provenance-sealed solver export.
 * Unsupported formats, depths, positions, and nodes fail closed rather than
 * being substituted with a nearby chart.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getAllHands, getCombos, withTiming } from '../../../src/utils/trainingApiUtils';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { RFI, BB_DEFENSE, FOUR_BET, getHandFrequencies } from '../../../src/config/solverRanges';

export const PREFLOP_REFERENCE_CONTRACT = Object.freeze({
  gameType: 'cash_6max',
  stackDepth: 100,
  positionsByScenario: Object.freeze({
    rfi: Object.freeze(['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB']),
    vs3bet: Object.freeze(['UTG', 'CO', 'BTN']),
    bb_defense: Object.freeze(['UTG', 'CO', 'BTN', 'SB']),
  }),
});

const REFERENCE_PROVENANCE = Object.freeze({
  authority: 'authored_reference',
  solverExact: false,
  corpus: 'static_6max_cash_100bb',
  disclosure:
    'Authored 6-max cash 100BB teaching reference. No checksummed solver artifact or solve-tree provenance is attached.',
});

let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  }
  return _supabase;
}

function singleQueryValue(value, fallback = '') {
  if (Array.isArray(value)) return null;
  return value == null || value === '' ? fallback : String(value);
}

function computeRangeStats(freqMap) {
  const allHands = getAllHands();
  let totalCombos = 0;
  let pairCombos = 0;
  let suitedCombos = 0;
  let offsuitCombos = 0;
  let mixedHands = 0;
  let pureHands = 0;

  allHands.forEach((hand) => {
    const freq = freqMap[hand] || 0;
    if (freq <= 0) return;

    const combos = getCombos(hand);
    const weightedCombos = combos * freq;
    totalCombos += weightedCombos;

    if (hand.length === 2) pairCombos += weightedCombos;
    else if (hand.endsWith('s')) suitedCombos += weightedCombos;
    else offsuitCombos += weightedCombos;

    if (freq >= 0.95) pureHands += 1;
    else if (freq > 0.05) mixedHands += 1;
  });

  return {
    totalCombos: Math.round(totalCombos),
    maxCombos: 1326,
    rfiPct: Number(((totalCombos / 1326) * 100).toFixed(1)),
    pairCombos: Math.round(pairCombos),
    suitedCombos: Math.round(suitedCombos),
    offsuitCombos: Math.round(offsuitCombos),
    pureHands,
    mixedHands,
  };
}

function resolveExactSpot(scenario, position) {
  if (scenario === 'rfi') {
    return {
      spotData: RFI[position],
      actions: ['Raise', 'Fold'],
      actionLabels: [
        { label: 'Raise', key: 'raise' },
        { label: 'Fold', key: 'fold' },
      ],
      spotLabel: `${position} First-In RFI`,
    };
  }

  if (scenario === 'vs3bet') {
    return {
      spotData: FOUR_BET[`${position}_vs_3bet`],
      actions: ['4-Bet', 'Call', 'Fold'],
      actionLabels: [
        { label: '4-Bet', key: 'raise' },
        { label: 'Call', key: 'call' },
        { label: 'Fold', key: 'fold' },
      ],
      spotLabel: `${position} Response To 3-Bet`,
    };
  }

  return {
    spotData: BB_DEFENSE[`vs_${position}`],
    actions: ['3-Bet', 'Call', 'Fold'],
    actionLabels: [
      { label: '3-Bet', key: 'raise' },
      { label: 'Call', key: 'call' },
      { label: 'Fold', key: 'fold' },
    ],
    spotLabel: `BB Defense Vs ${position} Open`,
  };
}

function buildGrid(spotData, actionLabels) {
  const gridData = {};
  const nonFoldFrequency = {};

  getAllHands().forEach((hand) => {
    const frequencies = getHandFrequencies(spotData, hand);
    const activeFrequency = Math.max(0, 1 - frequencies.fold);
    nonFoldFrequency[hand] = activeFrequency;

    if (activeFrequency <= 0.005) {
      gridData[hand] = null;
      return;
    }

    gridData[hand] = Object.fromEntries(
      actionLabels.map(({ label, key }) => [
        label,
        Math.round((Number(frequencies[key]) || 0) * 1000) / 10,
      ]),
    );
  });

  return { gridData, nonFoldFrequency };
}

export default async function handler(req, res) {
  try {
    withTiming(res);
    if (!applyRateLimit(req, res, LIMITS.read)) return;

    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'GET only' });
    }

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });

    const { user, error: authError } = await getServerUserWithFallback(req, getSupabase());
    if (authError || !user) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const gameType = singleQueryValue(req.query.gameType, PREFLOP_REFERENCE_CONTRACT.gameType);
    const rawStackDepth = singleQueryValue(
      req.query.stackDepth,
      String(PREFLOP_REFERENCE_CONTRACT.stackDepth),
    );
    const scenario = singleQueryValue(req.query.scenario, 'rfi')?.toLowerCase();
    const position = singleQueryValue(req.query.position, 'BTN')?.toUpperCase();
    const vsPosition = singleQueryValue(req.query.vsPosition, '');
    const stackDepth = Number(rawStackDepth);

    if (gameType !== PREFLOP_REFERENCE_CONTRACT.gameType) {
      return res.status(422).json({
        success: false,
        error: 'Only The 6-Max Cash Reference Corpus Is Available.',
        supportedContract: PREFLOP_REFERENCE_CONTRACT,
      });
    }
    if (!Number.isInteger(stackDepth) || stackDepth !== PREFLOP_REFERENCE_CONTRACT.stackDepth) {
      return res.status(422).json({
        success: false,
        error: 'Only The 100BB Reference Corpus Is Available.',
        supportedContract: PREFLOP_REFERENCE_CONTRACT,
      });
    }
    if (vsPosition) {
      return res.status(422).json({
        success: false,
        error: 'This Reference Contract Uses Position As The Exact Acting Or Opening Seat; VsPosition Is Unsupported.',
      });
    }

    const supportedPositions = PREFLOP_REFERENCE_CONTRACT.positionsByScenario[scenario];
    if (!supportedPositions) {
      return res.status(422).json({
        success: false,
        error: 'Unsupported Reference Scenario.',
        supportedScenarios: Object.keys(PREFLOP_REFERENCE_CONTRACT.positionsByScenario),
      });
    }
    if (!supportedPositions.includes(position)) {
      return res.status(422).json({
        success: false,
        error: `No Exact ${scenario} Reference Exists For ${position || 'That Position'}.`,
        supportedPositions,
      });
    }

    const exactSpot = resolveExactSpot(scenario, position);
    if (!exactSpot.spotData) {
      return res.status(404).json({
        success: false,
        error: 'The Requested Exact Reference Spot Is Not Available.',
      });
    }

    const { gridData, nonFoldFrequency } = buildGrid(
      exactSpot.spotData,
      exactSpot.actionLabels,
    );

    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Vary', 'Authorization');
    return res.status(200).json({
      success: true,
      range: {
        actions: exactSpot.actions,
        gridData,
        stats: computeRangeStats(nonFoldFrequency),
        position,
        scenario,
        gameType,
        stackDepth,
        source: 'authored_reference_6max_cash_100bb',
        spotLabel: exactSpot.spotLabel,
        provenance: REFERENCE_PROVENANCE,
      },
    });
  } catch (error) {
    try {
      reportApiError(error, req);
    } catch (reportingError) {
      const reportingMessage = reportingError?.message || String(reportingError);
      console.warn('[App] Handled exception:', reportingMessage);
    }
    console.warn('[PreflopRanges] Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
