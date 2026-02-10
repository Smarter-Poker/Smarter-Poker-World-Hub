/**
 * Trivia - Settings
 * Preferences are saved to Supabase via triviaPreferences service
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { getAuthUser } from '../../../src/lib/authUtils';
import { getTriviaPreferences, updateTriviaPreferences } from '../../../src/services/triviaPreferences';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function TriviaSettings() {
    const router = useRouter();
    const [userId, setUserId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    const [preferences, setPreferences] = useState({
        soundEffects: true,
        timerEnabled: true,
        hintsEnabled: false,
        difficulty: 'medium'
    });

    useEffect(() => {
        async function loadPreferences() {
            try {
                const user = getAuthUser();
                if (user) {
                    setUserId(user.id);
                    const prefs = await getTriviaPreferences(user.id);
                    setPreferences(prev => ({ ...prev, ...prefs }));
                }
            } catch (error) {
                console.error('Error loading preferences:', error);
            }
            setIsLoading(false);
        }

        loadPreferences();
    }, []);

    const handleToggle = (key) => {
        setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
        setSaveMessage(''); // Clear any previous message
    };

    const handleDifficultyChange = (value) => {
        setPreferences(prev => ({ ...prev, difficulty: value }));
        setSaveMessage('');
    };

    const handleSave = async () => {
        if (!userId) {
            setSaveMessage('Please sign in to save preferences');
            return;
        }

        setIsSaving(true);
        try {
            await updateTriviaPreferences(userId, preferences);
            setSaveMessage('Settings saved successfully!');
            setTimeout(() => {
                router.push('/hub/trivia');
            }, 1000);
        } catch (error) {
            console.error('Error saving preferences:', error);
            setSaveMessage('Failed to save. Please try again.');
        }
        setIsSaving(false);
    };

    const ToggleSwitch = ({ checked, onChange }) => (
        <div
            onClick={onChange}
            style={{
                width: '50px',
                height: '26px',
                background: checked ? '#8b5cf6' : 'rgba(255,255,255,0.1)',
                borderRadius: '13px',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s'
            }}
        >
            <div style={{
                width: '22px',
                height: '22px',
                background: '#fff',
                borderRadius: '50%',
                position: 'absolute',
                top: '2px',
                left: checked ? '26px' : '2px',
                transition: 'left 0.2s'
            }} />
        </div>
    );

    return (
        <>
            <Head>
                <title>Settings | Trivia</title>
            </Head>

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '800px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/trivia')}
                            style={{
                                background: 'rgba(139, 92, 246, 0.1)',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                color: '#8b5cf6',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            ← Back to Trivia
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '12px' }}>
                            Trivia Settings
                        </h1>
                        <p style={{ color: '#9ca3af', marginBottom: '40px' }}>
                            Customize your trivia experience
                        </p>

                        {isLoading ? (
                            <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '40px' }}>
                                Loading settings...
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '20px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>Sound Effects</div>
                                            <div style={{ color: '#9ca3af', fontSize: '14px' }}>Play sounds for correct/incorrect answers</div>
                                        </div>
                                        <ToggleSwitch
                                            checked={preferences.soundEffects}
                                            onChange={() => handleToggle('soundEffects')}
                                        />
                                    </div>
                                </div>

                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>Timer</div>
                                            <div style={{ color: '#9ca3af', fontSize: '14px' }}>Show countdown timer during questions</div>
                                        </div>
                                        <ToggleSwitch
                                            checked={preferences.timerEnabled}
                                            onChange={() => handleToggle('timerEnabled')}
                                        />
                                    </div>
                                </div>

                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>Show Hints</div>
                                            <div style={{ color: '#9ca3af', fontSize: '14px' }}>Display hints for difficult questions</div>
                                        </div>
                                        <ToggleSwitch
                                            checked={preferences.hintsEnabled}
                                            onChange={() => handleToggle('hintsEnabled')}
                                        />
                                    </div>
                                </div>

                                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px' }}>
                                    <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '12px' }}>Difficulty Level</div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {['easy', 'medium', 'hard', 'expert'].map(level => (
                                            <button
                                                key={level}
                                                onClick={() => handleDifficultyChange(level)}
                                                style={{
                                                    flex: 1,
                                                    padding: '12px',
                                                    background: preferences.difficulty === level ? '#8b5cf6' : 'rgba(255,255,255,0.05)',
                                                    border: preferences.difficulty === level ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                                    color: '#fff',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    fontWeight: preferences.difficulty === level ? 'bold' : 'normal',
                                                    textTransform: 'capitalize'
                                                }}
                                            >
                                                {level}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {saveMessage && (
                            <div style={{
                                marginTop: '20px',
                                padding: '12px',
                                background: saveMessage.includes('success') ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                border: `1px solid ${saveMessage.includes('success') ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                                borderRadius: '8px',
                                color: saveMessage.includes('success') ? '#10b981' : '#ef4444',
                                textAlign: 'center'
                            }}>
                                {saveMessage}
                            </div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={isSaving || isLoading}
                            style={{
                                background: isSaving ? 'rgba(139, 92, 246, 0.5)' : '#8b5cf6',
                                border: 'none',
                                color: '#fff',
                                padding: '16px 32px',
                                borderRadius: '8px',
                                cursor: isSaving ? 'not-allowed' : 'pointer',
                                fontWeight: 'bold',
                                fontSize: '16px',
                                marginTop: '30px',
                                width: '100%'
                            }}
                        >
                            {isSaving ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>
                </div>
            </PageTransition>
        </>
    );
}
