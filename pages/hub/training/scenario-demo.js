/**
 * Training Scenario Demo Page
 * For testing the new TrainingHandScenarioPlayer component
 */

import React, { useState } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import TrainingHandScenarioPlayer from '../../../src/components/training/TrainingHandScenarioPlayer';
import { validateScenarioSchema } from '../../../src/utils/training/timelineMapper';

// Import demo scenario
import demoScenarioRaw from '../../../src/components/training/demoScenario.json';

export default function ScenarioDemoPage() {
    const [debugMode, setDebugMode] = useState(true);
    const [key, setKey] = useState(0);

    // Validate and transform demo scenario
    const validation = validateScenarioSchema(demoScenarioRaw);
    const scenario = validation.valid ? validation.sanitized : null;

    const handleAnswer = (value, isCorrect) => {
        console.log('[Demo] Answer submitted:', value, 'Correct:', isCorrect);
    };

    const handleComplete = () => {
        console.log('[Demo] Scenario complete, restarting...');
        setKey(k => k + 1);
    };

    return (
        <>
            <SEOHead
                title="Training Scenario Demo"
                description="Preview A GTO Training Scenario On Smarter.Poker."
                noindex={true}
            />

            <div style={styles.page}>
                {/* Debug Toggle */}
                <div style={styles.toolbar}>
                    <button
                        style={styles.debugToggle}
                        onClick={() => setDebugMode(!debugMode)}
                    >
                        Debug: {debugMode ? 'ON' : 'OFF'}
                    </button>
                    <button
                        style={styles.debugToggle}
                        onClick={() => setKey(k => k + 1)}
                    >
                        Restart
                    </button>
                    {!validation.valid && (
                        <span style={styles.errorLabel}>
                            Schema Error: {validation.errors[0]}
                        </span>
                    )}
                </div>

                {/* The Player */}
                <div style={styles.playerContainer}>
                    <TrainingHandScenarioPlayer
                        key={key}
                        scenario={scenario}
                        gameTitle="TRIPLE BARREL"
                        streak={3}
                        questionNumber={1}
                        totalQuestions={25}
                        onAnswer={handleAnswer}
                        onComplete={handleComplete}
                        debugMode={debugMode}
                    />
                </div>
            </div>
        </>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        background: '#0d0d14',
        display: 'flex',
        flexDirection: 'column',
    },

    toolbar: {
        display: 'flex',
        gap: 12,
        padding: '8px 16px',
        background: '#1a1a24',
        borderBottom: '1px solid #333',
        alignItems: 'center',
    },

    debugToggle: {
        padding: '6px 12px',
        background: '#2a2a3d',
        border: '1px solid #444',
        borderRadius: 6,
        color: '#00d4ff',
        fontSize: 12,
        cursor: 'pointer',
    },

    errorLabel: {
        color: '#ef4444',
        fontSize: 12,
        marginLeft: 'auto',
    },

    playerContainer: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
    },
};
