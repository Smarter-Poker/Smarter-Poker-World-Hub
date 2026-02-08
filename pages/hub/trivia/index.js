/**
 * TRIVIA HUB - Main lobby page
 * Route: /hub/trivia
 */

import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../src/lib/supabase';
import { getAuthUser } from '../../../src/lib/authUtils';
import { useAvatar } from '../../../src/contexts/AvatarContext';

import PageTransition from '../../../src/components/transitions/PageTransition';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaLobby from '../../../src/components/trivia/TriviaLobby';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { getTriviaPreferences, updateTriviaPreferences } from '../../../src/services/triviaPreferences';

export default function TriviaHubPage() {
    const { user } = useAvatar();
    const userId = user?.id;
    const [userDiamonds, setUserDiamonds] = useState(0);
    const [dailyCompleted, setDailyCompleted] = useState(false);
    const [currentStreak, setCurrentStreak] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [menuOpen, setMenuOpen] = useState(false);

    // Hamburger menu preferences
    const [preferences, setPreferences] = useState({
        soundEffects: true,
        showHints: true
    });

    // Load preferences from Supabase on mount
    useEffect(() => {
        if (userId) {
            getTriviaPreferences(userId).then(setPreferences);
        }
    }, []);

    const updatePreference = useCallback(async (key, value) => {
        const newPrefs = { ...preferences, [key]: value };
        setPreferences(newPrefs);

        if (userId) {
            try {
                await updateTriviaPreferences(userId, { [key]: value });
            } catch (error) {
                console.error('Failed to save preference:', error);
            }
        }
    }, [preferences]);

    const menuConfig = getMenuConfig('trivia', user, preferences, {
        setSoundEffects: (val) => updatePreference('soundEffects', val),
        setShowHints: (val) => updatePreference('showHints', val)
    });

    // Using existing supabase instance from lib

    useEffect(() => {
        async function loadUserData() {
            try {
                //  BULLETPROOF: Use authUtils to avoid AbortError
                const user = getAuthUser();

                if (user) {
                    // Get user profile for diamonds
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('diamonds')
                        .eq('id', user.id)
                        .single();

                    if (profile) {
                        setUserDiamonds(profile.diamonds || 0);
                    }

                    // Check if daily trivia completed today
                    const today = getTodayCST();
                    const { data: dailyPlay } = await supabase
                        .from('daily_trivia_plays')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('played_date', today)
                        .single();

                    setDailyCompleted(!!dailyPlay);

                    // Get streak
                    const { data: streakData } = await supabase
                        .from('trivia_streaks')
                        .select('current_streak')
                        .eq('user_id', user.id)
                        .single();

                    if (streakData) {
                        setCurrentStreak(streakData.current_streak || 0);
                    }
                }
            } catch (error) {
                console.error('Error loading user data:', error);
            }
            setIsLoading(false);
        }

        loadUserData();
    }, []);

    function getTodayCST() {
        const now = new Date();
        const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
        const year = cstDate.getFullYear();
        const month = String(cstDate.getMonth() + 1).padStart(2, '0');
        const day = String(cstDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return (
        <PageTransition>
            <Head>
                <title>Trivia - Smarter.Poker</title>
                <meta name="description" content="Test your poker knowledge with daily trivia and earn rewards" />
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div className="trivia-page">
                <div className="bg-overlay" />

                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} />

                {/* Hamburger Menu */}
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="left"
                    theme="dark"
                    user={null}
                    showProfile={false}
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                <div className="content">
                    {isLoading ? (
                        <div className="loading">
                            <div className="spinner" />
                            <p>Loading...</p>
                        </div>
                    ) : (
                        <TriviaLobby
                            userDiamonds={userDiamonds}
                            dailyCompleted={dailyCompleted}
                            currentStreak={currentStreak}
                        />
                    )}
                </div>
            </div>

            <style jsx>{`
                .trivia-page {
                    min-height: 100vh;
                    background: url('/images/trivia/trivia-bg.jpg') center center / cover no-repeat;
                    background-color: #0a1628;
                    font-family: 'Inter', -apple-system, sans-serif;
                    position: relative;
                    width: 100%;
                    max-width: 100%;
                    margin: 0 auto;
                    overflow-x: hidden;
                }

                
                
                
                
                

                .bg-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background:
                        radial-gradient(ellipse at 30% 20%, rgba(14, 165, 233, 0.08), transparent 50%),
                        radial-gradient(ellipse at 70% 80%, rgba(139, 92, 246, 0.06), transparent 50%);
                    pointer-events: none;
                }

                .content {
                    position: relative;
                    padding: 15px 0 40px;
                }

                .loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 60vh;
                    color: rgba(255, 255, 255, 0.6);
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.1);
                    border-top-color: #0ea5e9;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 16px;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </PageTransition>
    );
}
