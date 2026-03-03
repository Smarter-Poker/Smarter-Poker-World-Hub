/**
 * Trivia - Settings
 * Preferences are saved to Supabase via triviaPreferences service
 * Facebook Dark color schema
 */

import { useState, useEffect } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
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

    const autoSave = async (newPrefs, onRollback) => {
        if (!userId) return;
        try {
            await updateTriviaPreferences(userId, newPrefs);
            setSaveMessage('Settings saved automatically');
            setTimeout(() => setSaveMessage(''), 2000);
        } catch (error) {
            console.error('Error auto-saving:', error);
            setSaveMessage('Failed to save. Please try again.');
            if (onRollback) onRollback();
        }
    };

    const handleToggle = (key) => {
        const oldValue = preferences[key];
        const newPrefs = { ...preferences, [key]: !oldValue };
        setPreferences(newPrefs);
        autoSave(newPrefs, () => {
            setPreferences(prev => ({ ...prev, [key]: oldValue }));
        });
    };

    const handleDifficultyChange = (value) => {
        const newPrefs = { ...preferences, difficulty: value };
        setPreferences(newPrefs);
        setSaveMessage(''); // Require manual save for non-toggles
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
                background: checked ? '#2374e1' : '#3a3b3c',
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
            <SEOHead
                title="Trivia Settings"
                description="Customize Your Poker Trivia Experience With Difficulty, Sound, And Display Settings."
                canonical="/hub/trivia/settings"
                noindex={true}
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', background: '#18191a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '800px', margin: '0 auto' }}>
                        <button
                            onClick={() => router.push('/hub/trivia')}
                            style={{
                                background: 'rgba(35, 116, 225, 0.1)',
                                border: '1px solid rgba(35, 116, 225, 0.3)',
                                color: '#2374e1',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                marginBottom: '20px'
                            }}
                        >
                            Back to Trivia
                        </button>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#e4e6eb', marginBottom: '12px' }}>
                            Trivia Settings
                        </h1>
                        <p style={{ color: '#65676b', marginBottom: '40px' }}>
                            Customize Your Trivia Experience
                        </p>

                        {isLoading ? (
                            <div style={{ color: '#65676b', textAlign: 'center', padding: '40px' }}>
                                Loading Settings...
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '20px' }}>
                                <div style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '12px', padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ color: '#e4e6eb', fontWeight: 'bold', marginBottom: '4px' }}>Sound Effects</div>
                                            <div style={{ color: '#65676b', fontSize: '14px' }}>Play Sounds For Correct/incorrect Answers</div>
                                        </div>
                                        <ToggleSwitch
                                            checked={preferences.soundEffects}
                                            onChange={() => handleToggle('soundEffects')}
                                        />
                                    </div>
                                </div>

                                <div style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '12px', padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ color: '#e4e6eb', fontWeight: 'bold', marginBottom: '4px' }}>Timer</div>
                                            <div style={{ color: '#65676b', fontSize: '14px' }}>Show Countdown Timer During Questions</div>
                                        </div>
                                        <ToggleSwitch
                                            checked={preferences.timerEnabled}
                                            onChange={() => handleToggle('timerEnabled')}
                                        />
                                    </div>
                                </div>

                                <div style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '12px', padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ color: '#e4e6eb', fontWeight: 'bold', marginBottom: '4px' }}>Show Hints</div>
                                            <div style={{ color: '#65676b', fontSize: '14px' }}>Display Hints For Difficult Questions</div>
                                        </div>
                                        <ToggleSwitch
                                            checked={preferences.hintsEnabled}
                                            onChange={() => handleToggle('hintsEnabled')}
                                        />
                                    </div>
                                </div>

                                <div style={{ background: '#242526', border: '1px solid #4e4f50', borderRadius: '12px', padding: '20px' }}>
                                    <div style={{ color: '#e4e6eb', fontWeight: 'bold', marginBottom: '12px' }}>Difficulty Level</div>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {['easy', 'medium', 'hard', 'expert'].map(level => (
                                            <button
                                                key={level}
                                                onClick={() => handleDifficultyChange(level)}
                                                style={{
                                                    flex: 1,
                                                    padding: '12px',
                                                    background: preferences.difficulty === level ? '#2374e1' : '#3a3b3c',
                                                    border: preferences.difficulty === level ? 'none' : '1px solid #4e4f50',
                                                    color: '#e4e6eb',
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
                                background: saveMessage.includes('success') || saveMessage.includes('automatically') ? 'rgba(49, 162, 76, 0.2)' : 'rgba(240, 40, 73, 0.2)',
                                border: `1px solid ${saveMessage.includes('success') || saveMessage.includes('automatically') ? 'rgba(49, 162, 76, 0.4)' : 'rgba(240, 40, 73, 0.4)'}`,
                                borderRadius: '8px',
                                color: saveMessage.includes('success') || saveMessage.includes('automatically') ? '#31a24c' : '#f02849',
                                textAlign: 'center'
                            }}>
                                {saveMessage}
                            </div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={isSaving || isLoading}
                            style={{
                                background: isSaving ? 'rgba(35, 116, 225, 0.5)' : '#2374e1',
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
