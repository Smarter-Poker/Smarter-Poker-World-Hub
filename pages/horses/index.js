/**
 * 🐴 HORSES ADMIN PAGE
 * Integrated into hub-vanguard Next.js app at /horses
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import SEOHead from '../../src/components/seo/SEOHead';
import { supabase } from '../../src/lib/supabase';
import styles from './horses.module.css';

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

    // Promo Code State
    const [promoCodes, setPromoCodes] = useState([]);
    const [promoLoading, setPromoLoading] = useState(false);
    const [promoForm, setPromoForm] = useState({
        code: '',
        description: '',
        type: 'signup_bonus',
        value: 100,
        maxUses: '',
        expiresAt: '',
    });

    // Economy State
    const [economyData, setEconomyData] = useState(null);
    const [economyLoading, setEconomyLoading] = useState(false);
    const [promoCreating, setPromoCreating] = useState(false);
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

        // Load promo codes
        await loadPromoCodes();

        // Load economy data
        await loadEconomyData();
    };

    const loadPromoCodes = async () => {
        setPromoLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) return;

            const res = await fetch('/api/promo/admin-promo-codes', {
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setPromoCodes(data.codes || []);
            }
        } catch (err) {
            console.error('Failed to load promo codes:', err);
        } finally {
            setPromoLoading(false);
        }
    };

    const loadEconomyData = async () => {
        setEconomyLoading(true);
        try {
            const res = await fetch('/api/admin/economy-stats');
            if (res.ok) {
                const data = await res.json();
                if (data.success) setEconomyData(data);
            }
        } catch (err) {
            console.error('Failed to load economy data:', err);
        } finally {
            setEconomyLoading(false);
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
                <p>Loading Stable...</p>
            </div>
        );
    }

    // LOGIN SCREEN
    if (!user) {
        return (
            <>
                <SEOHead
                    title="Poker Horses — Fantasy Poker Game"
                    description="Play Fantasy Poker By Picking Your Horses. Follow Live Tournament Action And Compete On Leaderboards."
                    canonical="/horses"
                >
                    <link rel="preconnect" href="https://fonts.googleapis.com" />
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
                </SEOHead>
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
                            <button type="submit" className={styles.loginBtn}>Enter The Stable</button>
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
                        <h1>STABLE ADMIN V1.0</h1>
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
                        💬 Social Horses
                    </button>
                    <button className={activeTab === 'grinder' ? styles.active : ''} onClick={() => setActiveTab('grinder')}>
                        🎰 Grinder Horses
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
                    <button className={activeTab === 'promo' ? styles.active : ''} onClick={() => setActiveTab('promo')}>
                        🎟️ Promo Codes
                    </button>
                    <button className={activeTab === 'economy' ? styles.active : ''} onClick={() => { setActiveTab('economy'); if (!economyData) loadEconomyData(); }}>
                        💎 Economy
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
                                        placeholder="Search Horses..."
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
                                                {persona.avatar_url ? (
                                                    <img
                                                        src={persona.avatar_url}
                                                        alt={persona.name}
                                                        className={styles.avatarImage}
                                                        onError={(e) => {
                                                            e.target.style.display = 'none';
                                                            e.target.nextSibling.style.display = 'flex';
                                                        }}
                                                    />
                                                ) : null}
                                                <span
                                                    className={styles.avatarFallback}
                                                    style={{ display: persona.avatar_url ? 'none' : 'flex' }}
                                                >
                                                    {persona.gender === 'female' ? '👩' : '👨'}
                                                </span>
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

                    {/* GRINDER HORSES TAB */}
                    {activeTab === 'grinder' && (
                        <div className={styles.grinderView}>
                            <div className={styles.grinderHeader}>
                                <h2>🎰 Grinder Horses - Poker AI</h2>
                                <p className={styles.grinderSubtitle}>Same Horses, Second Job: Playing Poker 16hrs/day Across 4 Tables Max</p>
                            </div>

                            <div className={styles.grinderStats}>
                                <div className={styles.statBox}>
                                    <span className={styles.statNumber}>{personas.length}</span>
                                    <span className={styles.statLabel}>Total Grinders</span>
                                </div>
                                <div className={`${styles.statBox} ${styles.activeBox}`}>
                                    <span className={styles.statNumber}>0</span>
                                    <span className={styles.statLabel}>Currently Playing</span>
                                </div>
                                <div className={styles.statBox}>
                                    <span className={styles.statNumber}>0</span>
                                    <span className={styles.statLabel}>Active Tables</span>
                                </div>
                                <div className={styles.statBox}>
                                    <span className={styles.statNumber}>16h</span>
                                    <span className={styles.statLabel}>Daily Playtime</span>
                                </div>
                            </div>

                            <div className={styles.grinderControls}>
                                <h3>🏠 Club Management</h3>
                                <div className={styles.clubActions}>
                                    <button className={styles.btnSuccess}>
                                        🐴 Add All Horses to Shark Club (10,000 chips each)
                                    </button>
                                    <button className={styles.actionBtn}>
                                        🎮 Start Auto-Join
                                    </button>
                                    <button className={styles.actionBtn}>
                                        ⏹️ Stop All Horses
                                    </button>
                                </div>
                            </div>

                            <div className={styles.grinderSettings}>
                                <h3>⚙️ Grinder Settings</h3>
                                <div className={styles.settingsRow}>
                                    <div className={styles.settingItem}>
                                        <label>Max Tables Per Horse</label>
                                        <select defaultValue="4">
                                            <option value="1">1 Table</option>
                                            <option value="2">2 Tables</option>
                                            <option value="3">3 Tables</option>
                                            <option value="4">4 Tables (Max)</option>
                                        </select>
                                    </div>
                                    <div className={styles.settingItem}>
                                        <label>Daily Play Hours</label>
                                        <select defaultValue="16">
                                            <option value="8">8 Hours</option>
                                            <option value="12">12 Hours</option>
                                            <option value="16">16 Hours</option>
                                            <option value="24">24 Hours</option>
                                        </select>
                                    </div>
                                    <div className={styles.settingItem}>
                                        <label>Starting Chips</label>
                                        <input type="number" defaultValue="10000" min="1000" max="100000" />
                                    </div>
                                    <div className={styles.settingItem}>
                                        <label>AI Model</label>
                                        <select defaultValue="gpt-4o">
                                            <option value="gpt-4o">GPT-4o (Best)</option>
                                            <option value="gpt-4o-mini">GPT-4o Mini (Faster)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.grinderTable}>
                                <h3>🐴 Horse Roster - Poker Mode</h3>
                                <table className={styles.runsTable}>
                                    <thead>
                                        <tr>
                                            <th>Horse</th>
                                            <th>Specialty</th>
                                            <th>Play Style</th>
                                            <th>Tables</th>
                                            <th>Hands</th>
                                            <th>Profit</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredPersonas.slice(0, 20).map(persona => (
                                            <tr key={persona.id}>
                                                <td>
                                                    <div className={styles.horseCell}>
                                                        {persona.avatar_url ? (
                                                            <img
                                                                src={persona.avatar_url}
                                                                alt={persona.name}
                                                                className={styles.tableCellAvatar}
                                                            />
                                                        ) : (
                                                            <span>{persona.gender === 'female' ? '👩' : '👨'}</span>
                                                        )}
                                                        <div>
                                                            <strong>{persona.name}</strong>
                                                            <small>@{persona.alias}</small>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>{persona.specialty?.replace('_', ' ')}</td>
                                                <td><span className={styles.voiceTag}>{persona.voice}</span></td>
                                                <td>0/4</td>
                                                <td>0</td>
                                                <td className={styles.profitCell}>$0</td>
                                                <td>
                                                    <span className={styles.statusIdle}>Idle</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {filteredPersonas.length > 20 && (
                                    <p className={styles.moreHorses}>
                                        + {filteredPersonas.length - 20} more horses in the stable
                                    </p>
                                )}
                            </div>

                            <div className={styles.schedulePreview}>
                                <h3>🕐 Daily Schedule (Rotating Shifts)</h3>
                                <div className={styles.scheduleGrid}>
                                    <div className={styles.shift}>
                                        <h4>🌅 Morning Shift</h4>
                                        <p>8 AM - 4 PM</p>
                                        <span>40 Horses</span>
                                    </div>
                                    <div className={styles.shift}>
                                        <h4>☀️ Day Shift</h4>
                                        <p>12 PM - 8 PM</p>
                                        <span>35 Horses</span>
                                    </div>
                                    <div className={styles.shift}>
                                        <h4>🌙 Night Shift</h4>
                                        <p>4 PM - 12 AM</p>
                                        <span>25 Horses</span>
                                    </div>
                                </div>
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
                                        <span className={styles.desc}>3 Posts, No Video</span>
                                    </button>
                                    <button onClick={() => triggerPipeline('cycle')} className={styles.actionBtn}>
                                        <span className={styles.icon}>🔄</span>
                                        <span className={styles.label}>Quick Cycle</span>
                                        <span className={styles.desc}>10 Posts + 2 Videos</span>
                                    </button>
                                    <button onClick={() => triggerPipeline('daily')} className={`${styles.actionBtn} ${styles.featured}`}>
                                        <span className={styles.icon}>📅</span>
                                        <span className={styles.label}>Full Daily</span>
                                        <span className={styles.desc}>{settings.posts_per_day} posts</span>
                                    </button>
                                    <button onClick={() => triggerPipeline('publish')} className={styles.actionBtn}>
                                        <span className={styles.icon}>📤</span>
                                        <span className={styles.label}>Publish Due</span>
                                        <span className={styles.desc}>Post Scheduled</span>
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
                                    <p className={styles.noData}>No Pipeline Runs Yet</p>
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

                    {/* PROMO CODES TAB */}
                    {activeTab === 'promo' && (
                        <div className={styles.statsView}>
                            <h2>🎟️ Promo Code Manager</h2>

                            {/* Stats Bar */}
                            <div className={styles.statsOverview}>
                                <div className={styles.statCardLarge}>
                                    <span className={styles.statNumber}>{promoCodes.length}</span>
                                    <span className={styles.statLabel}>Total Codes</span>
                                </div>
                                <div className={styles.statCardLarge}>
                                    <span className={styles.statNumber}>{promoCodes.filter(c => c.is_active).length}</span>
                                    <span className={styles.statLabel}>Active</span>
                                </div>
                                <div className={styles.statCardLarge}>
                                    <span className={styles.statNumber}>{promoCodes.reduce((sum, c) => sum + c.current_uses, 0)}</span>
                                    <span className={styles.statLabel}>Total Redemptions</span>
                                </div>
                            </div>

                            {/* Create Promo Code Form */}
                            <div className={styles.contentBreakdown} style={{ marginBottom: '24px' }}>
                                <h3>Create New Promo Code</h3>
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    setPromoCreating(true);
                                    try {
                                        const { data: { session } } = await supabase.auth.getSession();
                                        const res = await fetch('/api/promo/admin-promo-codes', {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${session.access_token}`,
                                            },
                                            body: JSON.stringify(promoForm),
                                        });
                                        const data = await res.json();
                                        if (res.ok) {
                                            showNotification(`Promo code ${data.code.code} created! 🎟️`);
                                            setPromoForm({ code: '', description: '', type: 'signup_bonus', value: 100, maxUses: '', expiresAt: '' });
                                            await loadPromoCodes();
                                        } else {
                                            showNotification(data.error || 'Failed to create code', 'error');
                                        }
                                    } catch (err) {
                                        showNotification('Error creating code', 'error');
                                    } finally {
                                        setPromoCreating(false);
                                    }
                                }}>
                                    <div className={styles.formRow} style={{ marginBottom: '12px' }}>
                                        <div className={styles.formGroup}>
                                            <label>Code (leave Blank To Auto-generate)</label>
                                            <input
                                                type="text"
                                                value={promoForm.code}
                                                onChange={e => setPromoForm({ ...promoForm, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                                                placeholder="Auto-generated"
                                                maxLength={20}
                                                style={{ textTransform: 'uppercase', letterSpacing: '2px' }}
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>Description</label>
                                            <input
                                                type="text"
                                                value={promoForm.description}
                                                onChange={e => setPromoForm({ ...promoForm, description: e.target.value })}
                                                placeholder="e.g. Welcome Bonus For New Users"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.formRow} style={{ marginBottom: '12px' }}>
                                        <div className={styles.formGroup}>
                                            <label>Type</label>
                                            <select
                                                value={promoForm.type}
                                                onChange={e => setPromoForm({ ...promoForm, type: e.target.value })}
                                            >
                                                <option value="signup_bonus">Signup Bonus (Diamonds)</option>
                                                <option value="diamonds">Diamond Bonus</option>
                                                <option value="vip_trial">VIP Trial (Days)</option>
                                            </select>
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>Value ({promoForm.type === 'vip_trial' ? 'Days' : 'Diamonds'})</label>
                                            <input
                                                type="number"
                                                value={promoForm.value}
                                                onChange={e => setPromoForm({ ...promoForm, value: parseInt(e.target.value) || 0 })}
                                                min="1"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.formRow} style={{ marginBottom: '16px' }}>
                                        <div className={styles.formGroup}>
                                            <label>Max Uses (blank = Unlimited)</label>
                                            <input
                                                type="number"
                                                value={promoForm.maxUses}
                                                onChange={e => setPromoForm({ ...promoForm, maxUses: e.target.value })}
                                                placeholder="Unlimited"
                                                min="1"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label>Expires At (optional)</label>
                                            <input
                                                type="datetime-local"
                                                value={promoForm.expiresAt}
                                                onChange={e => setPromoForm({ ...promoForm, expiresAt: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <button type="submit" className={styles.btnSubmit} disabled={promoCreating} style={{ width: '100%' }}>
                                        {promoCreating ? 'Creating...' : '🎟️ Create Promo Code'}
                                    </button>
                                </form>
                            </div>

                            {/* Active Codes Table */}
                            <div className={styles.contentBreakdown}>
                                <h3>All Promo Codes ({promoCodes.length})</h3>
                                {promoLoading ? (
                                    <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>Loading Codes...</p>
                                ) : promoCodes.length === 0 ? (
                                    <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>No Promo Codes Yet. Create One Above!</p>
                                ) : (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#aaa', fontWeight: 600 }}>Code</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#aaa', fontWeight: 600 }}>Type</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#aaa', fontWeight: 600 }}>Value</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#aaa', fontWeight: 600 }}>Uses</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#aaa', fontWeight: 600 }}>Status</th>
                                                    <th style={{ padding: '10px 12px', textAlign: 'left', color: '#aaa', fontWeight: 600 }}>Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {promoCodes.map(code => (
                                                    <tr key={code.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            <span style={{
                                                                fontFamily: 'monospace',
                                                                fontWeight: 700,
                                                                letterSpacing: '1px',
                                                                color: code.is_active ? '#00E0FF' : '#666',
                                                                fontSize: '15px',
                                                            }}>{code.code}</span>
                                                            {code.description && (
                                                                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>{code.description}</div>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            <span style={{
                                                                padding: '3px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '11px',
                                                                fontWeight: 600,
                                                                background: code.type === 'vip_trial' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                                                                color: code.type === 'vip_trial' ? '#a78bfa' : '#60a5fa',
                                                            }}>
                                                                {code.type === 'signup_bonus' ? '💎 Signup' : code.type === 'diamonds' ? '💎 Diamonds' : '👑 VIP Trial'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                                                            {code.value} {code.type === 'vip_trial' ? 'days' : '💎'}
                                                        </td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            {code.current_uses}{code.max_uses ? `/${code.max_uses}` : '/∞'}
                                                        </td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            <span style={{
                                                                padding: '3px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '11px',
                                                                fontWeight: 600,
                                                                background: code.is_active ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                                color: code.is_active ? '#22c55e' : '#ef4444',
                                                            }}>
                                                                {code.is_active ? '● Active' : '● Inactive'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '10px 12px' }}>
                                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                                <button
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(code.code);
                                                                        showNotification(`Copied: ${code.code}`);
                                                                    }}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        background: 'rgba(255,255,255,0.1)',
                                                                        border: 'none',
                                                                        borderRadius: '4px',
                                                                        color: '#fff',
                                                                        cursor: 'pointer',
                                                                        fontSize: '12px',
                                                                    }}
                                                                    title="Copy Code"
                                                                >📋</button>
                                                                <button
                                                                    onClick={async () => {
                                                                        const { data: { session } } = await supabase.auth.getSession();
                                                                        await fetch('/api/promo/admin-promo-codes', {
                                                                            method: 'PATCH',
                                                                            headers: {
                                                                                'Content-Type': 'application/json',
                                                                                'Authorization': `Bearer ${session.access_token}`,
                                                                            },
                                                                            body: JSON.stringify({ id: code.id, is_active: !code.is_active }),
                                                                        });
                                                                        showNotification(`Code ${code.is_active ? 'deactivated' : 'activated'}`);
                                                                        await loadPromoCodes();
                                                                    }}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        background: code.is_active ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                                                        border: 'none',
                                                                        borderRadius: '4px',
                                                                        color: code.is_active ? '#ef4444' : '#22c55e',
                                                                        cursor: 'pointer',
                                                                        fontSize: '12px',
                                                                    }}
                                                                    title={code.is_active ? 'Deactivate' : 'Activate'}
                                                                >{code.is_active ? '⏸️' : '▶️'}</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ECONOMY TAB */}
                    {activeTab === 'economy' && (
                        <div className={styles.statsView}>
                            <h2>💎 Diamond Economy Dashboard</h2>

                            {economyLoading ? (
                                <div className={styles.loadingSpinner}>Loading Economy Data...</div>
                            ) : !economyData ? (
                                <div className={styles.loadingSpinner}>No Data Available</div>
                            ) : (
                                <>
                                    {/* Stat Cards */}
                                    <div className={styles.statsOverview}>
                                        <div className={styles.statCardLarge}>
                                            <span className={styles.statNumber}>{economyData.stats.totalUsers.toLocaleString()}</span>
                                            <span className={styles.statLabel}>Total Users</span>
                                        </div>
                                        <div className={`${styles.statCardLarge} ${styles.activeBox}`}>
                                            <span className={styles.statNumber}>+{economyData.stats.newUsers7d.toLocaleString()}</span>
                                            <span className={styles.statLabel}>New Users (7d)</span>
                                        </div>
                                        <div className={styles.statCardLarge}>
                                            <span className={styles.statNumber} style={{ color: '#22c55e' }}>+{economyData.stats.totalDiamondsEarned.toLocaleString()}</span>
                                            <span className={styles.statLabel}>💎 Total Earned</span>
                                        </div>
                                        <div className={styles.statCardLarge}>
                                            <span className={styles.statNumber} style={{ color: '#ef4444' }}>-{economyData.stats.totalDiamondsSpent.toLocaleString()}</span>
                                            <span className={styles.statLabel}>💎 Total Spent</span>
                                        </div>
                                    </div>

                                    <div className={styles.statsOverview}>
                                        <div className={styles.statCardLarge}>
                                            <span className={styles.statNumber}>{economyData.stats.totalRewardClaims.toLocaleString()}</span>
                                            <span className={styles.statLabel}>Reward Claims</span>
                                        </div>
                                        <div className={styles.statCardLarge}>
                                            <span className={styles.statNumber} style={{ color: '#8b5cf6' }}>{economyData.stats.diamondPurchaseCount}</span>
                                            <span className={styles.statLabel}>💎 Purchases</span>
                                        </div>
                                        <div className={styles.statCardLarge}>
                                            <span className={styles.statNumber} style={{ color: '#f59e0b' }}>${(economyData.stats.diamondPurchaseRevenue / 100).toFixed(2)}</span>
                                            <span className={styles.statLabel}>Purchase Revenue</span>
                                        </div>
                                        <div className={styles.statCardLarge}>
                                            <span className={styles.statNumber} style={{ color: '#00d4ff' }}>{economyData.stats.activeVipCount}/{economyData.stats.vipSubscriptionCount}</span>
                                            <span className={styles.statLabel}>VIP Active/Total</span>
                                        </div>
                                    </div>

                                    {/* Recent Users */}
                                    {economyData.recentUsers?.length > 0 && (
                                        <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                                            <h3>👤 Recent Signups</h3>
                                            <table className={styles.runsTable}>
                                                <thead>
                                                    <tr>
                                                        <th>Username</th>
                                                        <th>Name</th>
                                                        <th>Joined</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {economyData.recentUsers.map(u => (
                                                        <tr key={u.id}>
                                                            <td>{u.username || '—'}</td>
                                                            <td>{u.full_name || '—'}</td>
                                                            <td>{new Date(u.created_at).toLocaleDateString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Diamond Transaction Log */}
                                    <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                                        <h3>💎 Diamond Transaction Log (Last 100)</h3>
                                        <div style={{ maxHeight: '500px', overflowY: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <table className={styles.runsTable}>
                                                <thead style={{ position: 'sticky', top: 0, background: '#1a1a2e', zIndex: 1 }}>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>User</th>
                                                        <th>Type</th>
                                                        <th>Amount</th>
                                                        <th>Source</th>
                                                        <th>Description</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {economyData.transactions.map((tx, i) => (
                                                        <tr key={tx.id || i}>
                                                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{new Date(tx.created_at).toLocaleString()}</td>
                                                            <td style={{ fontSize: '0.8rem', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.user_id?.slice(0, 8)}...</td>
                                                            <td>
                                                                <span style={{
                                                                    padding: '2px 8px',
                                                                    borderRadius: 4,
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 600,
                                                                    background: tx.type === 'earned' || tx.type === 'reward'
                                                                        ? 'rgba(34, 197, 94, 0.2)'
                                                                        : tx.type === 'spent' || tx.type === 'purchase'
                                                                            ? 'rgba(239, 68, 68, 0.2)'
                                                                            : 'rgba(139, 92, 246, 0.2)',
                                                                    color: tx.type === 'earned' || tx.type === 'reward'
                                                                        ? '#22c55e'
                                                                        : tx.type === 'spent' || tx.type === 'purchase'
                                                                            ? '#ef4444'
                                                                            : '#a78bfa'
                                                                }}>{tx.type}</span>
                                                            </td>
                                                            <td style={{
                                                                fontWeight: 700,
                                                                color: (tx.amount > 0) ? '#22c55e' : '#ef4444'
                                                            }}>
                                                                {tx.amount > 0 ? '+' : ''}{tx.amount}💎
                                                            </td>
                                                            <td style={{ fontSize: '0.85rem' }}>{tx.source || '—'}</td>
                                                            <td style={{ fontSize: '0.8rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.description || '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Diamond Purchases */}
                                    {economyData.recentPurchases?.length > 0 && (
                                        <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                                            <h3>🛒 Recent Diamond Purchases</h3>
                                            <table className={styles.runsTable}>
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>User</th>
                                                        <th>Paid</th>
                                                        <th>Diamonds</th>
                                                        <th>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {economyData.recentPurchases.map((p, i) => (
                                                        <tr key={p.id || i}>
                                                            <td>{new Date(p.created_at).toLocaleDateString()}</td>
                                                            <td style={{ fontSize: '0.8rem' }}>{p.user_id?.slice(0, 8)}...</td>
                                                            <td style={{ color: '#22c55e', fontWeight: 600 }}>${((p.amount_paid || 0) / 100).toFixed(2)}</td>
                                                            <td>{p.diamonds_received?.toLocaleString() || '—'}💎</td>
                                                            <td>{p.status || 'completed'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* VIP Subscriptions */}
                                    {economyData.vipSubscriptions?.length > 0 && (
                                        <div className={styles.contentBreakdown} style={{ marginTop: '1.5rem' }}>
                                            <h3>🏆 VIP Subscriptions</h3>
                                            <table className={styles.runsTable}>
                                                <thead>
                                                    <tr>
                                                        <th>Date</th>
                                                        <th>User</th>
                                                        <th>Plan</th>
                                                        <th>Status</th>
                                                        <th>Expires</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {economyData.vipSubscriptions.map((s, i) => (
                                                        <tr key={s.id || i}>
                                                            <td>{new Date(s.created_at).toLocaleDateString()}</td>
                                                            <td style={{ fontSize: '0.8rem' }}>{s.user_id?.slice(0, 8)}...</td>
                                                            <td><span className={styles.voiceTag}>{s.plan || 'VIP'}</span></td>
                                                            <td style={{ color: s.status === 'active' ? '#22c55e' : '#ef4444' }}>{s.status}</td>
                                                            <td>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {/* Refresh Button */}
                                    <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                                        <button
                                            onClick={loadEconomyData}
                                            className={styles.actionBtn}
                                            disabled={economyLoading}
                                        >
                                            🔄 Refresh Economy Data
                                        </button>
                                    </div>
                                </>
                            )}
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
                                        placeholder="Brief Backstory..."
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
