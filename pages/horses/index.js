/**
 * 🐴 HORSES ADMIN PAGE
 * Integrated into hub-vanguard Next.js app at /horses
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';
import styles from './horses.module.css';

// Initialize Supabase
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

// Demo personas for development
const DEMO_PERSONAS = [
    { id: 1, name: 'Marcus Chen', alias: 'VegasGrinder85', gender: 'male', location: 'Las Vegas, NV', specialty: 'cash_games', stakes: '2/5 NLH', bio: 'Started playing in underground LA games in 2008. Now a full-time 2/5 grinder at the Bellagio.', voice: 'analytical', is_active: true },
    { id: 2, name: 'Sarah Mitchell', alias: 'TexasQueen92', gender: 'female', location: 'Austin, TX', specialty: 'tournaments', stakes: '$200-$500 MTTs', bio: 'Former accountant who discovered poker during COVID. Cashed in 12 WSOP Circuit events.', voice: 'enthusiastic', is_active: true },
    { id: 3, name: 'Derek Williams', alias: 'LANitOwl', gender: 'male', location: 'Los Angeles, CA', specialty: 'high_stakes', stakes: '5/10+ PLO', bio: '15-year veteran of the Commerce Casino. Specializes in mixed games and PLO.', voice: 'experienced', is_active: true },
    { id: 4, name: 'Jennifer Park', alias: 'SeattleSolver', gender: 'female', location: 'Seattle, WA', specialty: 'gto', stakes: 'Online NL200', bio: 'Software engineer by day, GTO nerd by night. Runs solver analysis for study groups.', voice: 'technical', is_active: false },
    { id: 5, name: 'Michael Torres', alias: 'MiamiMike305', gender: 'male', location: 'Miami, FL', specialty: 'live_reads', stakes: '1/3 to 5/10', bio: 'Cuban-American poker pro who learned the game in Hialeah home games.', voice: 'street_smart', is_active: true },
    { id: 6, name: 'Ashley Rivera', alias: 'ChipQueenATL', gender: 'female', location: 'Atlanta, GA', specialty: 'tournaments', stakes: '$100-$300 MTTs', bio: 'Started with homegame Wednesdays. Now chasing bracelets full-time.', voice: 'passionate', is_active: true },
    { id: 7, name: 'James O\'Connor', alias: 'BostonJim77', gender: 'male', location: 'Boston, MA', specialty: 'cash_games', stakes: '1/2 to 2/5', bio: 'Retired firefighter who plays 40 hours a week at the local card room.', voice: 'experienced', is_active: true },
    { id: 8, name: 'David Kim', alias: 'SFBayGrinder', gender: 'male', location: 'San Francisco, CA', specialty: 'online', stakes: 'NL100-NL500', bio: 'Tech worker by day, online grinder by night. Runs a Discord study group.', voice: 'analytical', is_active: true },
];

export default function HorsesAdmin() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('stable');
    const [personas, setPersonas] = useState([]);
    const [settings, setSettings] = useState({
        posts_per_day: 20,
        min_delay_minutes: 30,
        max_delay_minutes: 120,
        ai_model: 'gpt-4o',
        temperature: 0.8,
        engine_enabled: true,
        auto_publish: true,
        peak_hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
    });
    const [pipelineRuns, setPipelineRuns] = useState([]);
    const [notification, setNotification] = useState(null);
    const [loginForm, setLoginForm] = useState({ email: '', password: '' });
    const [loginError, setLoginError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [filter, setFilter] = useState('all');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newPersona, setNewPersona] = useState({
        name: '',
        gender: 'male',
        location: '',
        specialty: 'cash_games',
        stakes: '',
        bio: '',
        voice: 'casual'
    });

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUser(session.user);
                loadData();
            }
        } catch (err) {
            console.log('Auth check failed');
        }
        setLoading(false);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: loginForm.email,
                password: loginForm.password
            });

            if (error) {
                setLoginError(error.message);
                return;
            }

            setUser(data.user);
            loadData();
        } catch (err) {
            setLoginError('Connection failed');
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUser(null);
    };

    const loadData = async () => {
        try {
            const { data: personaData } = await supabase
                .from('content_authors')
                .select('*')
                .order('name');

            const { data: settingsData } = await supabase
                .from('content_settings')
                .select('*')
                .single();

            const { data: runsData } = await supabase
                .from('pipeline_runs')
                .select('*')
                .order('started_at', { ascending: false })
                .limit(10);

            setPersonas(personaData?.length > 0 ? personaData : DEMO_PERSONAS);
            if (settingsData) setSettings(settingsData);
            setPipelineRuns(runsData || []);
        } catch (err) {
            console.log('Using demo data');
            setPersonas(DEMO_PERSONAS);
        }
    };

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const togglePersona = async (id, currentStatus) => {
        const newStatus = !currentStatus;
        setPersonas(personas.map(p => p.id === id ? { ...p, is_active: newStatus } : p));

        try {
            await supabase.from('content_authors').update({ is_active: newStatus }).eq('id', id);
            showNotification(`Persona ${newStatus ? 'activated' : 'deactivated'}`);
        } catch (err) {
            showNotification('Demo mode - changes not saved', 'info');
        }
    };

    const toggleAllPersonas = async (activate) => {
        setPersonas(personas.map(p => ({ ...p, is_active: activate })));
        showNotification(`All personas ${activate ? 'activated' : 'deactivated'}`);
    };

    const updateSetting = async (key, value) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        /* In a real app we would save this to DB */
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        const alias = newPersona.name.replace(/[^a-zA-Z0-9]/g, '') + Math.floor(Math.random() * 1000);

        const personaToCreate = {
            ...newPersona,
            alias,
            avatar_seed: alias.toLowerCase(),
            timezone: 'America/New_York',
            is_active: true
        };

        try {
            const { data, error } = await supabase
                .from('content_authors')
                .insert([personaToCreate])
                .select()
                .single();

            if (error) throw error;

            setPersonas([data, ...personas]);
            setShowCreateModal(false);
            setNewPersona({ name: '', gender: 'male', location: '', specialty: 'cash_games', stakes: '', bio: '', voice: 'casual' });
            showNotification('New horse stabled! 🐴', 'success');
        } catch (err) {
            console.error(err);
            // Demo fallback
            const demoP = { ...personaToCreate, id: Date.now() };
            setPersonas([demoP, ...personas]);
            setShowCreateModal(false);
            showNotification('Horse created (fallback)', 'success');
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Are you sure you want to retire ${name}?`)) return;

        setPersonas(personas.filter(p => p.id !== id));

        try {
            await supabase.from('content_authors').delete().eq('id', id);
            showNotification(`${name} retired`, 'info');
        } catch (err) {
            console.log('Delete error (likely demo mode)', err);
        }
    };

    const triggerPipeline = async (type) => {
        const newRun = {
            id: Date.now(),
            run_type: type,
            started_at: new Date().toISOString(),
            text_posts_created: type === 'test' ? 3 : type === 'daily' ? settings.posts_per_day : 10,
            videos_created: type === 'daily' ? 2 : 0,
            errors: 0,
            duration_seconds: Math.floor(Math.random() * 60) + 20
        };
        setPipelineRuns([newRun, ...pipelineRuns.slice(0, 9)]);
        showNotification(`Pipeline ${type} triggered!`);
    };

    const filteredPersonas = personas.filter(p => {
        const matchesSearch =
            p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.alias?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.location?.toLowerCase().includes(searchTerm.toLowerCase());

        if (filter === 'active') return matchesSearch && p.is_active;
        if (filter === 'inactive') return matchesSearch && !p.is_active;
        return matchesSearch;
    });

    const activeCount = personas.filter(p => p.is_active).length;

    if (loading) {
        return (
            <div className={styles.loading}>
                <span className={styles.logo}>🐴</span>
                <p>Loading stable...</p>
            </div>
        );
    }

    // LOGIN SCREEN
    if (!user) {
        return (
            <>
                <Head>
                    <title>HORSES | Content Stable</title>
                    <link rel="preconnect" href="https://fonts.googleapis.com" />
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
                </Head>
                <div className={styles.loginContainer}>
                    <div className={styles.loginCard}>
                        <div className={styles.loginHeader}>
                            <span className={styles.logo}>🐴</span>
                            <h1>HORSES</h1>
                            <p>Content Stable Admin</p>
                        </div>
                        <form onSubmit={handleLogin}>
                            <div className={styles.inputGroup}>
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={loginForm.email}
                                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                                    placeholder="admin@smarter.poker"
                                    required
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label>Password</label>
                                <input
                                    type="password"
                                    value={loginForm.password}
                                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                            {loginError && <div className={styles.error}>{loginError}</div>}
                            <button type="submit" className={styles.loginBtn}>Enter the Stable</button>
                        </form>
                    </div>
                </div>
            </>
        );
    }

    // MAIN DASHBOARD
    return (
        <>
            <Head>
                <title>HORSES | Content Stable</title>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
            </Head>

            <div className={styles.dashboard}>
                {/* Notification */}
                {notification && (
                    <div className={`${styles.notification} ${styles[notification.type]}`}>
                        {notification.message}
                    </div>
                )}

                {/* Header */}
                <header className={styles.header}>
                    <div className={styles.headerLeft}>
                        <span className={styles.logo}>🐴</span>
                        <h1>STABLE ADMIN v1.0</h1>
                        <span className={styles.subtitle}>Content Stable & Search</span>
                    </div>
                    <div className={styles.headerRight}>
                        <div className={styles.engineStatus}>
                            <span className={`${styles.statusDot} ${settings.engine_enabled ? styles.active : ''}`}></span>
                            <span>{settings.engine_enabled ? 'Engine Running' : 'Engine Stopped'}</span>
                        </div>
                        <span className={styles.userInfo}>{user?.email}</span>
                        <button onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
                    </div>
                </header>

                {/* Navigation */}
                <nav className={styles.nav}>
                    <button className={activeTab === 'stable' ? styles.active : ''} onClick={() => setActiveTab('stable')}>
                        🐎 The Stable
                    </button>
                    <button className={activeTab === 'pipeline' ? styles.active : ''} onClick={() => setActiveTab('pipeline')}>
                        🚀 Pipeline
                    </button>
                    <button className={activeTab === 'settings' ? styles.active : ''} onClick={() => setActiveTab('settings')}>
                        ⚙️ Settings
                    </button>
                    <button className={activeTab === 'stats' ? styles.active : ''} onClick={() => setActiveTab('stats')}>
                        📊 Statistics
                    </button>
                </nav>

                {/* Main Content */}
                <main className={styles.content}>

                    {/* STABLE TAB */}
                    {activeTab === 'stable' && (
                        <div className={styles.stableView}>
                            <div className={styles.stableHeader}>
                                <div className={styles.stableStats}>
                                    <div className={styles.statBox}>
                                        <span className={styles.statNumber}>{personas.length}</span>
                                        <span className={styles.statLabel}>Total Horses</span>
                                    </div>
                                    <div className={`${styles.statBox} ${styles.activeBox}`}>
                                        <span className={styles.statNumber}>{activeCount}</span>
                                        <span className={styles.statLabel}>Active</span>
                                    </div>
                                    <div className={`${styles.statBox} ${styles.inactiveBox}`}>
                                        <span className={styles.statNumber}>{personas.length - activeCount}</span>
                                        <span className={styles.statLabel}>Resting</span>
                                    </div>
                                </div>

                                <div className={styles.stableControls}>
                                    <input
                                        type="text"
                                        placeholder="Search horses..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className={styles.searchInput}
                                    />
                                    <select value={filter} onChange={(e) => setFilter(e.target.value)} className={styles.filterSelect}>
                                        <option value="all">All Horses</option>
                                        <option value="active">Active Only</option>
                                        <option value="inactive">Resting Only</option>
                                    </select>
                                    <button className={styles.btnSuccess} onClick={() => toggleAllPersonas(true)}>Activate All</button>
                                    <button className={styles.btnCreate} onClick={() => setShowCreateModal(true)}>➕ New Horse</button>
                                </div>
                            </div>

                            <div className={styles.personaGrid}>
                                {filteredPersonas.map(persona => (
                                    <div key={persona.id} className={`${styles.personaCard} ${persona.is_active ? styles.active : styles.inactive}`}>
                                        <div className={styles.personaHeader}>
                                            <div className={styles.personaAvatar}>
                                                {persona.gender === 'female' ? '👩' : '👨'}
                                            </div>
                                            <div className={styles.personaInfo}>
                                                <h3>{persona.name}</h3>
                                                <span className={styles.alias}>@{persona.alias}</span>
                                            </div>
                                            <label className={styles.toggleSwitch}>
                                                <input
                                                    type="checkbox"
                                                    checked={persona.is_active}
                                                    onChange={() => togglePersona(persona.id, persona.is_active)}
                                                />
                                                <span className={styles.slider}></span>
                                            </label>
                                        </div>
                                        <div className={styles.personaDetails}>
                                            <p>📍 {persona.location}</p>
                                            <p>🎯 {persona.specialty?.replace('_', ' ')}</p>
                                            <p>💰 {persona.stakes}</p>
                                        </div>
                                        <div className={styles.personaBio}>{persona.bio}</div>
                                        <div className={styles.personaVoice}>
                                            <span className={styles.voiceTag}>{persona.voice}</span>
                                            <button
                                                className={styles.deleteBtn}
                                                onClick={() => handleDelete(persona.id, persona.name)}
                                                title="Retire"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* PIPELINE TAB */}
                    {activeTab === 'pipeline' && (
                        <div className={styles.pipelineView}>
                            <h2>🚀 Content Pipeline</h2>

                            <div className={styles.pipelineActions}>
                                <h3>Quick Actions</h3>
                                <div className={styles.actionButtons}>
                                    <button onClick={() => triggerPipeline('test')} className={styles.actionBtn}>
                                        <span className={styles.icon}>🧪</span>
                                        <span className={styles.label}>Test Run</span>
                                        <span className={styles.desc}>3 posts, no video</span>
                                    </button>
                                    <button onClick={() => triggerPipeline('cycle')} className={styles.actionBtn}>
                                        <span className={styles.icon}>🔄</span>
                                        <span className={styles.label}>Quick Cycle</span>
                                        <span className={styles.desc}>10 posts + 2 videos</span>
                                    </button>
                                    <button onClick={() => triggerPipeline('daily')} className={`${styles.actionBtn} ${styles.featured}`}>
                                        <span className={styles.icon}>📅</span>
                                        <span className={styles.label}>Full Daily</span>
                                        <span className={styles.desc}>{settings.posts_per_day} posts</span>
                                    </button>
                                    <button onClick={() => triggerPipeline('publish')} className={styles.actionBtn}>
                                        <span className={styles.icon}>📤</span>
                                        <span className={styles.label}>Publish Due</span>
                                        <span className={styles.desc}>Post scheduled</span>
                                    </button>
                                </div>
                            </div>

                            <div className={styles.rssSources}>
                                <h3>📡 RSS Sources</h3>
                                <div className={styles.sourceList}>
                                    {['PokerNews', 'Card Player', 'PocketFives', 'Upswing Poker', '2+2 Forums'].map((name, i) => (
                                        <div key={i} className={styles.sourceItem}>
                                            <span>{name}</span>
                                            <span>🟢</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.recentRuns}>
                                <h3>📊 Recent Pipeline Runs</h3>
                                {pipelineRuns.length === 0 ? (
                                    <p className={styles.noData}>No pipeline runs yet</p>
                                ) : (
                                    <table className={styles.runsTable}>
                                        <thead>
                                            <tr>
                                                <th>Time</th>
                                                <th>Type</th>
                                                <th>Posts</th>
                                                <th>Videos</th>
                                                <th>Duration</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pipelineRuns.map(run => (
                                                <tr key={run.id}>
                                                    <td>{new Date(run.started_at).toLocaleString()}</td>
                                                    <td><span className={`${styles.runType} ${styles[run.run_type]}`}>{run.run_type}</span></td>
                                                    <td>{run.text_posts_created}</td>
                                                    <td>{run.videos_created}</td>
                                                    <td>{run.duration_seconds}s</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    )}

                    {/* SETTINGS TAB */}
                    {activeTab === 'settings' && (
                        <div className={styles.settingsView}>
                            <h2>⚙️ Engine Settings</h2>

                            <div className={styles.settingsGrid}>
                                <div className={styles.settingCard}>
                                    <h3>📅 Posting Schedule</h3>
                                    <div className={styles.settingItem}>
                                        <label>Posts Per Day</label>
                                        <input
                                            type="number"
                                            value={settings.posts_per_day}
                                            onChange={(e) => updateSetting('posts_per_day', parseInt(e.target.value))}
                                            min="1" max="100"
                                        />
                                    </div>
                                    <div className={styles.settingItem}>
                                        <label>Min Delay (minutes)</label>
                                        <input
                                            type="number"
                                            value={settings.min_delay_minutes}
                                            onChange={(e) => updateSetting('min_delay_minutes', parseInt(e.target.value))}
                                            min="5" max="180"
                                        />
                                    </div>
                                    <div className={styles.settingItem}>
                                        <label>Max Delay (minutes)</label>
                                        <input
                                            type="number"
                                            value={settings.max_delay_minutes}
                                            onChange={(e) => updateSetting('max_delay_minutes', parseInt(e.target.value))}
                                            min="15" max="300"
                                        />
                                    </div>
                                </div>

                                <div className={styles.settingCard}>
                                    <h3>🤖 AI Settings</h3>
                                    <div className={styles.settingItem}>
                                        <label>Model</label>
                                        <select value={settings.ai_model} onChange={(e) => updateSetting('ai_model', e.target.value)}>
                                            <option value="gpt-4o">GPT-4o (Best)</option>
                                            <option value="gpt-4o-mini">GPT-4o Mini</option>
                                            <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                        </select>
                                    </div>
                                    <div className={styles.settingItem}>
                                        <label>Temperature: {settings.temperature}</label>
                                        <input
                                            type="range"
                                            min="0" max="100"
                                            value={settings.temperature * 100}
                                            onChange={(e) => updateSetting('temperature', e.target.value / 100)}
                                        />
                                    </div>
                                </div>

                                <div className={`${styles.settingCard} ${styles.fullWidth}`}>
                                    <h3>🔌 System Controls</h3>
                                    <div className={styles.systemControls}>
                                        <div className={styles.controlItem}>
                                            <label>Content Engine</label>
                                            <label className={styles.toggleSwitch}>
                                                <input
                                                    type="checkbox"
                                                    checked={settings.engine_enabled}
                                                    onChange={(e) => updateSetting('engine_enabled', e.target.checked)}
                                                />
                                                <span className={styles.slider}></span>
                                            </label>
                                            <span>{settings.engine_enabled ? '🟢 Running' : '🔴 Stopped'}</span>
                                        </div>
                                        <div className={styles.controlItem}>
                                            <label>Auto-Publish</label>
                                            <label className={styles.toggleSwitch}>
                                                <input
                                                    type="checkbox"
                                                    checked={settings.auto_publish}
                                                    onChange={(e) => updateSetting('auto_publish', e.target.checked)}
                                                />
                                                <span className={styles.slider}></span>
                                            </label>
                                            <span>{settings.auto_publish ? '🟢 Active' : '🔴 Manual'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STATS TAB */}
                    {activeTab === 'stats' && (
                        <div className={styles.statsView}>
                            <h2>📊 Content Statistics</h2>

                            <div className={styles.statsOverview}>
                                <div className={styles.statCardLarge}>
                                    <span className={styles.statNumber}>{personas.length}</span>
                                    <span className={styles.statLabel}>Total Authors</span>
                                </div>
                                <div className={styles.statCardLarge}>
                                    <span className={styles.statNumber}>{activeCount}</span>
                                    <span className={styles.statLabel}>Active Authors</span>
                                </div>
                                <div className={styles.statCardLarge}>
                                    <span className={styles.statNumber}>{pipelineRuns.length}</span>
                                    <span className={styles.statLabel}>Pipeline Runs</span>
                                </div>
                                <div className={styles.statCardLarge}>
                                    <span className={styles.statNumber}>
                                        {pipelineRuns.reduce((sum, r) => sum + (r.text_posts_created || 0), 0)}
                                    </span>
                                    <span className={styles.statLabel}>Posts Created</span>
                                </div>
                            </div>

                            <div className={styles.contentBreakdown}>
                                <h3>Content Type Breakdown</h3>
                                <div className={styles.breakdownGrid}>
                                    {[
                                        { type: 'Strategy Tips', count: 45, color: '#8b5cf6' },
                                        { type: 'Hand Analysis', count: 32, color: '#22c55e' },
                                        { type: 'Mindset Posts', count: 28, color: '#f59e0b' },
                                        { type: 'Beginner Guides', count: 21, color: '#3b82f6' },
                                        { type: 'Videos', count: 12, color: '#ef4444' }
                                    ].map((item, i) => (
                                        <div key={i} className={styles.breakdownItem}>
                                            <div className={styles.breakdownBar} style={{ width: `${(item.count / 50) * 100}%`, backgroundColor: item.color }}></div>
                                            <span className={styles.breakdownLabel}>{item.type}</span>
                                            <span className={styles.breakdownCount}>{item.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </main>

                {showCreateModal && (
                    <div className={styles.modalOverlay}>
                        <div className={styles.modalContent}>
                            <div className={styles.modalHeader}>
                                <h2>🐴 New Horse</h2>
                                <button className={styles.closeBtn} onClick={() => setShowCreateModal(false)}>×</button>
                            </div>
                            <form onSubmit={handleCreate}>
                                <div className={styles.formGroup}>
                                    <label>Name</label>
                                    <input
                                        type="text"
                                        value={newPersona.name}
                                        onChange={e => setNewPersona({ ...newPersona, name: e.target.value })}
                                        placeholder="e.g. Johnny Sticks"
                                        required
                                    />
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label>Gender</label>
                                        <select
                                            value={newPersona.gender}
                                            onChange={e => setNewPersona({ ...newPersona, gender: e.target.value })}
                                        >
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label>Location</label>
                                        <input
                                            type="text"
                                            value={newPersona.location}
                                            onChange={e => setNewPersona({ ...newPersona, location: e.target.value })}
                                            placeholder="e.g. Austin, TX"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Bio</label>
                                    <textarea
                                        value={newPersona.bio}
                                        onChange={e => setNewPersona({ ...newPersona, bio: e.target.value })}
                                        placeholder="Brief backstory..."
                                        rows="3"
                                        required
                                    />
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}>
                                        <label>Specialty</label>
                                        <select
                                            value={newPersona.specialty}
                                            onChange={e => setNewPersona({ ...newPersona, specialty: e.target.value })}
                                        >
                                            <option value="cash_games">Cash Games</option>
                                            <option value="tournaments">Tournaments</option>
                                            <option value="plo">PLO</option>
                                            <option value="online">Online</option>
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label>Stakes</label>
                                        <input
                                            type="text"
                                            value={newPersona.stakes}
                                            onChange={e => setNewPersona({ ...newPersona, stakes: e.target.value })}
                                            placeholder="e.g. 2/5 NLH"
                                            required
                                        />
                                    </div>
                                </div>
                                <div className={styles.formActions}>
                                    <button type="button" className={styles.btnCancel} onClick={() => setShowCreateModal(false)}>Cancel</button>
                                    <button type="submit" className={styles.btnSubmit}>Stabling Horse</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
