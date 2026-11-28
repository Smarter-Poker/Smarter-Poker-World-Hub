/**
 * Dynamic OpenGraph Tool & Calculator Social Card Generator
 * GET /api/og/tool-card?tool=odds&title=Poker+Odds+Calculator&subtitle=Multiway+Equity+Simulation
 * GET /api/og/tool-card?tool=leak-finder&score=84&leak=Turn+Barrels&bb100=3.4
 * GET /api/og/tool-card?tool=gto-drill&hand=AQs&pos=BTN&action=3-Bet&grade=Optimal
 *
 * Generates an authoritative, branded 1200x630 social card using @vercel/og (Satori)
 * for Smarter.Poker calculators, preflop range matrices, GTO leak scorecards,
 * solver drill cards, and strategy utilities.
 *
 * House style: #SMARTERDESIGN (0px corners, navy/chrome hardware, zero banned
 * gold hexes, zero em/en dashes). Every JSX element MUST have display:'flex'
 * for Satori compatibility.
 */
import { ImageResponse } from '@vercel/og';
import {
  TOOL_OG_PRESETS,
  computeValidatedSolvedSpot,
  buildSolvedSpotOgImageUrl,
} from '../../../src/lib/seo/solvedSpotEngine';
export { buildSolvedSpotOgImageUrl };

export const config = { runtime: 'edge' };

const ALLOWED_POSITIONS = new Set(['UTG', 'UTG+1', 'UTG+2', 'LJ', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB']);

function stripUnsafeText(raw) {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001F\u007F\u2013\u2014]/g, ' ')
    .replace(/[^\w\s.%:+\-\/()'&]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeScoreParam(raw) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim().replace(/%$/, '');
  if (!trimmed || !/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export function sanitizeBb100Param(raw) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim().replace(/bb\/100$/i, '').trim();
  if (!trimmed || !/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const num = Math.abs(Number(trimmed));
  if (!Number.isFinite(num)) return null;
  return Math.min(99.9, Math.round(num * 10) / 10).toFixed(1);
}

export function sanitizeLeakParam(raw) {
  const cleaned = stripUnsafeText(raw);
  if (!cleaned) return 'Zero Major Leaks';
  const normalized =
    /^[a-z0-9-]+$/.test(cleaned) && cleaned.includes('-')
      ? cleaned
          .split('-')
          .filter(Boolean)
          .map((w) => {
            if (/^(gto|mtt|icm|ev|bb|plo4|plo5|nlhe)$/i.test(w)) return w.toUpperCase();
            if (/^3bet$/i.test(w)) return '3-Bet';
            if (/^cbet$/i.test(w)) return 'C-Bet';
            return w.charAt(0).toUpperCase() + w.slice(1);
          })
          .join(' ')
      : cleaned;
  return normalized.slice(0, 40).trim() || 'Zero Major Leaks';
}

export function sanitizeHandParam(raw) {
  const cleaned = String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[^A-Za-z0-9+]/g, '')
    .slice(0, 12);
  if (!cleaned) return 'AQs';
  return cleaned;
}

export function sanitizePosParam(raw) {
  const cleaned = String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/[^A-Za-z0-9+]/g, '')
    .toUpperCase()
    .slice(0, 8);
  if (!cleaned) return 'BTN';
  if (ALLOWED_POSITIONS.has(cleaned)) return cleaned;
  return cleaned.slice(0, 5);
}

export function sanitizeActionParam(raw) {
  const cleaned = stripUnsafeText(raw).slice(0, 24).trim();
  return cleaned || '3-Bet';
}

export function sanitizeGradeParam(raw) {
  const cleaned = stripUnsafeText(raw).slice(0, 24).trim();
  return cleaned || 'Optimal';
}

export function buildToolCardModel(searchParams) {
  const getParam = (key) => {
    if (!searchParams) return null;
    if (typeof searchParams.get === 'function') return searchParams.get(key);
    const val = searchParams[key];
    return Array.isArray(val) ? val[0] : (val ?? null);
  };

  const rawTool = String(getParam('tool') || getParam('preset') || 'tool')
    .trim()
    .toLowerCase();
  const preset = TOOL_OG_PRESETS[rawTool] || null;
  const tool = preset ? preset.tool : rawTool;

  const isLeakFinder =
    tool === 'leak-finder' ||
    (tool === 'gto-leak-finder' &&
      (getParam('score') !== null || getParam('leak') !== null || getParam('bb100') !== null));
  const isGtoDrill = tool === 'gto-drill';

  if (isLeakFinder) {
    const score = sanitizeScoreParam(getParam('score'));
    const hasLeakInput = getParam('leak') !== null && String(getParam('leak')).trim() !== '';
    const leak = hasLeakInput ? sanitizeLeakParam(getParam('leak')) : 'Zero Major Leaks';
    const bb100 = sanitizeBb100Param(getParam('bb100'));

    const subtitleParts = [];
    if (score !== null) subtitleParts.push(`Score: ${score}%`);
    if (hasLeakInput) subtitleParts.push(`Primary Leak: ${leak}`);
    if (bb100 !== null) subtitleParts.push(`-${bb100} BB/100`);
    subtitleParts.push('Beat My Score Free');

    const metrics = [
      {
        label: 'GTO ACCURACY SCORE',
        value: score !== null ? `${score}%` : '5-HAND DIAGNOSTIC',
        accent: score !== null && score >= 80 ? '#34D399' : '#38BDF8',
      },
      {
        label: 'PRIMARY LEAK',
        value: hasLeakInput ? leak : '5 GTO PILLARS',
        accent: '#F2F7FF',
      },
      {
        label: bb100 !== null ? 'EST. BB/100 LEAK' : 'CHALLENGE',
        value: bb100 !== null ? `-${bb100} BB/100` : 'BEAT MY SCORE FREE',
        accent: bb100 !== null && Number(bb100) > 0 ? '#F87171' : '#34D399',
      },
    ];

    return {
      mode: 'leak-finder',
      badge: '60-SECOND GTO LEAK SCORECARD',
      pill: 'BEAT MY SCORE FREE',
      title: 'Smarter.Poker 60-Second GTO Leak Scorecard',
      subtitle: subtitleParts.join(' · '),
      metrics,
      domain: 'Smarter.Poker/Tools/GTO-Leak-Finder',
      accentColor: '#38BDF8',
      pillColor: '#34D399',
    };
  }

  if (isGtoDrill) {
    const hand = sanitizeHandParam(getParam('hand'));
    const pos = sanitizePosParam(getParam('pos'));
    const action = sanitizeActionParam(getParam('action'));
    const grade = sanitizeGradeParam(getParam('grade'));
    const isOptimalGrade = /optimal|elite|solver/i.test(grade);

    const metrics = [
      {
        label: 'HERO SPOT',
        value: `${hand} From ${pos}`,
        accent: '#F2F7FF',
      },
      {
        label: 'OPTIMAL PLAY',
        value: action,
        accent: '#38BDF8',
      },
      {
        label: 'SOLVER GRADE',
        value: grade,
        accent: isOptimalGrade ? '#34D399' : '#86DAFF',
      },
    ];

    return {
      mode: 'gto-drill',
      badge: 'GTO SOLVER DRILL',
      pill: '107 FREE GTO GAMES',
      title: `Smarter.Poker Solver Drill · ${hand} From ${pos}`,
      subtitle: `${grade} Play: ${action} · 100BB 6-Max Solver Verified`,
      metrics,
      domain: 'Smarter.Poker/Hub/Training',
      accentColor: '#38BDF8',
      pillColor: '#34D399',
    };
  }

  const isFreerolls = tool === 'freerolls';
  const isCompare = tool === 'compare';

  const queryObj =
    searchParams && typeof searchParams.entries === 'function'
      ? Object.fromEntries(searchParams.entries())
      : (searchParams && typeof searchParams === 'object' ? searchParams : {});
  const validatedSpot = computeValidatedSolvedSpot(tool, queryObj);

  const defaultTitle = preset
    ? preset.title
    : isFreerolls
      ? 'Five Free Poker Tournaments Every Day'
      : isCompare
        ? 'Free Poker Software & Platform Alternatives'
        : 'Smarter.Poker Strategy Tool';

  const defaultSubtitle = preset
    ? preset.subtitle
    : isFreerolls
      ? 'Daily Free Entry Tournaments • Chip Prizes • Zero Deposit Required'
      : isCompare
        ? 'Compare Free GTO Solvers, Odds Calculators & Freerolls vs. Paid Tools'
        : 'Free Interactive GTO Preflop Charts, Multiway Equity & ICM Calculators';

  const defaultStatLabel = preset
    ? preset.statLabel
    : isFreerolls
      ? 'DAILY PRIZE GUARANTEE'
      : isCompare
        ? 'ANNUAL SUBSCRIPTION COST'
        : 'SIMULATION ENGINE';

  const defaultStatValue = preset
    ? preset.statValue
    : isFreerolls
      ? '5 FREE EVENTS DAILY'
      : isCompare
        ? '$0 (100% FREE)'
        : '100% FREE';

  const rawTitle = preset ? preset.title : (stripUnsafeText(getParam('title')) || defaultTitle);
  const title = rawTitle.slice(0, 96);
  const rawSubtitle = validatedSpot.hasValidatedSpot
    ? validatedSpot.summaryText
    : preset
      ? preset.subtitle
      : (stripUnsafeText(getParam('subtitle')) || defaultSubtitle);
  const subtitle = rawSubtitle.slice(0, 180);

  // Preview results come strictly from validated inputs and maintained calculation logic, never caller-supplied answers.
  const statLabel = validatedSpot.hasValidatedSpot ? validatedSpot.statLabel : defaultStatLabel;
  const statValue = validatedSpot.hasValidatedSpot ? validatedSpot.statValue : defaultStatValue;

  const defaultBadge = preset
    ? preset.badge
    : isFreerolls
      ? 'FIVE FREE DAILY FREEROLLS'
      : isCompare
        ? 'SOFTWARE COMPARISON'
        : tool === 'odds'
          ? 'EQUITY CALCULATOR'
          : tool === 'ranges'
            ? 'GTO PREFLOP MATRIX'
            : tool === 'icm'
              ? 'ICM PAYOUT SOLVER'
              : tool === 'glossary'
                ? 'POKER GLOSSARY'
                : tool === 'about'
                  ? 'ABOUT SMARTER.POKER'
                  : tool === 'embeds'
                    ? 'WEBMASTER EMBEDS'
                    : 'POKER STRATEGY TOOL';

  const badge = (preset ? preset.badge : (stripUnsafeText(getParam('badge')) || defaultBadge))
    .slice(0, 40)
    .toUpperCase();

  return {
    mode: isFreerolls ? 'freerolls' : isCompare ? 'compare' : 'standard',
    badge,
    pill: isFreerolls
      ? 'ZERO DEPOSIT REQUIRED'
      : isCompare
        ? '100% FREE ALTERNATIVES'
        : 'ZERO ACCOUNT SETUP',
    title,
    subtitle,
    metrics: [
      {
        label: statLabel,
        value: statValue,
        accent: isFreerolls ? '#34D399' : '#38BDF8',
      },
    ],
    domain: isFreerolls
      ? 'Smarter.Poker/Freerolls'
      : isCompare
        ? 'Smarter.Poker/Compare'
        : 'Smarter.Poker/Tools',
    accentColor: '#38BDF8',
    pillColor: '#34D399',
  };
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const model = buildToolCardModel(searchParams);

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: 'linear-gradient(135deg, #060d1a 0%, #0b1629 52%, #040914 100%)',
            fontFamily: 'sans-serif',
            padding: '52px 60px',
            position: 'relative',
            border: '2px solid #2b4663',
          }}
        >
          {/* Subtle #SMARTERDESIGN Cyan Top Accent Strip */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: 6,
              background: 'linear-gradient(90deg, #2563eb 0%, #38bdf8 55%, #34d399 100%)',
              display: 'flex',
            }}
          />

          {/* Subtle Corner Radial Glow (Cyan/Emerald, Zero Banned Gold) */}
          <div
            style={{
              position: 'absolute',
              top: -90,
              right: -90,
              width: 380,
              height: 380,
              borderRadius: 190,
              background:
                model.mode === 'freerolls'
                  ? 'radial-gradient(circle, rgba(52,211,153,0.18) 0%, rgba(52,211,153,0) 70%)'
                  : 'radial-gradient(circle, rgba(56,189,248,0.2) 0%, rgba(56,189,248,0) 70%)',
              display: 'flex',
            }}
          />

          {/* Top Bar: Brand + Tool Category Badge + Status Pill */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  fontSize: 26,
                  fontWeight: 900,
                  color: '#F2F7FF',
                  letterSpacing: 2,
                }}
              >
                SMARTER.POKER
              </div>
              <div
                style={{
                  display: 'flex',
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#86DAFF',
                  marginLeft: 16,
                  padding: '6px 12px',
                  borderRadius: 0,
                  background: 'rgba(56,189,248,0.12)',
                  border: '1px solid rgba(56,189,248,0.45)',
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                {model.badge}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                borderRadius: 0,
                background: 'rgba(52,211,153,0.12)',
                border: '1px solid rgba(52,211,153,0.45)',
                color: model.pillColor,
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              {model.pill}
            </div>
          </div>

          {/* Center Hero Content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              marginTop: 10,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: model.mode === 'leak-finder' || model.mode === 'gto-drill' ? 46 : 52,
                fontWeight: 900,
                color: '#F2F7FF',
                lineHeight: 1.12,
                letterSpacing: -0.8,
                maxWidth: 1020,
              }}
            >
              {model.title}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 23,
                fontWeight: 600,
                color: '#BDD0E2',
                lineHeight: 1.4,
                marginTop: 16,
                maxWidth: 1020,
              }}
            >
              {model.subtitle}
            </div>
          </div>

          {/* Bottom Bar: Metric Tiles + Domain */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              width: '100%',
              paddingTop: 22,
              borderTop: '1px solid #2b4663',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              {model.metrics.map((metric, idx) => (
                <div
                  key={`${metric.label}-${idx}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '12px 20px',
                    marginRight: idx < model.metrics.length - 1 ? 14 : 0,
                    borderRadius: 0,
                    background: '#0d192b',
                    border: '1px solid #355270',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 11,
                      fontWeight: 800,
                      color: '#86DAFF',
                      letterSpacing: 1.1,
                      textTransform: 'uppercase',
                    }}
                  >
                    {metric.label}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      fontSize: 22,
                      fontWeight: 900,
                      color: metric.accent,
                      marginTop: 5,
                    }}
                  >
                    {metric.value}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: 19,
                fontWeight: 800,
                color: '#E6EDF3',
                letterSpacing: 0.6,
                paddingBottom: 6,
              }}
            >
              {model.domain}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (err) {
    return new Response('Failed to generate tool social card', { status: 500 });
  }
}
