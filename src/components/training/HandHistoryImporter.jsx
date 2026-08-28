/**
 * HAND HISTORY IMPORTER
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Import hand histories from major poker sites and review with solver:
 * - Paste or upload hand history text
 * - Auto-detect site format (PokerStars, GGPoker, WPN, iPoker, 888)
 * - Parse into structured hand objects
 * - Display parsed hands in review-ready format
 * - Tag each decision point with solver recommendation
 * - Highlight mistakes with EV loss estimates
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 */

import React, { useState, useCallback, useMemo } from 'react';
import { getSessionToken } from '../../lib/authUtils';

// ●●● SITE DETECTION PATTERNS ●●●
const SITE_PATTERNS = [
  { id: 'pokerstars', name: 'PokerStars', pattern: /PokerStars|Hand #\d+:/i },
  { id: 'ggpoker', name: 'GGPoker', pattern: /GGPoker|Poker Hand #/i },
  { id: 'wpn', name: 'WPN/ACR', pattern: /WPN|Winning Poker Network|BovadaHand/i },
  { id: 'ipoker', name: 'iPoker', pattern: /iPoker|<session/i },
  { id: '888', name: '888poker', pattern: /888poker|Pacific Poker/i },
  { id: 'partypoker', name: 'partypoker', pattern: /partypoker|PartyPoker/i },
  { id: 'generic', name: 'Generic', pattern: /.*/ },
];

// ●●● HAND PARSER ●●●
function parseHandHistory(text) {
  try {
    const hands = [];
    // Split into individual hands
    const handBlocks = text.split(/(?=PokerStars|GGPoker|Poker Hand #|Hand #\d|Game Hand #|---)/i).filter(b => b.trim().length > 50);

    for (const block of handBlocks) {
      const hand = parseOneHand(block);
      if (hand) hands.push(hand);
    }

    // If no hands parsed with block splitting, try as single hand
    if (hands.length === 0 && text.trim().length > 50) {
      const hand = parseOneHand(text);
      if (hand) hands.push(hand);
    }

    return hands;
  } catch {
    return [];
  }
}

function stableHandId(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `hand_${(hash >>> 0).toString(36)}`;
}

function parseOneHand(block) {
  try {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 5) return null;

    // Extract basic info
    const handId = extractHandId(lines[0]);
    const stakes = extractStakes(block);
    const players = extractPlayers(block);
    const heroName = extractHero(block);
    const heroCards = extractHeroCards(block, heroName);
    const board = extractBoard(block);
    const actions = extractActions(block);
    const potSize = extractPot(block);
    const winner = extractWinner(block);

    if (!heroCards && !board && actions.length === 0) return null;

    return {
      id: handId || stableHandId(block),
      stakes,
      players,
      heroName,
      heroCards,
      board,
      actions,
      potSize,
      winner,
      raw: block.slice(0, 500),
    };
  } catch {
    return null;
  }
}

function extractHandId(line) {
  const m = line.match(/Hand #?(\d+)/i);
  return m ? m[1] : null;
}

function extractStakes(text) {
  const m = text.match(/\$?([\d.]+)\/\$?([\d.]+)/);
  if (m) return { sb: parseFloat(m[1]), bb: parseFloat(m[2]) };
  const m2 = text.match(/([\d,]+)\/([\d,]+)/);
  if (m2) return { sb: parseInt(m2[1].replace(/,/g, '')), bb: parseInt(m2[2].replace(/,/g, '')) };
  return { sb: 0.5, bb: 1 };
}

function extractPlayers(text) {
  const players = [];
  const seatRegex = /Seat (\d+): (.+?) \(\$?([\d,.]+)/gi;
  let m;
  while ((m = seatRegex.exec(text)) !== null) {
    players.push({ seat: parseInt(m[1]), name: m[2].trim(), stack: parseFloat(m[3].replace(/,/g, '')) });
  }
  return players;
}

function extractHero(text) {
  const m = text.match(/Dealt to (.+?) \[/i);
  if (m) return m[1].trim();
  const m2 = text.match(/Hero \[/i);
  if (m2) return 'Hero';
  return 'Hero';
}

function extractHeroCards(text, heroName) {
  const escaped = heroName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = text.match(new RegExp(`Dealt to ${escaped} \\[([^\\]]+)\\]`, 'i'));
  if (m) return m[1].trim();
  const m2 = text.match(/Dealt to .+? \[([^\]]+)\]/i);
  if (m2) return m2[1].trim();
  return null;
}

function extractBoard(text) {
  const boards = [];
  const flopM = text.match(/\*\*\* FLOP \*\*\* \[([^\]]+)\]/i);
  if (flopM) boards.push(...flopM[1].trim().split(/\s+/));
  const turnM = text.match(/\*\*\* TURN \*\*\* .+?\[([^\]]+)\]/i);
  if (turnM) boards.push(turnM[1].trim());
  const riverM = text.match(/\*\*\* RIVER \*\*\* .+?\[([^\]]+)\]/i);
  if (riverM) boards.push(riverM[1].trim());
  return boards.length > 0 ? boards : null;
}

function extractActions(text) {
  const actions = [];
  const actionRegex = /(.+?): (folds|checks|calls|bets|raises|all-in)(?: \$?([\d,.]+))?(?: to \$?([\d,.]+))?/gi;
  let m;
  while ((m = actionRegex.exec(text)) !== null) {
    actions.push({
      player: m[1].trim(),
      action: m[2].toLowerCase(),
      amount: m[4] ? parseFloat(m[4].replace(/,/g, '')) : m[3] ? parseFloat(m[3].replace(/,/g, '')) : 0,
    });
  }
  return actions;
}

function extractPot(text) {
  const m = text.match(/Total pot \$?([\d,.]+)/i);
  if (m) return parseFloat(m[1].replace(/,/g, ''));
  return 0;
}

function extractWinner(text) {
  const m = text.match(/(.+?) collected \$?([\d,.]+)/i);
  if (m) return { name: m[1].trim(), amount: parseFloat(m[2].replace(/,/g, '')) };
  return null;
}

// ●●● CARD DISPLAY HELPER ●●●
function CardDisplay({ cards }) {
  if (!cards) return null;
  const cardList = typeof cards === 'string' ? cards.split(/\s+/) : cards;

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {cardList.map((card, i) => {
        const suit = card.slice(-1);
        const rank = card.slice(0, -1);
        const suitColor = suit === 'h' || suit === 'd' ? '#ef4444' : (suit === 'c' ? '#22c55e' : '#3b82f6');
        const suitSymbol = { h: '\u2665', d: '\u2666', c: '\u2663', s: '\u2660' }[suit] || suit;

        return (
          <span key={i} style={{
            padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.1)',
            color: suitColor, fontSize: 13, fontWeight: 700, fontFamily: 'monospace',
          }}>
            {rank}{suitSymbol}
          </span>
        );
      })}
    </div>
  );
}

// ●●● MAIN COMPONENT ●●●
export default function HandHistoryImporter() {
  const [inputText, setInputText] = useState('');
  const [parsedHands, setParsedHands] = useState([]);
  const [selectedHand, setSelectedHand] = useState(null);
  const [detectedSite, setDetectedSite] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyses, setAnalyses] = useState({});
  const [analysisError, setAnalysisError] = useState('');

  const handleParse = useCallback(async () => {
    if (!inputText.trim()) return;

    // Detect site
    const site = SITE_PATTERNS.find(s => s.pattern.test(inputText));
    setDetectedSite(site);

    const hands = parseHandHistory(inputText);
    setParsedHands(hands);

    if (hands.length > 0) {
      setSelectedHand(0);
      setAnalyzing(true);
      setAnalysisError('');
      try {
        const token = getSessionToken();
        if (!token) throw new Error('Sign in to run the verified solver audit.');
        const response = await fetch('/api/training/audit-hand-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ handHistoryText: inputText }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Solver audit failed');
        const byId = new Map((payload.analyses || []).map(a => [String(a.handId), a]));
        const results = {};
        hands.forEach((hand, i) => {
          const audit = byId.get(String(hand.id));
          if (!audit) return;
          results[i] = {
            decisions: (audit.decisions || []).map(d => ({
              action: d.playerAction,
              solverRecommendation: d.solverAction || 'Not priced',
              solverFrequency: d.selectedFrequency,
              evLoss: d.evLossMeasured ? d.evLoss : null,
              grade: d.solverVerified ? d.classification : 'unpriced',
              solverVerified: d.solverVerified,
            })),
            totalEVLoss: Number(audit.summary?.measuredEVLoss || 0).toFixed(2),
            mistakes: audit.summary?.mistakes || 0,
            verifiedDecisions: audit.summary?.verifiedDecisions || 0,
          };
        });
        setAnalyses(results);
        if (!payload.persisted) setAnalysisError('Analysis completed, but the audit record could not be saved.');
      } catch (error) {
        setAnalyses({});
        setAnalysisError(error?.message || 'Solver audit failed');
      } finally {
        setAnalyzing(false);
      }
    }
  }, [inputText]);

  const handleFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setInputText(ev.target.result);
    };
    reader.readAsText(file);
  }, []);

  const totalEVLoss = useMemo(() => {
    return Object.values(analyses || {}).reduce((sum, a) => sum + parseFloat(a.totalEVLoss || 0), 0).toFixed(2);
  }, [analyses]);

  const totalMistakes = useMemo(() => {
    return Object.values(analyses || {}).reduce((sum, a) => sum + (a.mistakes || 0), 0);
  }, [analyses]);

  const sectionStyle = {
    background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 12, marginBottom: 12,
  };

  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', borderRadius: 12, padding: 20, border: '1px solid rgba(255,255,255,0.06)' }}>
      <h3 style={{ color: '#f1f5f9', fontSize: 18, fontWeight: 700, margin: '0 0 16px 0' }}>
        Hand History Import & Analysis
      </h3>

      {parsedHands.length === 0 ? (
        /* ●●● INPUT MODE ●●● */
        <div>
          <div style={sectionStyle}>
            <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
              Paste hand history text from PokerStars, GGPoker, WPN/ACR, 888poker, partypoker, or iPoker.
              Exact shared-solver auditing currently supports PokerStars, GGPoker, and 888; other formats can still be parsed for replay.
            </div>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={`Paste hand history here...\n\nExample:\nPokerStars Hand #123456789: Hold'em No Limit ($0.50/$1.00)\nTable 'Example' 6-max Seat #1 is the button\nSeat 1: Player1 ($100.00)\n...`}
              style={{
                width: '100%', minHeight: 200, padding: 12, borderRadius: 8,
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#f1f5f9', fontSize: 12, fontFamily: 'monospace', resize: 'vertical',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={handleParse} disabled={!inputText.trim() || analyzing} style={{
              padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: inputText.trim() ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)' : 'rgba(255,255,255,0.06)',
              color: inputText.trim() ? '#fff' : '#475569', fontSize: 14, fontWeight: 700,
              opacity: inputText.trim() ? 1 : 0.5,
            }}>
              {analyzing ? 'Matching Solver Ranges…' : 'Parse & Analyze'}
            </button>

            <label style={{
              padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
              fontSize: 13, fontWeight: 600,
            }}>
              Upload .txt File
              <input type="file" accept=".txt,.log,.hh" onChange={handleFile} style={{ display: 'none' }} />
            </label>

            <div style={{ color: '#64748b', fontSize: 11 }}>
              Solver audit: PokerStars, GGPoker, 888
            </div>
          </div>
          {analysisError && (
            <div role="alert" style={{ marginTop: 12, color: '#fbbf24', fontSize: 12 }}>
              {analysisError}
            </div>
          )}
        </div>
      ) : (
        /* ●●● RESULTS MODE ●●● */
        <div>
          {/* Summary Bar */}
          <div style={{ ...sectionStyle, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            {detectedSite && (
              <div>
                <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Site</div>
                <div style={{ color: '#3b82f6', fontSize: 14, fontWeight: 700 }}>{detectedSite.name}</div>
              </div>
            )}
            <div>
              <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Hands</div>
              <div style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 700 }}>{parsedHands.length}</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Total EV Loss</div>
              <div style={{ color: totalEVLoss > 2 ? '#ef4444' : '#f59e0b', fontSize: 14, fontWeight: 700 }}>{totalEVLoss} bb</div>
            </div>
            <div>
              <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Mistakes</div>
              <div style={{ color: totalMistakes > 3 ? '#ef4444' : '#f59e0b', fontSize: 14, fontWeight: 700 }}>{totalMistakes}</div>
            </div>
            <button onClick={() => { setParsedHands([]); setSelectedHand(null); setAnalyses({}); setAnalysisError(''); }} style={{
              marginLeft: 'auto', padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', color: '#94a3b8', fontSize: 12, fontWeight: 600,
            }}>
              Import More
            </button>
          </div>

          {analysisError && (
            <div role="alert" style={{ ...sectionStyle, color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
              {analysisError} No unverified result was counted as solver evidence.
            </div>
          )}

          <div style={{ display: 'flex', gap: 16 }}>
            {/* Hand List */}
            <div style={{ flex: '0 0 200px', maxHeight: 500, overflowY: 'auto' }}>
              {parsedHands.map((hand, i) => {
                const analysis = analyses[i];
                return (
                  <div key={i} onClick={() => setSelectedHand(i)} style={{
                    padding: '8px 10px', marginBottom: 4, borderRadius: 6, cursor: 'pointer',
                    background: selectedHand === i ? 'rgba(59,130,246,0.2)' : 'rgba(0,0,0,0.15)',
                    border: selectedHand === i ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 600 }}>
                        Hand {i + 1}
                      </span>
                      {analysis && analysis.mistakes > 0 && (
                        <span style={{
                          padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                          background: 'rgba(239,68,68,0.2)', color: '#ef4444',
                        }}>
                          {analysis.mistakes} err
                        </span>
                      )}
                    </div>
                    {hand.heroCards && (
                      <div style={{ marginTop: 4 }}>
                        <CardDisplay cards={hand.heroCards} />
                      </div>
                    )}
                    {hand.stakes && (
                      <div style={{ color: '#64748b', fontSize: 10, marginTop: 2 }}>
                        ${hand.stakes.sb}/${hand.stakes.bb}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Hand Detail */}
            {selectedHand !== null && parsedHands[selectedHand] && (
              <div style={{ flex: 1 }}>
                {(() => {
                  const hand = parsedHands[selectedHand];
                  const analysis = analyses[selectedHand];

                  return (
                    <div>
                      {/* Hero Cards + Board */}
                      <div style={{ ...sectionStyle, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Hero</div>
                          <CardDisplay cards={hand.heroCards} />
                        </div>
                        {hand.board && (
                          <div>
                            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Board</div>
                            <CardDisplay cards={hand.board} />
                          </div>
                        )}
                        {hand.potSize > 0 && (
                          <div>
                            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Pot</div>
                            <div style={{ color: '#f59e0b', fontSize: 16, fontWeight: 700 }}>${hand.potSize.toFixed(2)}</div>
                          </div>
                        )}
                        {hand.winner && (
                          <div>
                            <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Winner</div>
                            <div style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>
                              {hand.winner.name} (${hand.winner.amount.toFixed(2)})
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Players */}
                      {hand.players.length > 0 && (
                        <div style={sectionStyle}>
                          <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Players</div>
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {hand.players.map((p, i) => (
                              <div key={i} style={{
                                padding: '4px 8px', borderRadius: 4,
                                background: p.name === hand.heroName ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.04)',
                                border: p.name === hand.heroName ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                              }}>
                                <span style={{ color: p.name === hand.heroName ? '#3b82f6' : '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                                  {p.name}
                                </span>
                                <span style={{ color: '#64748b', fontSize: 10, marginLeft: 6 }}>
                                  ${p.stack.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions + Analysis */}
                      <div style={sectionStyle}>
                        <div style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
                          Action Timeline
                        </div>
                        {hand.actions.map((action, i) => {
                          const isHero = action.player === hand.heroName || action.player === 'Hero';
                          const heroIdx = hand.actions.filter((a, j) => j < i && (a.player === hand.heroName || a.player === 'Hero')).length;
                          const dec = isHero && analysis ? analysis.decisions[heroIdx] : null;

                          return (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                              borderLeft: isHero ? '3px solid #3b82f6' : '3px solid transparent',
                              paddingLeft: 8, marginBottom: 2,
                            }}>
                              <span style={{
                                color: isHero ? '#3b82f6' : '#94a3b8', fontSize: 12, fontWeight: isHero ? 700 : 400,
                                minWidth: 80,
                              }}>
                                {action.player.slice(0, 12)}
                              </span>
                              <span style={{
                                color: action.action === 'folds' ? '#64748b' : action.action === 'raises' || action.action === 'bets' ? '#ef4444' : '#22c55e',
                                fontSize: 12, fontWeight: 600, minWidth: 50,
                              }}>
                                {action.action}
                              </span>
                              {action.amount > 0 && (
                                <span style={{ color: '#f1f5f9', fontSize: 12 }}>${action.amount.toFixed(2)}</span>
                              )}
                              {dec && (
                                <span style={{
                                  marginLeft: 'auto', padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                                  background: ['best', 'correct'].includes(dec.grade) ? 'rgba(34,197,94,0.15)' : ['wrong', 'blunder'].includes(dec.grade) ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                  color: ['best', 'correct'].includes(dec.grade) ? '#22c55e' : ['wrong', 'blunder'].includes(dec.grade) ? '#ef4444' : '#f59e0b',
                                }}>
                                  {['best', 'correct'].includes(dec.grade)
                                    ? 'GTO'
                                    : dec.grade === 'unpriced'
                                      ? 'Not priced'
                                      : dec.evLoss === null
                                        ? dec.grade
                                        : `-${dec.evLoss}bb`}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Analysis Summary */}
                      {analysis && (
                        <div style={{ ...sectionStyle, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
                          <div style={{ color: '#3b82f6', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Verified Solver Audit</div>
                          <div style={{ display: 'flex', gap: 16 }}>
                            <div>
                              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>EV Lost</div>
                              <div style={{ color: parseFloat(analysis.totalEVLoss) > 0.5 ? '#ef4444' : '#22c55e', fontSize: 16, fontWeight: 700 }}>
                                {analysis.totalEVLoss} bb
                              </div>
                            </div>
                            <div>
                              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Decisions</div>
                              <div style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700 }}>{analysis.decisions.length}</div>
                            </div>
                            <div>
                              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Verified</div>
                              <div style={{ color: '#22c55e', fontSize: 16, fontWeight: 700 }}>{analysis.verifiedDecisions}</div>
                            </div>
                            <div>
                              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase' }}>Mistakes</div>
                              <div style={{ color: analysis.mistakes > 0 ? '#ef4444' : '#22c55e', fontSize: 16, fontWeight: 700 }}>{analysis.mistakes}</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
