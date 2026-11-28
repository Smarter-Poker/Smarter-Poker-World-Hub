/**
 * SimpleHandSummary · Everyday-Player Plain-English Hand & Odds Readout
 * ===========================================================================
 * Pure deterministic math summary styled in #SMARTERDESIGN metallic chrome.
 * Surfaces:
 *  - Your Hand Right Now + Outs Counter with 4-color mini suit chips
 *  - Your Win Chance big percentage + toggleable (?) plain-English tip
 *  - Visual "Should I Call?" Odds Comparison Bar when facing a bet
 *  - "What Just Changed?" 1-sentence Turn/River math callout
 *  - Plain-English Stack Depth & Board Safety chips with (?) micro-tips
 *
 * 100% pure combinatorial math. Zero fabricated GTO grades or solver EV.
 */
import React, { useMemo, useState } from 'react';
import { HelpCircle, Sparkles, Shield, Layers, Scale } from 'lucide-react';
import {
  evaluateHeroHandSimple,
  describeStreetDelta,
  formatStakeAmount,
} from '../../lib/sandbox/handEvaluatorSimple.mjs';
import { T, F, S, R, SUITS, SUIT_COLORS, card, pill, numeric as NUM } from './paTokens';

const RANK_VAL_MAP = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

function classifyWinChance(eq) {
  if (!Number.isFinite(eq)) return { label: 'Waiting For Cards', color: T.textMuted, tone: 'neutral' };
  if (eq >= 70) return { label: 'Big Favorite', color: T.success, tone: 'success' };
  if (eq >= 58) return { label: 'Favorite', color: T.success, tone: 'success' };
  if (eq >= 51) return { label: 'Slight Edge', color: T.accent, tone: 'accent' };
  if (eq >= 46) return { label: 'Coin Flip', color: T.accent, tone: 'accent' };
  if (eq >= 30) return { label: 'Underdog', color: T.danger, tone: 'danger' };
  return { label: 'Long Shot', color: T.danger, tone: 'danger' };
}

function classifyStackDepth(heroStack, pot) {
  const stackNum = Number(heroStack) || 0;
  const potNum = Math.max(1, Number(pot) || 1);
  const spr = stackNum / potNum;
  if (stackNum <= 25 || spr <= 3) {
    return {
      label: 'Short Stack',
      tone: 'warn',
      tip: 'Short Stacks Leave Little Room For Later Streets, So All-In Decisions Come Quickly.',
    };
  }
  if (stackNum <= 65 || spr <= 8) {
    return {
      label: 'Medium Stacks',
      tone: 'accent',
      tip: 'Medium Stacks Give Room For One Or Two Streets Of Betting Before Stacks Go In.',
    };
  }
  return {
    label: 'Deep Stacks',
    tone: 'success',
    tip: 'Deep Stacks Leave Plenty Of Chips Behind For Turn And River Decisions.',
  };
}

function classifyBoardSafety(boardCards) {
  const clean = (Array.isArray(boardCards) ? boardCards : []).filter((c) => typeof c === 'string' && c.length >= 2);
  if (clean.length < 3) {
    return {
      label: 'Preflop Spot',
      tone: 'neutral',
      tip: 'No Community Cards Are Out Yet. Tap The Felt Or Deal Next Street To See A Flop.',
    };
  }

  const rankCounts = {};
  const suitCounts = {};
  const vals = [];
  for (const tok of clean) {
    const r = tok[0].toUpperCase();
    const s = tok[tok.length - 1].toLowerCase();
    const v = RANK_VAL_MAP[r];
    if (!v) continue;
    rankCounts[v] = (rankCounts[v] || 0) + 1;
    suitCounts[s] = (suitCounts[s] || 0) + 1;
    vals.push(v);
  }

  const hasPair = Object.values(rankCounts).some((n) => n >= 2);
  if (hasPair) {
    return {
      label: 'Paired Board',
      tone: 'warn',
      tip: 'A Paired Board Means Full Houses And Three Of A Kind Are Possible.',
    };
  }

  const maxSuit = Math.max(0, ...Object.values(suitCounts));
  const uniqueVals = [...new Set(vals)].sort((a, b) => a - b);
  let connected = false;
  for (let i = 0; i <= uniqueVals.length - 3; i += 1) {
    if (uniqueVals[i + 2] - uniqueVals[i] <= 4) connected = true;
  }

  if (maxSuit >= 3 || (maxSuit >= 2 && connected) || connected) {
    return {
      label: 'Draw Heavy',
      tone: 'accent',
      tip: 'Suited Or Connected Board Cards Mean Flush And Straight Draws Are Very Likely.',
    };
  }

  return {
    label: 'Safe Board',
    tone: 'success',
    tip: 'Unpaired Rainbow Cards With Few Straight Draws Help Strong Made Hands Hold Up.',
  };
}

function MiniCardChip({ cardCode }) {
  const rank = cardCode?.[0]?.toUpperCase() || '?';
  const suitKey = cardCode?.[cardCode.length - 1]?.toLowerCase() || 's';
  const suitChar = SUITS[suitKey] || '';
  const color = SUIT_COLORS[suitKey] || T.text;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: '2px 6px',
        borderRadius: R.sm,
        background: 'rgba(8, 19, 34, 0.92)',
        border: `1px solid ${color}55`,
        color,
        fontSize: F.caption,
        fontWeight: 800,
        lineHeight: 1.2,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <span>{rank === 'T' ? '10' : rank}</span>
      <span aria-hidden="true">{suitChar}</span>
    </span>
  );
}

export default function SimpleHandSummary({
  heroCards = [],
  boardCards = [],
  equity = null,
  prevEquity = null,
  lastDealtCard = null,
  facingBet = 0,
  potOdds = null,
  pot = 0,
  heroStack = 100,
  stakesDisplay = 'bb',
  simpleMode = true,
}) {
  const [openTip, setOpenTip] = useState(null);

  const handEval = useMemo(
    () => evaluateHeroHandSimple(heroCards, boardCards),
    [heroCards, boardCards],
  );

  const equityNum = equity != null && Number.isFinite(Number(equity)) ? Number(equity) : null;
  const winMeta = useMemo(() => classifyWinChance(equityNum), [equityNum]);
  const stackMeta = useMemo(() => classifyStackDepth(heroStack, pot), [heroStack, pot]);
  const boardMeta = useMemo(() => classifyBoardSafety(boardCards), [boardCards]);

  const facingNum = Math.max(0, Number(facingBet) || 0);
  const potOddsNum = potOdds != null && Number.isFinite(Number(potOdds)) ? Number(potOdds) : null;
  const showOddsBar = facingNum > 0 && potOddsNum != null;

  const oddsEdge = showOddsBar && equityNum != null
    ? Math.round((equityNum - potOddsNum) * 10) / 10
    : null;
  const isGoodDirectCall = oddsEdge != null && oddsEdge >= 0;

  const streetDeltaText = useMemo(() => {
    if (!lastDealtCard || !Array.isArray(boardCards) || boardCards.length < 4) return null;
    return describeStreetDelta({
      prevEquity,
      currEquity: equityNum,
      newCard: lastDealtCard,
      handEval,
      boardCards,
    });
  }, [lastDealtCard, boardCards, prevEquity, equityNum, handEval]);

  const draws = handEval.draws || { outs: 0, drawLabels: [], turnPct: 0, riverPct: 0, outCards: [] };
  const hasDrawOuts = draws.outs > 0 && Array.isArray(boardCards) && (boardCards.length === 3 || boardCards.length === 4);
  const drawHitPct = Math.round(boardCards.length === 3 ? draws.riverPct : draws.turnPct);
  const drawHorizon = boardCards.length === 3 ? 'By River' : 'On River';

  const toggleTip = (key) => {
    setOpenTip((prev) => (prev === key ? null : key));
  };

  const heroEquityWidth = equityNum != null ? Math.max(4, Math.min(100, Math.round(equityNum))) : 0;
  const potOddsWidth = potOddsNum != null ? Math.max(4, Math.min(100, Math.round(potOddsNum))) : 0;

  return (
    <section
      aria-label="Simple Hand Summary"
      data-simple-hand-summary="true"
      data-simple-mode={simpleMode ? 'true' : 'false'}
      style={{
        ...card,
        display: 'flex',
        flexDirection: 'column',
        gap: S.md,
      }}
    >
      {/* Top Row: Your Hand Right Now + Your Win Chance */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: S.sm,
        }}
      >
        {/* Your Hand Right Now */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: `${S.sm}px ${S.md}px`,
            borderRadius: R.sm,
            background: 'rgba(6, 17, 30, 0.86)',
            border: '1px solid rgba(174, 192, 208, 0.28)',
          }}
        >
          <span
            style={{
              fontSize: F.caption,
              fontWeight: 700,
              color: T.textDim,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Your Hand Right Now
          </span>
          <span
            data-simple-hand-rank="true"
            style={{
              fontSize: F.h3,
              fontWeight: 800,
              color: T.text,
              lineHeight: 1.25,
            }}
          >
            {handEval.rankLabel}
          </span>
          <span
            style={{
              fontSize: F.caption,
              fontWeight: 600,
              color: T.textMuted,
              lineHeight: 1.3,
            }}
          >
            {handEval.detailLabel}
          </span>
        </div>

        {/* Your Win Chance */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: `${S.sm}px ${S.md}px`,
            borderRadius: R.sm,
            background: 'rgba(6, 17, 30, 0.86)',
            border: `1px solid ${winMeta.color}44`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
            <span
              style={{
                fontSize: F.caption,
                fontWeight: 700,
                color: T.textDim,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Your Win Chance
            </span>
            <button
              type="button"
              onClick={() => toggleTip('equity')}
              aria-expanded={openTip === 'equity'}
              aria-label="Explain Your Win Chance"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 28,
                minHeight: 28,
                padding: '0 6px',
                borderRadius: R.pill,
                background: openTip === 'equity' ? T.accentSoft : 'rgba(19, 37, 58, 0.9)',
                border: `1px solid ${openTip === 'equity' ? T.accent : 'rgba(174, 192, 208, 0.34)'}`,
                color: T.accent,
                fontSize: F.caption,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              <HelpCircle size={13} aria-hidden="true" />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span
              data-simple-win-chance="true"
              style={{
                ...NUM,
                fontSize: F.h1,
                fontWeight: 900,
                color: winMeta.color,
              }}
            >
              {equityNum != null ? `${Math.round(equityNum)}%` : 'Ready'}
            </span>
            <span
              style={{
                fontSize: F.label,
                fontWeight: 800,
                color: winMeta.color,
              }}
            >
              {equityNum != null ? `· ${winMeta.label}` : 'Select Cards'}
            </span>
          </div>
        </div>
      </div>

      {/* Toggleable Win Chance Explainer */}
      {openTip === 'equity' && (
        <div
          role="note"
          style={{
            padding: `${S.sm}px ${S.md}px`,
            borderRadius: R.sm,
            background: 'rgba(8, 124, 250, 0.14)',
            border: '1px solid rgba(86, 216, 255, 0.38)',
            color: T.text,
            fontSize: F.caption,
            fontWeight: 600,
            lineHeight: 1.45,
          }}
        >
          Your Win Chance Shows How Often Your Cards Win Against Your Opponent’s Range If All Remaining Cards Are Dealt.
        </div>
      )}

      {/* Outs Counter When Drawing */}
      {hasDrawOuts && (
        <div
          data-simple-outs-counter="true"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: S.xs,
            padding: `${S.sm}px ${S.md}px`,
            borderRadius: R.sm,
            background: 'rgba(8, 124, 250, 0.12)',
            border: '1px solid rgba(86, 216, 255, 0.38)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: F.label, fontWeight: 800, color: T.accent }}>
              <Sparkles size={14} aria-hidden="true" />
              <span>{draws.drawLabels.join(' + ')}</span>
            </span>
            <span
              style={{
                ...pill('accent'),
                ...NUM,
              }}
            >
              {`${draws.outs} Outs · ~${drawHitPct}% ${drawHorizon}`}
            </span>
          </div>
          {draws.outCards.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 2 }}>
              <span style={{ fontSize: F.caption, fontWeight: 700, color: T.textDim, marginRight: 2 }}>
                Cards That Help:
              </span>
              {draws.outCards.slice(0, 9).map((code) => (
                <MiniCardChip key={code} cardCode={code} />
              ))}
              {draws.outCards.length > 9 && (
                <span style={{ fontSize: F.caption, fontWeight: 700, color: T.textMuted }}>
                  {`+${draws.outCards.length - 9} More`}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Visual "Should I Call?" Odds Comparison Bar */}
      {showOddsBar && (
        <div
          data-simple-odds-bar="true"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: S.sm,
            padding: `${S.sm}px ${S.md}px`,
            borderRadius: R.sm,
            background: 'rgba(6, 17, 30, 0.92)',
            border: `1px solid ${isGoodDirectCall ? 'rgba(77, 224, 165, 0.48)' : 'rgba(255, 107, 122, 0.48)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: F.label, fontWeight: 800, color: T.text }}>
              <Scale size={14} color={T.accent} aria-hidden="true" />
              <span>Should I Call?</span>
            </span>
            <span style={{ fontSize: F.caption, fontWeight: 700, color: T.textMuted, ...NUM }}>
              {`Call ${formatStakeAmount(facingNum, stakesDisplay)} Into ${formatStakeAmount(pot, stakesDisplay)} Pot`}
            </span>
          </div>

          {/* Side-By-Side Comparison Bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: F.caption, fontWeight: 700 }}>
                <span style={{ color: T.text }}>Your Win Chance</span>
                <span style={{ color: T.success, ...NUM }}>
                  {equityNum != null ? `${Math.round(equityNum)}%` : 'Calculating'}
                </span>
              </div>
              <div style={{ height: 10, borderRadius: R.pill, background: 'rgba(174, 192, 208, 0.16)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${heroEquityWidth}%`,
                    height: '100%',
                    borderRadius: R.pill,
                    background: 'linear-gradient(90deg, #16a34a, #4DE0A5)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: F.caption, fontWeight: 700 }}>
                <span style={{ color: T.textMuted }}>Win Chance Needed To Call</span>
                <span style={{ color: T.accent, ...NUM }}>{`${Math.round(potOddsNum)}%`}</span>
              </div>
              <div style={{ height: 10, borderRadius: R.pill, background: 'rgba(174, 192, 208, 0.16)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${potOddsWidth}%`,
                    height: '100%',
                    borderRadius: R.pill,
                    background: 'linear-gradient(90deg, #087CFA, #56D8FF)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          </div>

          {oddsEdge != null && (
            <div
              style={{
                padding: '6px 10px',
                borderRadius: R.sm,
                background: isGoodDirectCall ? T.successSoft : T.dangerSoft,
                border: `1px solid ${isGoodDirectCall ? 'rgba(77, 224, 165, 0.45)' : 'rgba(255, 107, 122, 0.45)'}`,
                color: isGoodDirectCall ? T.success : T.danger,
                fontSize: F.caption,
                fontWeight: 800,
                lineHeight: 1.35,
              }}
            >
              {isGoodDirectCall
                ? `Good Odds To Call (+${Math.round(oddsEdge)}% Math Edge)`
                : 'Below Direct Pot Odds (Needs Fold Equity Or Implied Odds)'}
            </div>
          )}
        </div>
      )}

      {/* "What Just Changed?" Turn / River Math Callout */}
      {streetDeltaText && (
        <div
          data-what-changed="true"
          style={{
            padding: `${S.sm}px ${S.md}px`,
            borderRadius: R.sm,
            background: 'rgba(13, 31, 52, 0.9)',
            border: '1px solid rgba(99, 231, 255, 0.42)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <span
            style={{
              fontSize: F.caption,
              fontWeight: 800,
              color: T.accent,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            What Just Changed?
          </span>
          <span style={{ fontSize: F.label, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>
            {streetDeltaText}
          </span>
        </div>
      )}

      {/* Plain-English Stack Depth & Board Safety Chips With (?) Micro-Tips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: S.sm, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => toggleTip('stack')}
          aria-expanded={openTip === 'stack'}
          aria-label={`Explain ${stackMeta.label}`}
          style={{
            ...pill(stackMeta.tone),
            minHeight: 34,
            cursor: 'pointer',
          }}
        >
          <Layers size={13} aria-hidden="true" />
          <span>{stackMeta.label}</span>
          <HelpCircle size={12} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => toggleTip('board')}
          aria-expanded={openTip === 'board'}
          aria-label={`Explain ${boardMeta.label}`}
          style={{
            ...pill(boardMeta.tone),
            minHeight: 34,
            cursor: 'pointer',
          }}
        >
          <Shield size={13} aria-hidden="true" />
          <span>{boardMeta.label}</span>
          <HelpCircle size={12} aria-hidden="true" />
        </button>
      </div>

      {(openTip === 'stack' || openTip === 'board') && (
        <div
          role="note"
          style={{
            padding: `${S.sm}px ${S.md}px`,
            borderRadius: R.sm,
            background: 'rgba(13, 29, 46, 0.92)',
            border: '1px solid rgba(174, 192, 208, 0.3)',
            color: T.textMuted,
            fontSize: F.caption,
            fontWeight: 600,
            lineHeight: 1.45,
          }}
        >
          {openTip === 'stack' ? stackMeta.tip : boardMeta.tip}
        </div>
      )}
    </section>
  );
}
