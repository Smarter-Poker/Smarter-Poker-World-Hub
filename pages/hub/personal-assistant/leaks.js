/**
 * LEAK FINDER — Post-Session Analysis
 * /hub/personal-assistant/leaks
 *
 * Identifies statistical leaks over time, NOT single-hand mistakes.
 * A leak requires: repetition + same situation class + measurable EV loss.
 *
 * INTEGRITY BADGE: Not Live Play - Post-Session Review Only
 */

import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { useState, useEffect, useMemo } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useLeaks, useAssistantStats, useLeakDetection, useLeakHandExamples } from '../../../src/hooks/useAssistant';

import { useFeatureGate } from '../../../src/components/gates/FeatureGatePopup';
import { getAuthUser, getAccessToken } from '../../../src/lib/authUtils';
import SessionAnalytics from '../../../src/components/sandbox/SessionAnalytics';
import LeakHeatmap from '../../../src/components/sandbox/LeakHeatmap';
import CoachLeaderboard from '../../../src/components/sandbox/CoachLeaderboard';
import MacroLeakDetector from '../../../src/components/sandbox/MacroLeakDetector';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// Demo/simulated leaks come back from the API with string ids like 'demo-1' / 'sim-2'.
// They are not real user_leaks rows, so status updates and hand-example lookups
// must be skipped for them.
function isDemoLeakId(id) {
  return typeof id === 'string' && (id.startsWith('demo-') || id.startsWith('sim-'));
}

function fmtCards(cards) {
  if (Array.isArray(cards)) return cards.join(' ');
  return cards || '—';
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAK STATUS BADGE
// ═══════════════════════════════════════════════════════════════════════════

function LeakStatusBadge({ status }) {
  const config = {
    persistent: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', label: 'Persistent', icon: '\u25B2' },
    emerging: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', label: 'Emerging', icon: '\u25B2' },
    improving: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', label: 'Improving', icon: '\u25B2' },
    resolved: { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)', label: 'Resolved', icon: '\u2713' },
  };

  const c = config[status] || config.emerging;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 10px',
      background: c.bg,
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      color: c.color,
    }}>
      <span>{c.icon}</span>
      {c.label}
    </span>
  );
}

function ConfidenceBadge({ confidence }) {
  const colors = {
    high: '#64b5f6',
    medium: '#f59e0b',
    low: '#ef4444',
  };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 10px',
      background: 'rgba(255, 255, 255, 0.05)',
      border: `1px solid ${colors[confidence] || colors.medium}`,
      borderRadius: 4,
      fontSize: 11,
      color: colors[confidence] || colors.medium,
    }}>
      {confidence === 'high' ? 'High Confidence' : confidence === 'medium' ? 'Medium' : 'Low'}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE BADGE
// ═══════════════════════════════════════════════════════════════════════════

function SourceBadge({ source }) {
  const isTraining = source === 'training_arena';
  const c = isTraining
    ? { color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.15)', label: 'Training Arena', icon: '\u25CE' }
    : { color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', label: 'Live Play', icon: '\u2660' };

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 10px',
      background: c.bg,
      border: `1px solid ${c.color}40`,
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      color: c.color,
    }}>
      <span style={{ fontSize: 10 }}>{c.icon}</span>
      {c.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TREND CHART (Simple SVG)
// ═══════════════════════════════════════════════════════════════════════════

function TrendChart({ data, optimal, current, status }) {
  if (!data || data.length < 2) return null;

  const width = 400;
  const height = 140;
  const padding = { top: 20, right: 60, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const optimalVal = Number(optimal) || 0;
  const currentVal = Number(current) || 0;

  const values = data.map(d => Number(d.value) || 0);
  const minVal = Math.min(...values, optimalVal) - 5;
  const maxVal = Math.max(...values, optimalVal) + 5;
  const range = (maxVal - minVal) || 1;

  const getY = (val) => padding.top + chartHeight - (((Number(val) || 0) - minVal) / range) * chartHeight;
  const getX = (index) => padding.left + (index / (data.length - 1)) * chartWidth;

  // Create path
  const pathPoints = data.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' L ');
  const linePath = `M ${pathPoints}`;

  // Area fill
  const areaPath = `M ${getX(0)},${getY(data[0].value)} L ${pathPoints} L ${getX(data.length - 1)},${height - padding.bottom} L ${getX(0)},${height - padding.bottom} Z`;

  const lineColor = status === 'improving' ? '#22c55e' : status === 'persistent' ? '#ef4444' : '#f59e0b';
  const difference = currentVal - optimalVal;

  return (
    <div style={{ position: 'relative' }}>
      {/* Responsive: viewBox + fluid width so the chart fits a 375px viewport */}
      <svg viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', width: '100%', height: 'auto', maxWidth: width }}>
        {/* Grid lines */}
        {[0, 25, 50, 75].map(pct => {
          const y = padding.top + (pct / 100) * chartHeight;
          return (
            <line
              key={pct}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="rgba(255, 255, 255, 0.1)"
              strokeDasharray="2,2"
            />
          );
        })}

        {/* Optimal line */}
        <line
          x1={padding.left}
          y1={getY(optimalVal)}
          x2={width - padding.right}
          y2={getY(optimalVal)}
          stroke="#22c55e"
          strokeWidth="2"
          strokeDasharray="6,4"
        />

        {/* Area fill */}
        <path
          d={areaPath}
          fill={`${lineColor}15`}
        />

        {/* Trend line */}
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={getX(i)}
            cy={getY(d.value)}
            r="5"
            fill={lineColor}
            stroke="#0a1628"
            strokeWidth="2"
          />
        ))}

        {/* Y-axis labels */}
        <text x={padding.left - 8} y={padding.top + 4} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="end">
          {maxVal.toFixed(0)}%
        </text>
        <text x={padding.left - 8} y={height - padding.bottom} fill="rgba(255,255,255,0.5)" fontSize="10" textAnchor="end">
          {minVal.toFixed(0)}%
        </text>

        {/* X-axis labels */}
        {data.length > 0 && (
          <>
            <text x={padding.left} y={height - 8} fill="rgba(255,255,255,0.4)" fontSize="10" textAnchor="start">
              {data[0].date}
            </text>
            <text x={width - padding.right} y={height - 8} fill="rgba(255,255,255,0.4)" fontSize="10" textAnchor="end">
              {data[data.length - 1].date}
            </text>
          </>
        )}
      </svg>

      {/* Difference annotation */}
      <div style={{
        position: 'absolute',
        top: padding.top,
        right: 0,
        padding: '6px 12px',
        background: difference > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 600,
        color: difference > 0 ? '#ef4444' : '#22c55e',
      }}>
        {difference > 0 ? '+' : ''}{difference.toFixed(1)}% {difference > 0 ? 'Above' : 'Below'} Optimal
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LEAK DETAIL VIEW
// ═══════════════════════════════════════════════════════════════════════════

function LeakDetailView({ leak, onPracticeSandbox, onTrainDrills, onMarkResolved, isResolving }) {
  const isDemoLeak = leak ? isDemoLeakId(leak.id) : false;

  // Only fetch example hands for real user_leaks rows (demo/sim ids don't exist in DB)
  const { examples, isLoading: examplesLoading } = useLeakHandExamples(leak && !isDemoLeak ? leak.id : null);

  // Auto guidance: persisted preference; when ON, the top suggested fix is highlighted
  const [autoGuidance, setAutoGuidance] = useState(false);
  useEffect(() => {
    try {
      setAutoGuidance(localStorage.getItem('pa-auto-guidance') === 'true');
    } catch (e) { /* localStorage unavailable */ }
  }, []);
  const toggleAutoGuidance = (e) => {
    const next = e.target.checked;
    setAutoGuidance(next);
    try { localStorage.setItem('pa-auto-guidance', String(next)); } catch (err) { /* noop */ }
  };

  if (!leak) {
    return (
      <div style={detailStyles.placeholder}>
        <p>Select A Leak From The Index To View Details.</p>
      </div>
    );
  }

  const drill = leak.recommendedDrill || leak.recommended_drill || null;

  // Guard against optimalFrequency of 0/undefined producing NaN/Infinity
  const deviation = leak.optimalFrequency
    ? (((leak.currentFrequency ?? 0) - leak.optimalFrequency) / leak.optimalFrequency * 100).toFixed(0)
    : null;

  const situation = leak.situationClass || 'these';
  const sandboxCopy = drill
    ? `Practice ${situation} spots in a controlled environment. I'll set up a virtual sandbox drill — "${drill}" — targeting this exact leak.`
    : `Practice ${situation} spots in a controlled environment. I'll set up a virtual sandbox scenario targeting this exact leak.`;
  const trainingCopy = drill
    ? `Focus on fixing "${leak.title}" with targeted exercises. The "${drill}" drill emphasizes the key decisions behind ${situation} spots.`
    : `Focus on fixing "${leak.title}" with targeted exercises built around ${situation} spots.`;

  const resolveDisabled = isResolving || isDemoLeak || leak.status === 'resolved';

  return (
    <div style={detailStyles.container}>
      {/* Header */}
      <div style={detailStyles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <h2 style={{ ...detailStyles.title, marginBottom: 0 }}>{leak.title}</h2>
          {leak.sourceSystem && <SourceBadge source={leak.sourceSystem} />}
          <button
            style={{
              ...detailStyles.resolveBtn,
              ...(resolveDisabled ? detailStyles.resolveBtnDisabled : {}),
            }}
            onClick={() => onMarkResolved && onMarkResolved(leak)}
            disabled={resolveDisabled}
            title={isDemoLeak
              ? 'Sample leaks cannot be resolved — run detection on your own hands first'
              : leak.status === 'resolved'
                ? 'This leak is already resolved'
                : 'Mark this leak as resolved'}
          >
            {isResolving ? 'Saving...' : leak.status === 'resolved' ? '\u2713 Resolved' : 'Mark Resolved'}
          </button>
        </div>
        <div style={detailStyles.badges}>
          <LeakStatusBadge status={leak.status} />
          <ConfidenceBadge confidence={leak.confidence} />
          <span style={detailStyles.situationTag}>{leak.situationClass}</span>
        </div>
        {/* What you're doing: general explanation (only when we also have the tailored EV text, to avoid duplication) */}
        {leak.whyLeakingEv && leak.explanation && leak.whyLeakingEv !== leak.explanation && (
          <p style={detailStyles.headerSummary}>{leak.explanation}</p>
        )}
      </div>

      {/* Trend Chart */}
      <div style={detailStyles.chartSection}>
        <h3 style={detailStyles.chartTitle}>
          Occurrences: {leak.occurrenceCount ?? 0}{deviation !== null ? ` — ${deviation}% vs optimal` : ''}
        </h3>
        <TrendChart
          data={leak.trendData}
          optimal={leak.optimalFrequency}
          current={leak.currentFrequency}
          status={leak.status}
        />
      </div>

      {/* Why It's Leaking */}
      <div style={detailStyles.explanationSection}>
        <h3 style={detailStyles.sectionTitle}>Why It's Leaking EV</h3>
        <p style={detailStyles.explanationText}>{leak.whyLeakingEv || leak.explanation}</p>
      </div>

      {/* Recent Example Hands (real leaks only — populated by leak detection) */}
      {!isDemoLeak && (
        <div style={detailStyles.explanationSection}>
          <h3 style={detailStyles.sectionTitle}>Recent Example Hands</h3>
          {examplesLoading ? (
            <p style={detailStyles.explanationText}>Loading example hands...</p>
          ) : examples.length === 0 ? (
            <p style={detailStyles.explanationText}>
              No example hands recorded for this leak yet. Run leak detection after your next sessions to collect concrete examples.
            </p>
          ) : (
            <div style={detailStyles.examplesList}>
              {examples.map((ex) => (
                <div key={ex.id} style={detailStyles.exampleRow}>
                  <span style={detailStyles.exampleCards}>{fmtCards(ex.snapshot?.hero_cards)}</span>
                  <span style={detailStyles.exampleBoard}>Board: {fmtCards(ex.snapshot?.board)}</span>
                  <span style={detailStyles.exampleStreet}>{(ex.snapshot?.street || '?').toUpperCase()}</span>
                  <span style={detailStyles.exampleEv}>
                    {typeof ex.evLoss === 'number' ? `-${Math.abs(ex.evLoss).toFixed(2)} BB` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suggested Fixes */}
      <div style={detailStyles.fixesSection}>
        <div style={detailStyles.fixesGrid}>
          {/* Sandbox Practice */}
          <div style={{
            ...detailStyles.fixCard,
            ...(autoGuidance ? detailStyles.fixCardRecommended : {}),
          }}>
            <h4 style={detailStyles.fixTitle}>
              Suggested Fixes
              {autoGuidance && <span style={detailStyles.recommendedChip}>Recommended</span>}
            </h4>
            <div style={detailStyles.fixIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#64b5f6" strokeWidth="2" fill="none" />
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#64b5f6" strokeWidth="2" fill="none" />
              </svg>
            </div>
            <h5 style={detailStyles.fixSubtitle}>Practice In Sandbox</h5>
            <p style={detailStyles.fixText}>{sandboxCopy}</p>
            <button style={detailStyles.fixButton} onClick={onPracticeSandbox}>
              Practice Leak in Sandbox
            </button>
          </div>

          {/* Focused Training */}
          <div style={detailStyles.fixCard}>
            <h4 style={detailStyles.fixTitle}>Specialized Training</h4>
            <div style={detailStyles.fixIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#f59e0b" strokeWidth="2" fill="none" />
                <path d="M12 6v6l4 2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h5 style={detailStyles.fixSubtitle}>Specialized Training</h5>
            <p style={detailStyles.fixText}>{trainingCopy}</p>
            <button style={{ ...detailStyles.fixButton, background: 'linear-gradient(135deg, #f59e0b, #d97706)' }} onClick={onTrainDrills}>
              Train with Focused Drills
            </button>
          </div>
        </div>

        {/* Auto-guidance toggle */}
        <div style={detailStyles.autoGuidance}>
          <input
            type="checkbox"
            id="autoGuidance"
            style={detailStyles.checkbox}
            checked={autoGuidance}
            onChange={toggleAutoGuidance}
          />
          <label htmlFor="autoGuidance" style={detailStyles.autoGuidanceLabel}>
            Auto guidance {autoGuidance ? 'ON' : 'OFF'}:{' '}
            <span style={{ color: 'rgba(255,255,255,0.5)' }}>
              {autoGuidance ? 'Highlighting The Top Suggested Fix Automatically.' : 'Suggesting One Fix At A Time.'}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

const detailStyles = {
  container: {
    flex: 1,
    padding: 24,
    overflowY: 'auto',
  },
  placeholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(255, 255, 255, 0.4)',
    padding: 40,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 12,
  },
  headerSummary: {
    marginTop: 12,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.6,
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  situationTag: {
    padding: '4px 10px',
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 4,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  resolveBtn: {
    marginLeft: 'auto',
    padding: '8px 14px',
    background: 'rgba(34, 197, 94, 0.15)',
    border: '1px solid rgba(34, 197, 94, 0.5)',
    borderRadius: 8,
    color: '#22c55e',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  resolveBtnDisabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  chartSection: {
    marginBottom: 24,
    padding: 20,
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 16,
  },
  explanationSection: {
    marginBottom: 24,
    padding: 20,
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 12,
  },
  explanationText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 1.6,
  },
  examplesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  exampleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    padding: '10px 12px',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    fontSize: 12,
  },
  exampleCards: {
    fontWeight: 700,
    color: '#fff',
  },
  exampleBoard: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  exampleStreet: {
    padding: '2px 8px',
    background: 'rgba(100, 181, 246, 0.15)',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 600,
    color: '#64b5f6',
  },
  exampleEv: {
    marginLeft: 'auto',
    fontWeight: 600,
    color: '#ef4444',
  },
  fixesSection: {},
  fixesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 16,
    marginBottom: 16,
  },
  fixCard: {
    padding: 20,
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  fixCardRecommended: {
    borderColor: '#64b5f6',
    background: 'rgba(100, 181, 246, 0.06)',
  },
  recommendedChip: {
    marginLeft: 8,
    padding: '2px 8px',
    background: 'rgba(100, 181, 246, 0.2)',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    color: '#64b5f6',
    textTransform: 'none',
  },
  fixTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.5)',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  fixIcon: {
    marginBottom: 12,
  },
  fixSubtitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#fff',
    marginBottom: 8,
  },
  fixText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 1.5,
    marginBottom: 16,
  },
  fixButton: {
    width: '100%',
    padding: '12px 20px',
    background: 'linear-gradient(135deg, #1565c0, #0d47a1)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  autoGuidance: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 8,
  },
  checkbox: {
    accentColor: '#64b5f6',
  },
  autoGuidanceLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LEAK FINDER PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function LeakFinderPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [userId, setUserId] = useState(null);

  // Get auth user for FeatureGate
  useEffect(() => {
    const user = getAuthUser();
    if (user) setUserId(user.id);
  }, []);

  // ═══ ACTION GATE: Users can explore leaks, but practice/training is gated ═══
  const { guardAction, UpgradePopup } = useFeatureGate('personal_assistant');
  const [selectedLeak, setSelectedLeak] = useState(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [resolvingLeakId, setResolvingLeakId] = useState(null);
  const [detectionSummary, setDetectionSummary] = useState(null);

  // Use real hooks for data (isDemo flags may be undefined until the hook propagates them — handled below)
  const {
    leaks: fetchedLeaks,
    demoLeaks: onboardingLeaks,
    isLoading: leaksLoading,
    error: leaksError,
    refetch: refetchLeaks,
    updateLeakStatus,
    isDemo: leaksDemoFlag,
  } = useLeaks();
  const { stats: fetchedStats, isLoading: statsLoading, isDemo: statsDemoFlag } = useAssistantStats();

  // Leak detection engine trigger (POST /api/assistant/leaks/detect)
  const { runDetection, isDetecting } = useLeakDetection();

  // ─── Wave 3: Coach Accuracy from Sandbox Coach Mode ────────────────────────
  const [coachAccuracy, setCoachAccuracy] = useState(null);
  const fetchCoachAccuracy = async () => {
    try {
      const accessToken = getAccessToken();
      if (!accessToken) return;
      const res = await fetch('/api/sandbox/coach-accuracy', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          // Keep the full payload: accuracy summary + the user's 5 worst wrong picks
          setCoachAccuracy({ ...json.accuracy, topLeaks: json.topLeaks || [] });
        }
      }
    } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
  };

  useEffect(() => {
    fetchCoachAccuracy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Separate active and past leaks (memoized so identities are stable across renders)
  const activeLeaks = useMemo(() => fetchedLeaks.filter(l => l.status !== 'resolved'), [fetchedLeaks]);
  const pastLeaks = useMemo(() => fetchedLeaks.filter(l => l.status === 'resolved'), [fetchedLeaks]);

  // Demo detection: prefer the hook's isDemo flag; fall back to demo/sim leak ids
  const leaksAreDemo = !!leaksDemoFlag || (fetchedLeaks.length > 0 && fetchedLeaks.every(l => isDemoLeakId(l.id)));
  const statsAreDemo = !!statsDemoFlag || !!fetchedStats?.isDemo;
  const showSampleBadge = leaksAreDemo || statsAreDemo;

  // Avg EV loss: use the API value when real, otherwise compute from actual leaks; 0 = no data
  const avgEvLoss = useMemo(() => {
    if (typeof fetchedStats.avgEvLoss === 'number' && fetchedStats.avgEvLoss !== 0 && !statsAreDemo) {
      return fetchedStats.avgEvLoss;
    }
    if (activeLeaks.length > 0) {
      return -(activeLeaks.reduce((s, l) => s + (l.evLossBB || 0), 0) / activeLeaks.length);
    }
    return 0;
  }, [fetchedStats.avgEvLoss, statsAreDemo, activeLeaks]);

  // Use fetched stats or defaults (using ?? to allow 0 instead of falling back on falsy check)
  const stats = {
    sessionsReviewed: fetchedStats.sessionsReviewed ?? 0,
    handsAnalyzed: fetchedStats.handsAnalyzed ?? 0,
    leaksFound: activeLeaks.length,
    avgEvLoss,
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-select first leak when data loads; re-sync a stale selection after a refetch
  useEffect(() => {
    if (selectedLeak) {
      const fresh = activeLeaks.find(l => l.id === selectedLeak.id);
      if (fresh && fresh !== selectedLeak) setSelectedLeak(fresh);
    } else if (activeLeaks.length > 0) {
      setSelectedLeak(activeLeaks[0]);
    }
  }, [activeLeaks, selectedLeak]);

  const handleRunDetection = async () => {
    setDetectionSummary(null);
    const result = await runDetection();
    if (result?.success) {
      if (result.message) {
        // e.g. "Need more hands to detect leaks (minimum 100)"
        setDetectionSummary({ type: 'info', text: result.message });
      } else {
        const found = result.leaksDetected ?? 0;
        setDetectionSummary({
          type: 'success',
          text: `Analyzed ${(result.handsAnalyzed ?? 0).toLocaleString()} hands, found ${found} leak${found === 1 ? '' : 's'}.`,
        });
      }
    } else {
      setDetectionSummary({ type: 'error', text: result?.error || 'Leak detection failed. Please try again.' });
    }
  };

  const handleMarkResolved = async (leak) => {
    if (!leak || isDemoLeakId(leak.id)) return;
    setResolvingLeakId(leak.id);
    try {
      const result = await updateLeakStatus(leak.id, 'resolved');
      if (result?.success) {
        toast.success('Leak marked as resolved');
        setSelectedLeak(null);
      } else {
        toast.error(result?.error || 'Could not update leak status');
      }
    } finally {
      setResolvingLeakId(null);
    }
  };

  const handlePracticeSandbox = () => {
    // ═══ ACTION GATE: Practice requires access ═══
    if (!guardAction()) return;
    const query = {};
    if (selectedLeak?.id != null) query.leak = selectedLeak.id;
    if (selectedLeak?.title) query.leakType = selectedLeak.title;
    const drill = selectedLeak?.recommendedDrill || selectedLeak?.recommended_drill;
    if (drill) query.drill = drill;
    router.push({ pathname: '/hub/personal-assistant/sandbox', query });
  };

  const handleTrainDrills = () => {
    // ═══ ACTION GATE: Training requires access ═══
    if (!guardAction()) return;
    const query = {};
    const drill = selectedLeak?.recommendedDrill || selectedLeak?.recommended_drill;
    if (drill) query.focus = drill;
    router.push({ pathname: '/hub/training', query });
  };

  if (!mounted) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingText}>Loading Leak Finder...</div>
      </div>
    );
  }

  return (
    <PageTransition>
      <SEOHead
        title="Leak Finder — Fix Your Game"
        description="Identify And Fix Leaks In Your Poker Game With AI-powered Analysis From Jarvis."
        canonical="/hub/personal-assistant/leaks"
      >

      </SEOHead>

      <div className="leaks-page" style={styles.container}>
        <div style={styles.bgGrid} />
        <UniversalHeader pageDepth={2} />

          {/* Top Bar */}
          <div style={styles.topBar}>
            <div style={styles.topBarLeft}>
              <span style={styles.brandText}>Smarter.Poker</span>
              <span style={styles.divider}>|</span>
              <span style={styles.pageLabel}>Personal Assistant</span>
              <span style={styles.pageSublabel}>Leak Finder & Improvement Hub</span>
            </div>
            <div style={styles.topBarRight}>
              <div style={styles.integrityBadge}>
                <span style={styles.lockIcon}>&#128274;</span>
                Not Live Play - Post-Session Review Only
              </div>
            </div>
          </div>

          {/* Stats Bar */}
          <div style={styles.statsBar}>
            {showSampleBadge && (
              <span
                style={styles.sampleBadge}
                title="These numbers are sample data, not your own analysis. Run leak detection on your own hands."
              >
                Sample Data
              </span>
            )}
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Sessions Reviewed:</span>
              <span style={styles.statValue}>{statsLoading ? '…' : stats.sessionsReviewed}</span>
            </div>
            <div style={styles.statDivider}>|</div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Hands Analyzed:</span>
              <span style={styles.statValue}>{statsLoading ? '…' : stats.handsAnalyzed.toLocaleString()}</span>
            </div>
            <div style={styles.statDivider}>|</div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Leaks Found:</span>
              <span style={styles.statValue}>{leaksLoading ? '…' : stats.leaksFound}</span>
            </div>
            <div style={styles.statDivider}>|</div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Avg EV Loss:</span>
              <span style={{ ...styles.statValue, color: '#ef4444' }}>
                {stats.avgEvLoss
                  ? (
                    <>
                      <span style={styles.trendIcon}>~</span>
                      {stats.avgEvLoss.toFixed(2)} BB/Occurrence
                    </>
                  )
                  : '—'}
              </span>
            </div>
            {/* Wave 3: Coach Mode Accuracy — live from sandbox_coach_results */}
            {coachAccuracy && Number(coachAccuracy.total_hands) > 0 && (
              <>
                <div style={styles.statDivider}>|</div>
                <div style={styles.statItem} title={`${coachAccuracy.correct_count} correct / ${coachAccuracy.total_hands} total hands in Coach Mode`}>
                  <span style={styles.statLabel}>{'\u{1F393}'} GTO Accuracy:</span>
                  <span style={{
                    ...styles.statValue,
                    color: Number(coachAccuracy.accuracy_pct) >= 70 ? '#22c55e' : Number(coachAccuracy.accuracy_pct) >= 50 ? '#fbbf24' : '#ef4444',
                    fontWeight: 800,
                  }}>
                    {coachAccuracy.accuracy_pct ?? '—'}%
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Main Layout */}
          <div className="leaks-main-layout" style={styles.mainLayout}>
            {/* ══ WAVE 4/5: Sandbox Analytics & Leaderboard ══ */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#E4E6EB', marginBottom: 10, paddingLeft: 4 }}>
                <span style={{ marginRight: 6 }}>{'\u{1F4CA}'}</span>Session Analytics
              </div>
              <SessionAnalytics userId={userId} />

              {/* Worst Coach-Mode spots — real personal leak signal from coach mode */}
              {Array.isArray(coachAccuracy?.topLeaks) && coachAccuracy.topLeaks.length > 0 && (
                <div style={styles.coachSpotsCard}>
                  <div style={styles.coachSpotsTitle}>Worst Coach-Mode Spots</div>
                  {coachAccuracy.topLeaks.map((spot, i) => (
                    <div
                      key={i}
                      style={styles.coachSpotRow}
                      onClick={() => router.push('/hub/personal-assistant/sandbox')}
                      title="Open the sandbox to practice this spot"
                    >
                      <span style={styles.coachSpotStreet}>{(spot.street || '?').toUpperCase()}</span>
                      <span style={styles.coachSpotBoard}>{fmtCards(spot.board)}</span>
                      <span style={styles.coachSpotDetail}>
                        you: {spot.user_pick || '?'} · GTO: {spot.gto_action || '?'} · EV {Number(spot.ev_delta ?? 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Wave 5: Weekly Leaderboard */}
              <div style={{ marginTop: 12 }}>
                <CoachLeaderboard userId={userId} />
              </div>

              {/* Wave 6: Macro Leak Detector */}
              <div style={{ marginTop: 12 }}>
                <MacroLeakDetector />
              </div>

              {/* Wave 4: Leak Heatmap */}
              <div style={{ marginTop: 12 }}>
                <LeakHeatmap userId={userId} />
              </div>
            </div>
            {/* Left Panel - Leak Index */}
            <div
              className="leaks-left-panel"
              style={{ ...styles.leftPanel, ...(panelCollapsed ? styles.leftPanelCollapsed : {}) }}
            >
              {panelCollapsed ? (
                <button
                  style={styles.expandBtn}
                  onClick={() => setPanelCollapsed(false)}
                  title="Expand leak index"
                >
                  &#8250;
                </button>
              ) : (
                <>
                  <div style={styles.indexHeader}>
                    <h3 style={styles.indexTitle}>Leak Index</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        style={{ ...styles.detectBtn, ...(isDetecting ? styles.detectBtnDisabled : {}) }}
                        onClick={handleRunDetection}
                        disabled={isDetecting}
                        title="Analyze your recent hands for statistical leaks"
                      >
                        {isDetecting ? 'Analyzing…' : 'Run Leak Detection'}
                      </button>
                      <button
                        style={styles.expandBtn}
                        onClick={() => setPanelCollapsed(true)}
                        title="Collapse leak index"
                      >
                        &#8249;
                      </button>
                    </div>
                  </div>

                  {/* Detection result / error summary */}
                  {detectionSummary && (
                    <div style={{
                      ...styles.detectionBanner,
                      borderColor: detectionSummary.type === 'error' ? 'rgba(239, 68, 68, 0.5)' : detectionSummary.type === 'success' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(245, 158, 11, 0.5)',
                      color: detectionSummary.type === 'error' ? '#ef4444' : detectionSummary.type === 'success' ? '#22c55e' : '#f59e0b',
                    }}>
                      {detectionSummary.text}
                    </div>
                  )}

                  {/* Sample-data disclosure */}
                  {leaksAreDemo && !leaksLoading && (
                    <div style={styles.sampleBanner}>
                      Sample Data — these are example leaks, not your own. Run detection on your own hands.
                    </div>
                  )}

                  {/* Fetch error + retry */}
                  {leaksError && !leaksLoading && (
                    <div style={styles.errorRow}>
                      <span>Could not load leaks.</span>
                      <button style={styles.retryBtn} onClick={() => refetchLeaks()}>Retry</button>
                    </div>
                  )}

                  {/* Active Leaks */}
                  {leaksLoading ? (
                    <div style={styles.leakList}>
                      {[0, 1, 2].map(i => (
                        <div key={i} className="leak-skeleton" style={styles.skeletonCard} />
                      ))}
                    </div>
                  ) : activeLeaks.length === 0 && !leaksError ? (
                    <div style={styles.emptyState}>
                      <p style={{ margin: '0 0 12px' }}>
                        No leaks detected yet — run detection on your recent hands to find EV leaks.
                      </p>
                      <button
                        style={{ ...styles.detectBtn, ...(isDetecting ? styles.detectBtnDisabled : {}) }}
                        onClick={handleRunDetection}
                        disabled={isDetecting}
                      >
                        {isDetecting ? 'Analyzing…' : 'Run Leak Detection'}
                      </button>
                      {/* Onboarding preview — explicitly labeled as examples so
                          it can never read as the user's own detected leaks. */}
                      {(onboardingLeaks || []).length > 0 && (
                        <div style={{ marginTop: 16, textAlign: 'left' }}>
                          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#B0B3B8', fontWeight: 700, marginBottom: 8 }}>
                            Example leaks (not yours)
                          </div>
                          {onboardingLeaks.slice(0, 3).map((leak) => (
                            <div key={`demo-${leak.id}`} style={{ padding: '8px 10px', marginBottom: 6, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.12)' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#E4E6EB' }}>{leak.title}</div>
                              <div style={{ fontSize: 11, color: '#B0B3B8', marginTop: 2 }}>
                                {leak.situationClass || 'Sample situation'}
                                {typeof leak.evLossBB === 'number' ? ` — ${leak.evLossBB.toFixed(2)} bb/occurrence` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={styles.leakList}>
                      {activeLeaks.map((leak) => (
                        <div
                          key={leak.id}
                          style={{
                            ...styles.leakCard,
                            ...(selectedLeak?.id === leak.id ? styles.leakCardSelected : {}),
                          }}
                          onClick={() => setSelectedLeak(leak)}
                        >
                          <div style={styles.leakCardHeader}>
                            <span style={styles.leakCardTitle}>{leak.title}</span>
                            <span style={styles.leakCardArrow}>&#8250;</span>
                          </div>
                          <div style={styles.leakCardMeta}>
                            <LeakStatusBadge status={leak.status} />
                            {leak.sourceSystem && <SourceBadge source={leak.sourceSystem} />}
                            <span style={styles.leakCardConfidence}>
                              {'*'.repeat(leak.confidence === 'high' ? 3 : leak.confidence === 'medium' ? 2 : 1)}
                              {leak.confidence === 'high' ? ' High' : leak.confidence === 'medium' ? ' Medium' : ' Low'}
                            </span>
                          </div>
                          <div style={styles.leakCardSituation}>
                            Period Analyzed:<br />
                            {leak.situationClass}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Past Leaks */}
                  {pastLeaks.length > 0 && (
                    <div style={styles.pastLeaksSection}>
                      <h4 style={styles.pastLeaksTitle}>Past Leaks</h4>
                      {pastLeaks.map((leak) => (
                        <div
                          key={leak.id}
                          style={{
                            ...styles.pastLeakCard,
                            ...(selectedLeak?.id === leak.id ? styles.leakCardSelected : {}),
                          }}
                          onClick={() => setSelectedLeak(leak)}
                        >
                          <div style={styles.pastLeakHeader}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <LeakStatusBadge status={leak.status} />
                              {leak.sourceSystem && <SourceBadge source={leak.sourceSystem} />}
                            </div>
                            <span style={styles.pastLeakTitle}>{leak.title}</span>
                            <span style={styles.pastLeakArrow}>&#8250;</span>
                          </div>
                          <div style={styles.pastLeakMeta}>
                            Period Analyzed: {leak.situationClass}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Right Panel - Leak Detail */}
            <LeakDetailView
              leak={selectedLeak}
              onPracticeSandbox={handlePracticeSandbox}
              onTrainDrills={handleTrainDrills}
              onMarkResolved={handleMarkResolved}
              isResolving={resolvingLeakId !== null && resolvingLeakId === selectedLeak?.id}
            />
          </div>

        <style jsx>{`
          @media (max-width: 768px) {
            .leaks-main-layout {
              flex-direction: column !important;
            }
            .leaks-left-panel {
              width: 100% !important;
              border-right: none !important;
              border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
          }
          .leak-skeleton {
            animation: leakSkeletonPulse 1.4s ease-in-out infinite;
          }
          @keyframes leakSkeletonPulse {
            0%, 100% { opacity: 0.35; }
            50% { opacity: 0.7; }
          }
        `}</style>
      </div>
      {UpgradePopup}
      <Toaster position="top-right" />
          <BottomNavBar />
    </PageTransition >
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
  container: {
    minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box',
    background: 'linear-gradient(180deg, #e8e8e8 0%, #d0d0d0 100%)',
    fontFamily: 'Inter, -apple-system, sans-serif',
    position: 'relative',
  },
  bgGrid: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: `
      linear-gradient(rgba(100, 100, 100, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(100, 100, 100, 0.05) 1px, transparent 1px)
    `,
    backgroundSize: '30px 30px',
    pointerEvents: 'none',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#e8e8e8',
  },
  loadingText: {
    color: 'rgba(0, 0, 0, 0.5)',
  },

  // Top Bar
  topBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    padding: '12px 20px',
    background: '#fff',
    borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  brandText: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1a2a44',
  },
  divider: {
    color: 'rgba(0, 0, 0, 0.2)',
  },
  pageLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1a2a44',
  },
  pageSublabel: {
    fontSize: 13,
    color: 'rgba(0, 0, 0, 0.5)',
    marginLeft: 8,
  },
  topBarRight: {},
  integrityBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: 'rgba(26, 42, 68, 0.05)',
    border: '1px solid rgba(26, 42, 68, 0.2)',
    borderRadius: 6,
    fontSize: 12,
    color: '#1a2a44',
  },
  lockIcon: {
    fontSize: 12,
  },

  // Stats Bar
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
    padding: '12px 20px',
    background: '#fff',
    borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
  },
  sampleBadge: {
    padding: '4px 10px',
    background: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.5)',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
    color: '#b45309',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(0, 0, 0, 0.5)',
  },
  statValue: {
    fontSize: 14,
    fontWeight: 700,
    color: '#1a2a44',
  },
  statDivider: {
    color: 'rgba(0, 0, 0, 0.2)',
  },
  trendIcon: {
    marginRight: 2,
  },

  // Main Layout
  mainLayout: {
    display: 'flex',
    flexWrap: 'wrap',
    minHeight: 'calc(100vh - 160px)',
    background: '#0a1628',
  },

  // Coach-mode worst spots (Session Analytics block)
  coachSpotsCard: {
    marginTop: 12,
    padding: 14,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
  },
  coachSpotsTitle: {
    fontSize: 12,
    fontWeight: 800,
    color: '#E4E6EB',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  coachSpotRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    padding: '8px 10px',
    marginBottom: 6,
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    cursor: 'pointer',
  },
  coachSpotStreet: {
    padding: '2px 8px',
    background: 'rgba(100, 181, 246, 0.15)',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 700,
    color: '#64b5f6',
  },
  coachSpotBoard: {
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
  },
  coachSpotDetail: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.55)',
  },

  // Left Panel
  leftPanel: {
    width: 280,
    background: 'rgba(255, 255, 255, 0.02)',
    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    padding: 16,
    overflowY: 'auto',
  },
  leftPanelCollapsed: {
    width: 48,
    padding: 8,
  },
  indexHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  indexTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 18,
    cursor: 'pointer',
  },
  detectBtn: {
    padding: '8px 12px',
    background: 'linear-gradient(135deg, #1565c0, #0d47a1)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s ease',
  },
  detectBtnDisabled: {
    opacity: 0.6,
    cursor: 'wait',
  },
  detectionBanner: {
    padding: '10px 12px',
    marginBottom: 12,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid',
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 1.4,
  },
  sampleBanner: {
    padding: '10px 12px',
    marginBottom: 12,
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.4)',
    borderRadius: 8,
    fontSize: 12,
    lineHeight: 1.4,
    color: '#f59e0b',
  },
  errorRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '10px 12px',
    marginBottom: 12,
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.4)',
    borderRadius: 8,
    fontSize: 12,
    color: '#ef4444',
  },
  retryBtn: {
    padding: '4px 10px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.5)',
    borderRadius: 6,
    color: '#ef4444',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
  skeletonCard: {
    height: 96,
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
  },
  emptyState: {
    padding: '20px 14px',
    marginBottom: 24,
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px dashed rgba(255, 255, 255, 0.15)',
    borderRadius: 10,
    fontSize: 12,
    lineHeight: 1.5,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
  },
  leakList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    marginBottom: 24,
  },
  leakCard: {
    padding: 14,
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  leakCardSelected: {
    background: 'rgba(100, 181, 246, 0.1)',
    borderColor: '#64b5f6',
  },
  leakCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  leakCardTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
  },
  leakCardArrow: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 16,
  },
  leakCardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  leakCardConfidence: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  leakCardSituation: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    lineHeight: 1.4,
  },
  pastLeaksSection: {
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    paddingTop: 16,
  },
  pastLeaksTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 12,
  },
  pastLeakCard: {
    padding: 12,
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    marginBottom: 8,
    cursor: 'pointer',
  },
  pastLeakHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  pastLeakTitle: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  pastLeakArrow: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  pastLeakMeta: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
  },
};
