/**
 * GTOScenarioDisplay - Premium Futuristic GTO Analysis Panel
 * 
 * Features:
 * - Jarvis AI avatar with glowing effect
 * - Primary action with confidence percentage
 * - Collapsible sections (Explanation, GTO Approach, EV Analysis, Alternate Lines)
 * - Highlighted GTO terminology
 * - Futuristic metal/glassmorphism design
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Info, Target, DollarSign, GitBranch, Brain } from 'lucide-react';
import styles from './GTOScenarioDisplay.module.css';

// Jarvis avatar - using the official persona
const JARVIS_AVATAR = '/images/horses/jarvis.png';

// Highlight GTO keywords in text
const highlightKeywords = (text) => {
    const keywords = [
        'GTO', 'EV', 'Expected Value', 'fold equity', 'pot equity', 'range',
        'balanced range', 'value', 'bluff', 'polarized', 'linear', 'solver',
        'frequency', 'optimal', 'equity realization', 'ICM', 'chip EV', 'SPR',
        'stack-to-pot ratio', 'big blinds', 'bb', 'aggression', 'check-raise',
        'continuation bet', 'c-bet', 'float', 'probe', '3-bet', '4-bet'
    ];

    let result = text;
    keywords.forEach(keyword => {
        const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
        result = result.replace(regex, '<span class="gto-highlight">$1</span>');
    });
    return result;
};

// Action color mapping
const getActionColor = (action) => {
    const colors = {
        'RAISE': '#00ff88',
        'BET': '#00ff88',
        'CALL': '#ffc107',
        'CHECK': '#06b6d4',
        'FOLD': '#ef4444',
        'ALL-IN': '#a855f7',
        'SHOVE': '#a855f7'
    };
    return colors[action?.toUpperCase()] || '#00ff88';
};

// Collapsible Section Component
const CollapsibleSection = ({ icon: Icon, title, children, defaultOpen = true, accentColor = '#06b6d4' }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className={styles.section} style={{ '--accent-color': accentColor }}>
            <button
                className={styles.sectionHeader}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className={styles.sectionTitle}>
                    <Icon size={18} className={styles.sectionIcon} />
                    <span>{title}</span>
                </div>
                {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            {isOpen && (
                <div className={styles.sectionContent}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default function GTOScenarioDisplay({
    action,
    confidence,
    explanation,
    gtoApproach,
    evAnalysis,
    alternateLines = [],
    isCorrectAnswer,
    showDetails = true,
    // Optional: AI-generated image URL (from Grok)
    imageUrl,
    // Optional: Question data for AI image generation
    question,
    category,
    difficulty,
    options,
    correctIndex,
}) {
    const [aiImageUrl, setAiImageUrl] = useState(imageUrl || null);
    const [isLoadingImage, setIsLoadingImage] = useState(false);
    const actionColor = getActionColor(action);

    // Optionally fetch AI-generated panel image
    const fetchAiPanel = async () => {
        if (aiImageUrl || isLoadingImage) return;

        setIsLoadingImage(true);
        try {
            const response = await fetch('/api/trivia/render-gto-panel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    correctAnswer: options?.[correctIndex],
                    explanation,
                    difficulty,
                    category,
                    options,
                    correctIndex,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                if (data.imageUrl) {
                    setAiImageUrl(data.imageUrl);
                }
            }
        } catch (error) {
            console.error('Failed to fetch AI panel:', error);
        } finally {
            setIsLoadingImage(false);
        }
    };

    // If we have an AI-generated image, display it instead of React components
    if (aiImageUrl) {
        return (
            <div className={styles.aiPanelContainer}>
                <img
                    src={aiImageUrl}
                    alt="GTO Analysis"
                    className={styles.aiPanelImage}
                    loading="lazy"
                />
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Corner Badge */}
            <div className={styles.cornerBadge}>Smarter Poker Data</div>

            {/* Header Section */}
            <div className={styles.header}>
                {/* Jarvis Avatar */}
                <div className={styles.avatarContainer}>
                    <div className={styles.avatarGlow}></div>
                    <img
                        src={JARVIS_AVATAR}
                        alt="Jarvis AI"
                        className={styles.avatar}
                        onError={(e) => {
                            e.target.src = '/images/default-avatar.png';
                        }}
                    />
                    <span className={styles.avatarLabel}>JARVIS</span>
                </div>

                {/* Primary Action */}
                <div className={styles.actionContainer}>
                    <div
                        className={styles.actionBox}
                        style={{ '--action-color': actionColor }}
                    >
                        <span className={styles.actionText}>{action}</span>
                    </div>
                </div>

                {/* Confidence Percentage */}
                <div
                    className={styles.confidenceContainer}
                    style={{ '--confidence-color': actionColor }}
                >
                    <div className={styles.confidenceCircle}>
                        <span className={styles.confidenceValue}>{confidence}%</span>
                    </div>
                </div>
            </div>

            {/* Content Sections */}
            {showDetails && (
                <div className={styles.sectionsContainer}>
                    {/* Explanation */}
                    {explanation && (
                        <CollapsibleSection
                            icon={Info}
                            title="Explanation"
                            accentColor="#06b6d4"
                        >
                            <p
                                className={styles.explanationText}
                                dangerouslySetInnerHTML={{
                                    __html: highlightKeywords(explanation)
                                }}
                            />
                        </CollapsibleSection>
                    )}

                    {/* GTO Approach */}
                    {gtoApproach && (
                        <CollapsibleSection
                            icon={Target}
                            title="GTO Approach"
                            accentColor="#00ff88"
                        >
                            <p
                                className={styles.explanationText}
                                dangerouslySetInnerHTML={{
                                    __html: highlightKeywords(gtoApproach)
                                }}
                            />
                        </CollapsibleSection>
                    )}

                    {/* EV Analysis */}
                    {evAnalysis && (
                        <CollapsibleSection
                            icon={DollarSign}
                            title="EV Analysis"
                            accentColor="#ffc107"
                        >
                            <div className={styles.evContainer}>
                                <div className={styles.evValue}>
                                    {evAnalysis.value >= 0 ? '+' : ''}{evAnalysis.value}bb
                                </div>
                                <p
                                    className={styles.evDescription}
                                    dangerouslySetInnerHTML={{
                                        __html: highlightKeywords(evAnalysis.description)
                                    }}
                                />
                            </div>
                        </CollapsibleSection>
                    )}

                    {/* Alternate Lines */}
                    {alternateLines.length > 0 && (
                        <CollapsibleSection
                            icon={GitBranch}
                            title={`${alternateLines.length} Alternate Lines`}
                            accentColor="#a855f7"
                            defaultOpen={false}
                        >
                            <div className={styles.alternateLines}>
                                {alternateLines.map((line, idx) => (
                                    <div key={idx} className={styles.alternateLine}>
                                        <div className={styles.lineAction}>
                                            <span
                                                className={styles.lineIndicator}
                                                style={{
                                                    backgroundColor: line.action === 'FOLD' ? '#ef4444' : '#ffc107'
                                                }}
                                            />
                                            <span className={styles.lineActionText}>{line.action}</span>
                                            <span className={styles.lineFrequency}>{line.frequency}% frequency</span>
                                        </div>
                                        <p className={styles.lineDescription}>{line.description}</p>
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}
                </div>
            )}

            {/* Bottom Accent Line */}
            <div className={styles.bottomAccent} />
        </div>
    );
}

// Compact version for trivia questions
export function GTOScenarioCompact({ action, confidence, explanation }) {
    const actionColor = getActionColor(action);

    return (
        <div className={styles.compactContainer}>
            <div className={styles.compactHeader}>
                <img
                    src={JARVIS_AVATAR}
                    alt="Jarvis"
                    className={styles.compactAvatar}
                />
                <div
                    className={styles.compactAction}
                    style={{ '--action-color': actionColor }}
                >
                    {action}
                </div>
                <div className={styles.compactConfidence}>
                    {confidence}%
                </div>
            </div>
            {explanation && (
                <p
                    className={styles.compactExplanation}
                    dangerouslySetInnerHTML={{
                        __html: highlightKeywords(explanation)
                    }}
                />
            )}
        </div>
    );
}
