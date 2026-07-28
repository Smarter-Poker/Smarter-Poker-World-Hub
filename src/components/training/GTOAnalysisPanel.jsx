/**
 * GTO Analysis Panel
 * ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
 * Displays comprehensive GTO analysis with:
 * - Dynamic action header (FOLD/CALL/RAISE/3-BET/4-BET/ALL-IN)
 * - Explanation section
 * - GTO Approach section
 * - EV Analysis section
 * - Alternate Lines (for mixed strategies)
 *
 * Matches the user's mockup design with metal UI styling
 */

import React, { useState, useEffect } from 'react';
import useVIPGate from '../../hooks/useVIPGate';
import VIPGateModal from '../ui/VIPGateModal';

// Action colors
const ACTION_COLORS = {
    'FOLD': '#ff4444',
    'CHECK': '#888888',
    'CALL': '#ffaa00',
    'BET': '#00d4ff',
    'RAISE': '#00ff88',
    '3-BET': '#00ff88',
    '4-BET': '#aa44ff',
    'OVERBET': '#ff6600',
    'ALL-IN': '#ff00ff',
};

/**
 * GTOAnalysisPanel Component
 * @param {Object} props
 * @param {string} props.hand - Hero hand (e.g., "AKs")
 * @param {string} props.position - Hero position (e.g., "BTN")
 * @param {number} props.stackDepth - Stack depth in BB
 * @param {string} props.board - Board cards
 * @param {string} props.street - Current street
 * @param {string} props.villainPosition - Villain position
 * @param {string} props.action - Facing action
 * @param {string} props.gameType - Game type (cash/mtt)
 * @param {Object} props.analysisData - Pre-fetched analysis data (optional)
 * @param {Function} props.onClose - Close handler
 */
export default function GTOAnalysisPanel({
    hand,
    position = 'BTN',
    stackDepth = 100,
    board = '',
    street = 'flop',
    villainPosition = 'BB',
    action = '',
    gameType = 'cash',
    analysisData = null,
    onClose,
}) {
    const [analysis, setAnalysis] = useState(analysisData);
    const [loading, setLoading] = useState(!analysisData);
    const [error, setError] = useState(null);
    const [expandedSections, setExpandedSections] = useState({
        explanation: true,
        gtoApproach: true,
        evAnalysis: true,
        alternateLines: true,
    });
    
    // VIP Gating
    const { showUpgradeModal, upgradeModalVisible, hideUpgradeModal, featureConfig } = useVIPGate('gto-training');

    // Fetch analysis if not provided
    useEffect(() => {
        if (analysisData) {
            setAnalysis(analysisData);
            setLoading(false);
            return;
        }

        if (!hand) return;

        const fetchAnalysis = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await fetch('/api/gto/gto-analysis', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        hand,
                        position,
                        stackDepth,
                        board,
                        street,
                        villainPosition,
                        action,
                        gameType,
                    }),
                });

                const data = await response.json();

                if (data.success) {
                    setAnalysis(data);
                } else {
                    setError(data.error || 'Failed to get analysis');
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchAnalysis();
    }, [hand, position, stackDepth, board, street, villainPosition, action, gameType, analysisData]);

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section],
        }));
    };

    // Loading state
    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loadingContainer}>
                    <div style={styles.loadingSpinner} />
                    <p style={styles.loadingText}>Analyzing With PioSolver...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        const isVipError = error.includes('VIP subscription required');
        
        return (
            <div style={styles.container}>
                <div style={styles.errorContainer}>
                    <p style={styles.errorText}>
                        {isVipError ? 'Advanced post-flop solver scenarios are for VIP members only.' : `Analysis failed: ${error}`}
                    </p>
                    {isVipError ? (
                        <button onClick={showUpgradeModal} style={{ ...styles.closeButton, background: '#FFD700', color: '#000', marginBottom: 12 }}>
                            Unlock with VIP
                        </button>
                    ) : null}
                    <button onClick={onClose} style={styles.closeButton}>Close</button>
                </div>
                
                <VIPGateModal 
                    visible={upgradeModalVisible}
                    onClose={hideUpgradeModal}
                    featureName="Deep Solver Analysis"
                    featureConfig={featureConfig}
                />
            </div>
        );
    }

    if (!analysis) return null;

    const actionColor = analysis.actionColor || ACTION_COLORS[analysis.optimalAction] || '#00ff88';

    return (
        <div style={styles.container}>
            {/* Header with Jarvis avatar */}
            <div style={styles.header}>
                <img
                    src="/images/jarvis-avatar.png"
                    alt="Jarvis"
                    style={styles.avatar}
                    onError={(e) => { e.target.style.display = 'none'; }}
                />
                {onClose && (
                    <button onClick={onClose} style={styles.closeBtn}>X</button>
                )}
            </div>

            {/* Dynamic Action Header */}
            <div style={{
                ...styles.actionHeader,
                background: `linear-gradient(135deg, ${actionColor}22 0%, ${actionColor}44 100%)`,
                borderColor: actionColor,
            }}>
                <span style={{ ...styles.actionText, color: actionColor }}>
                    {analysis.optimalAction}
                </span>
                {analysis.frequencyPct && (
                    <span style={styles.frequencyBadge}>{analysis.frequencyPct}</span>
                )}
            </div>

            {/* Source Badge */}
            <div style={styles.sourceBadge}>
                {analysis.source === 'PIO_SOLVER' ? (
                    <span style={styles.pioLabel}>PioSolver Data</span>
                ) : (
                    <span style={styles.aiLabel}>AI Generated</span>
                )}
                {analysis.fromCache && <span style={styles.cachedLabel}>Cached</span>}
            </div>

            {/* Explanation Section */}
            <Section
                icon="info"
                title="Explanation"
                content={analysis.explanation}
                expanded={expandedSections.explanation}
                onToggle={() => toggleSection('explanation')}
            />

            {/* GTO Approach Section */}
            <Section
                icon="target"
                title="GTO Approach"
                content={analysis.gtoApproach}
                expanded={expandedSections.gtoApproach}
                onToggle={() => toggleSection('gtoApproach')}
            />

            {/* EV Analysis Section */}
            {analysis.evAnalysis && (
                <Section
                    icon="dollar"
                    title="EV Analysis"
                    expanded={expandedSections.evAnalysis}
                    onToggle={() => toggleSection('evAnalysis')}
                >
                    <div style={styles.evContainer}>
                        <span style={{
                            ...styles.evValue,
                            color: analysis.evAnalysis.ev >= 0 ? '#00ff88' : '#ff4444',
                        }}>
                            {analysis.evAnalysis.evDisplay || `${analysis.evAnalysis.ev >= 0 ? '+' : ''}${analysis.evAnalysis.ev?.toFixed(2)}bb`}
                        </span>
                        <p style={styles.sectionContent}>{analysis.evAnalysis.description}</p>
                    </div>
                </Section>
            )}

            {/* Alternate Lines Section (only for mixed strategies) */}
            {analysis.isMixed && analysis.alternateLines?.length > 0 && (
                <Section
                    icon="lines"
                    title={`${analysis.alternateLines.length} Alternate Lines`}
                    expanded={expandedSections.alternateLines}
                    onToggle={() => toggleSection('alternateLines')}
                >
                    <div style={styles.alternatesContainer}>
                        {analysis.alternateLines.map((line, idx) => (
                            <div key={idx} style={styles.alternateLine}>
                                <span style={{
                                    ...styles.altAction,
                                    color: ACTION_COLORS[line.action] || '#888',
                                }}>
                                    {line.action}
                                </span>
                                <span style={styles.altFrequency}>
                                    {line.frequencyPct || `${(line.frequency * 100).toFixed(0)}%`}
                                </span>
                                {line.reason && (
                                    <span style={styles.altReason}>{line.reason}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </Section>
            )}
        </div>
    );
}

/**
 * Collapsible Section Component
 */
function Section({ icon, title, content, children, expanded, onToggle }) {
    const iconMap = {
        info: 'i',
        target: String.fromCodePoint(0x1F3AF).replace(/[\u{1F300}-\u{1FFFF}]/gu, '') || '\u2316',
        dollar: '$',
        lines: '\u2261',
    };

    return (
        <div style={styles.section}>
            <div style={styles.sectionHeader} onClick={onToggle}>
                <span style={styles.sectionIcon}>{iconMap[icon] || icon}</span>
                <span style={styles.sectionTitle}>{title}</span>
                <span style={styles.expandIcon}>{expanded ? '\u25B2' : '\u25BC'}</span>
            </div>
            {expanded && (
                <div style={styles.sectionBody}>
                    {content && <p style={styles.sectionContent}>{content}</p>}
                    {children}
                </div>
            )}
        </div>
    );
}

const styles = {
    container: {
        background: 'linear-gradient(180deg, #1a2332 0%, #0d1520 50%, #0a0a15 100%)',
        borderRadius: 16,
        padding: 16,
        maxWidth: 400,
        border: '1px solid rgba(0, 212, 255, 0.3)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: '2px solid #00d4ff',
        boxShadow: '0 0 12px rgba(0, 212, 255, 0.4)',
    },
    closeBtn: {
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        color: '#fff',
        width: 28,
        height: 28,
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
    },
    actionHeader: {
        borderRadius: 12,
        padding: '16px 20px',
        textAlign: 'center',
        marginBottom: 12,
        border: '2px solid',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    actionText: {
        fontSize: 24,
        fontWeight: 800,
        letterSpacing: 2,
        textTransform: 'uppercase',
        fontFamily: 'Orbitron, monospace',
        textShadow: '0 0 20px currentColor',
    },
    frequencyBadge: {
        background: 'rgba(255, 255, 255, 0.1)',
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 12,
        color: '#aaa',
        fontWeight: 600,
    },
    sourceBadge: {
        display: 'flex',
        gap: 8,
        marginBottom: 12,
        justifyContent: 'center',
    },
    pioLabel: {
        background: 'linear-gradient(135deg, #00ff88, #00d4ff)',
        color: '#000',
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
    },
    aiLabel: {
        background: 'linear-gradient(135deg, #ff6600, #ffaa00)',
        color: '#000',
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
    },
    cachedLabel: {
        background: 'rgba(255, 255, 255, 0.1)',
        color: '#888',
        padding: '3px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
    },
    section: {
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 10,
        marginBottom: 8,
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.08)',
    },
    sectionHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        cursor: 'pointer',
        background: 'rgba(0, 0, 0, 0.2)',
    },
    sectionIcon: {
        width: 20,
        height: 20,
        background: 'rgba(0, 212, 255, 0.2)',
        borderRadius: 6,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        color: '#00d4ff',
        fontWeight: 700,
    },
    sectionTitle: {
        flex: 1,
        fontSize: 13,
        fontWeight: 600,
        color: '#fff',
    },
    expandIcon: {
        fontSize: 10,
        color: '#666',
    },
    sectionBody: {
        padding: '10px 12px',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
    },
    sectionContent: {
        fontSize: 12,
        lineHeight: 1.6,
        color: '#bbb',
        margin: 0,
    },
    evContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    evValue: {
        fontSize: 20,
        fontWeight: 700,
        fontFamily: 'Orbitron, monospace',
    },
    alternatesContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
    },
    alternateLine: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        background: 'rgba(0, 0, 0, 0.2)',
        borderRadius: 6,
        flexWrap: 'wrap',
    },
    altAction: {
        fontWeight: 700,
        fontSize: 12,
        textTransform: 'uppercase',
    },
    altFrequency: {
        fontSize: 11,
        color: '#ffaa00',
        fontWeight: 600,
    },
    altReason: {
        fontSize: 10,
        color: '#888',
        width: '100%',
        marginTop: 2,
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    loadingSpinner: {
        width: 32,
        height: 32,
        border: '3px solid rgba(0, 212, 255, 0.2)',
        borderTop: '3px solid #00d4ff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 12,
        color: '#888',
    },
    errorContainer: {
        textAlign: 'center',
        padding: 20,
    },
    errorText: {
        color: '#ff4444',
        fontSize: 12,
        marginBottom: 12,
    },
    closeButton: {
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 8,
        color: '#fff',
        padding: '8px 16px',
        cursor: 'pointer',
    },
};

// CSS keyframes for loading spinner (add to your global CSS or head)
if (typeof document !== 'undefined') {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    if (!document.getElementById('gto-analysis-styles')) {
        styleSheet.id = 'gto-analysis-styles';
        document.head.appendChild(styleSheet);
    }
}
