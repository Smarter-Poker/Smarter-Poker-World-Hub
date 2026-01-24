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
import Head from 'next/head';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useLeaks, useAssistantStats } from '../../../src/hooks/useAssistant';

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════════════════

const MOCK_STATS = {
  sessionsReviewed: 73,
  handsAnalyzed: 12580,
  leaksFound: 3,
  avgEvLoss: -0.07,
};

const MOCK_LEAKS = [
  {
    id: 1,
    title: 'Overfolding to C-Bets',
    status: 'persistent',
    confidence: 'high',
    situationClass: 'MP vs C-Bet - Single Raised Pots',
    optimalFrequency: 45,
    currentFrequency: 62,
    evLossBB: 0.14,
    occurrenceCount: 47,
    firstDetected: '2024-02-15',
    trendData: [
      { date: '2024-02', value: 52 },
      { date: '2024-03', value: 55 },
      { date: '2024-03.5', value: 58 },
      { date: '2024-04', value: 60 },
      { date: '2024-04.5', value: 62 },
    ],
    explanation: "You're folding to c-bets much more often than GTO recommends, especially on dry boards. This makes you easy to exploit and costs you value in missed calls.",
  },
  {
    id: 2,
    title: 'Lack of River Bluff Raises',
    status: 'emerging',
    confidence: 'medium',
    situationClass: 'BB vs River Bet in Single Raised Pots',
    optimalFrequency: 12,
    currentFrequency: 4,
    evLossBB: 0.08,
    occurrenceCount: 23,
    firstDetected: '2024-03-20',
    trendData: [
      { date: '2024-03', value: 3 },
      { date: '2024-04', value: 4 },
    ],
    explanation: "Your river bluff-raise frequency is significantly below optimal. You're leaving value on the table by not applying enough pressure on rivers.",
  },
  {
    id: 3,
    title: 'Misplaying 3-Bet Pots',
    status: 'improving',
    confidence: 'medium',
    situationClass: 'Cutoff vs Button - 3-Bet Pots',
    optimalFrequency: 35,
    currentFrequency: 28,
    evLossBB: 0.05,
    occurrenceCount: 31,
    firstDetected: '2024-01-10',
    trendData: [
      { date: '2024-01', value: 18 },
      { date: '2024-02', value: 22 },
      { date: '2024-03', value: 25 },
      { date: '2024-04', value: 28 },
    ],
    explanation: "Your continuation frequency in 3-bet pots has been too passive, but you're showing improvement. Keep working on finding spots to apply pressure.",
  },
];

const PAST_LEAKS = [
  {
    id: 101,
    title: 'Lack of River Bluff Raises',
    status: 'resolved',
    situationClass: 'BB vs River Bet in Singl...',
    resolvedDate: '2024-02-28',
  },
  {
    id: 102,
    title: 'Misplaying 3-Bet Pots',
    status: 'resolved',
    situationClass: 'Cutoff vs Button 3-Bet',
    resolvedDate: '2024-01-15',
  },
];

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

// ═══════════════════════════════════════════════════════════════════════════
// CONFIDENCE BADGE
// ═══════════════════════════════════════════════════════════════════════════

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
// TREND CHART (Simple SVG)
// ═══════════════════════════════════════════════════════════════════════════

function TrendChart({ data, optimal, current, status }) {
  if (!data || data.length < 2) return null;

  const width = 400;
  const height = 140;
  const padding = { top: 20, right: 60, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const values = data.map(d => d.value);
  const minVal = Math.min(...values, optimal) - 5;
  const maxVal = Math.max(...values, optimal) + 5;
  const range = maxVal - minVal;

  const getY = (val) => padding.top + chartHeight - ((val - minVal) / range) * chartHeight;
  const getX = (index) => padding.left + (index / (data.length - 1)) * chartWidth;

  // Create path
  const pathPoints = data.map((d, i) => `${getX(i)},${getY(d.value)}`).join(' L ');
  const linePath = `M ${pathPoints}`;

  // Area fill
  const areaPath = `M ${getX(0)},${getY(data[0].value)} L ${pathPoints} L ${getX(data.length - 1)},${height - padding.bottom} L ${getX(0)},${height - padding.bottom} Z`;

  const lineColor = status === 'improving' ? '#22c55e' : status === 'persistent' ? '#ef4444' : '#f59e0b';
  const difference = current - optimal;

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
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
          y1={getY(optimal)}
          x2={width - padding.right}
          y2={getY(optimal)}
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

function LeakDetailView({ leak, onPracticeSandbox, onTrainDrills }) {
  if (!leak) {
    return (
      <div style={detailStyles.placeholder}>
        <p>Select a leak from the index to view details.</p>
      </div>
    );
  }

  return (
    <div style={detailStyles.container}>
      {/* Header */}
      <div style={detailStyles.header}>
        <h2 style={detailStyles.title}>{leak.title}</h2>
        <div style={detailStyles.badges}>
          <LeakStatusBadge status={leak.status} />
          <ConfidenceBadge confidence={leak.confidence} />
          <span style={detailStyles.situationTag}>{leak.situationClass}</span>
        </div>
      </div>

      {/* Trend Chart */}
      <div style={detailStyles.chartSection}>
        <h3 style={detailStyles.chartTitle}>
          Leak Moment: {leak.occurrenceCount} — {((leak.currentFrequency - leak.optimalFrequency) / leak.optimalFrequency * 100).toFixed(0)}%
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
        <p style={detailStyles.explanationText}>{leak.explanation}</p>
      </div>

      {/* Suggested Fixes */}
      <div style={detailStyles.fixesSection}>
        <div style={detailStyles.fixesGrid}>
          {/* Sandbox Practice */}
          <div style={detailStyles.fixCard}>
            <h4 style={detailStyles.fixTitle}>Suggested Fixes</h4>
            <div style={detailStyles.fixIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#64b5f6" strokeWidth="2" fill="none"/>
                <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#64b5f6" strokeWidth="2" fill="none"/>
              </svg>
            </div>
            <h5 style={detailStyles.fixSubtitle}>Practice in Sandbox</h5>
            <p style={detailStyles.fixText}>
              Get comfortable calling wider on dry flops in mid-position. I'll set up a virtual sandbox where you can practice defending against c-bets.
            </p>
            <button style={detailStyles.fixButton} onClick={onPracticeSandbox}>
              Practice Leak in Sandbox
            </button>
          </div>

          {/* Focused Training */}
          <div style={detailStyles.fixCard}>
            <h4 style={detailStyles.fixTitle}>Specialized Training</h4>
            <div style={detailStyles.fixIcon}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#f59e0b" strokeWidth="2" fill="none"/>
                <path d="M12 6v6l4 2" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <h5 style={detailStyles.fixSubtitle}>Specialized Training</h5>
            <p style={detailStyles.fixText}>
              Focus on defending against c-bets with targeted exercises. I'll guide you through a set of hands that emphasize proper c-bet defense in single raised pots.
            </p>
            <button style={{ ...detailStyles.fixButton, background: 'linear-gradient(135deg, #f59e0b, #d97706)' }} onClick={onTrainDrills}>
              Train with Focused Drills
            </button>
          </div>
        </div>

        {/* Auto-guidance toggle */}
        <div style={detailStyles.autoGuidance}>
          <input type="checkbox" id="autoGuidance" style={detailStyles.checkbox} />
          <label htmlFor="autoGuidance" style={detailStyles.autoGuidanceLabel}>
            Auto guidance OFF: <span style={{ color: 'rgba(255,255,255,0.5)' }}>Suggesting one fix at a time.</span>
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
  fixesSection: {},
  fixesGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginBottom: 16,
  },
  fixCard: {
    padding: 20,
    background: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    border: '1px solid rgba(255, 255, 255, 0.06)',
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
  const [selectedLeak, setSelectedLeak] = useState(null);

  // Use real hooks for data
  const { leaks: fetchedLeaks, isLoading: leaksLoading } = useLeaks();
  const { stats: fetchedStats, isLoading: statsLoading } = useAssistantStats();

  // Separate active and past leaks
  const activeLeaks = fetchedLeaks.filter(l => l.status !== 'resolved');
  const pastLeaks = fetchedLeaks.filter(l => l.status === 'resolved');

  // Use fetched stats or defaults
  const stats = {
    sessionsReviewed: fetchedStats.sessionsReviewed || 0,
    handsAnalyzed: fetchedStats.handsAnalyzed || 0,
    leaksFound: activeLeaks.length,
    avgEvLoss: fetchedStats.avgEvLoss || -0.07,
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-select first leak when data loads
  useEffect(() => {
    if (activeLeaks.length > 0 && !selectedLeak) {
      setSelectedLeak(activeLeaks[0]);
    }
  }, [activeLeaks, selectedLeak]);

  const handlePracticeSandbox = () => {
    router.push('/hub/personal-assistant/sandbox');
  };

  const handleTrainDrills = () => {
    router.push('/hub/training');
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
      <Head>
        <title>Leak Finder — Smarter.Poker</title>
        <meta name="description" content="Post-session leak detection and improvement tracking" />
        <meta name="viewport" content="width=800, user-scalable=no" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`
          .leaks-page { width: 800px; max-width: 800px; margin: 0 auto; overflow-x: hidden; }
          @media (max-width: 500px) { .leaks-page { zoom: 0.5; } }
          @media (min-width: 501px) and (max-width: 700px) { .leaks-page { zoom: 0.75; } }
          @media (min-width: 701px) and (max-width: 900px) { .leaks-page { zoom: 0.95; } }
          @media (min-width: 901px) { .leaks-page { zoom: 1.2; } }
          @media (min-width: 1400px) { .leaks-page { zoom: 1.5; } }
        `}</style>
      </Head>

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
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Sessions Reviewed:</span>
            <span style={styles.statValue}>{stats.sessionsReviewed}</span>
          </div>
          <div style={styles.statDivider}>|</div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Hands Analyzed:</span>
            <span style={styles.statValue}>{stats.handsAnalyzed.toLocaleString()}</span>
          </div>
          <div style={styles.statDivider}>|</div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Leaks Found:</span>
            <span style={styles.statValue}>{stats.leaksFound}</span>
          </div>
          <div style={styles.statDivider}>|</div>
          <div style={styles.statItem}>
            <span style={styles.statLabel}>Avg EV Loss:</span>
            <span style={{ ...styles.statValue, color: '#ef4444' }}>
              <span style={styles.trendIcon}>~</span>
              {stats.avgEvLoss.toFixed(2)} BB/Occurrence
            </span>
          </div>
        </div>

        {/* Main Layout */}
        <div style={styles.mainLayout}>
          {/* Left Panel - Leak Index */}
          <div style={styles.leftPanel}>
            <div style={styles.indexHeader}>
              <h3 style={styles.indexTitle}>Leak Index</h3>
              <button style={styles.expandBtn}>&#8250;</button>
            </div>

            {/* Active Leaks */}
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
                    <span style={styles.leakCardConfidence}>
                      {'*'.repeat(leak.confidence === 'high' ? 3 : leak.confidence === 'medium' ? 2 : 1)}
                      {leak.confidence === 'high' ? 'HiConfide' : leak.confidence === 'medium' ? 'VxMedium' : 'Low'}
                    </span>
                  </div>
                  <div style={styles.leakCardSituation}>
                    Period Analyzed:<br />
                    {leak.situationClass}
                  </div>
                </div>
              ))}
            </div>

            {/* Past Leaks */}
            <div style={styles.pastLeaksSection}>
              <h4 style={styles.pastLeaksTitle}>Leak Past Poit</h4>
              {pastLeaks.map((leak) => (
                <div key={leak.id} style={styles.pastLeakCard}>
                  <div style={styles.pastLeakHeader}>
                    <LeakStatusBadge status={leak.status} />
                    <span style={styles.pastLeakTitle}>{leak.title}</span>
                    <span style={styles.pastLeakArrow}>&#8250;</span>
                  </div>
                  <div style={styles.pastLeakMeta}>
                    Period Analyzed: {leak.situationClass}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel - Leak Detail */}
          <LeakDetailView
            leak={selectedLeak}
            onPracticeSandbox={handlePracticeSandbox}
            onTrainDrills={handleTrainDrills}
          />
        </div>
      </div>
    </PageTransition>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

const styles = {
  container: {
    minHeight: '100vh',
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
    padding: '12px 20px',
    background: '#fff',
    borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
  },
  topBarLeft: {
    display: 'flex',
    alignItems: 'center',
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
    gap: 16,
    padding: '12px 20px',
    background: '#fff',
    borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
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
    minHeight: 'calc(100vh - 160px)',
    background: '#0a1628',
  },

  // Left Panel
  leftPanel: {
    width: 280,
    background: 'rgba(255, 255, 255, 0.02)',
    borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    padding: 16,
    overflowY: 'auto',
  },
  indexHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
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
