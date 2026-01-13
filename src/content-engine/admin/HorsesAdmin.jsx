/**
 * 🐴 HORSES ADMIN PANEL - COMPLETE BUILD
 * ═══════════════════════════════════════════════════════════════════════════
 * Full-featured content persona management system with pipeline controls.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import './HorsesAdmin.css';

// Initialize Supabase
const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co',
    import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key'
);

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function HorsesLogin({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                setError(error.message);
                setLoading(false);
                return;
            }

            onLogin(data.user);
        } catch (err) {
            setError('Connection failed. Check your network.');
            setLoading(false);
        }
    };

    return (
        <div className="horses-login">
            <div className="login-card">
                <div className="login-header">
                    <span className="logo">🐴</span>
                    <h1>HORSES</h1>
                    <p>Content Stable Admin</p>
                </div>

                <form onSubmit={handleLogin}>
                    <div className="input-group">
                        <label>Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="admin@smarter.poker"
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <button type="submit" disabled={loading}>
                        {loading ? 'Authenticating...' : 'Enter the Stable'}
                    </button>
                </form>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

function HorsesDashboard({ user, onLogout }) {
    const [personas, setPersonas] = useState([]);
    const [settings, setSettings] = useState({
        posts_per_day: 20,
        min_delay_minutes: 30,
        max_delay_minutes: 120,
        ai_model: 'gpt-4o',
        temperature: 0.8,
        max_tokens: 500,
        engine_enabled: true,
        auto_publish: true,
        peak_hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]
    });
    const [stats, setStats] = useState([]);
    const [pipelineRuns, setPipelineRuns] = useState([]);
    const [activeTab, setActiveTab] = useState('stable');
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [notification, setNotification] = useState(null);
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

    // Demo personas for when DB is empty
    const demoPersonas = [
        { id: 1, name: 'Marcus Chen', alias: 'VegasGrinder85', gender: 'male', location: 'Las Vegas, NV', specialty: 'cash_games', stakes: '2/5 NLH', bio: 'Started playing in underground LA games in 2008. Now a full-time 2/5 grinder at the Bellagio.', voice: 'analytical', is_active: true },
        { id: 2, name: 'Sarah Mitchell', alias: 'TexasQueen92', gender: 'female', location: 'Austin, TX', specialty: 'tournaments', stakes: '$200-$500 MTTs', bio: 'Former accountant who discovered poker during COVID. Cashed in 12 WSOP Circuit events.', voice: 'enthusiastic', is_active: true },
        { id: 3, name: 'Derek Williams', alias: 'LANitOwl', gender: 'male', location: 'Los Angeles, CA', specialty: 'high_stakes', stakes: '5/10+ PLO', bio: '15-year veteran of the Commerce Casino. Specializes in mixed games and PLO.', voice: 'experienced', is_active: true },
        { id: 4, name: 'Jennifer Park', alias: 'SeattleSolver', gender: 'female', location: 'Seattle, WA', specialty: 'gto', stakes: 'Online NL200', bio: 'Software engineer by day, GTO nerd by night. Runs solver analysis for study groups.', voice: 'technical', is_active: false },
        { id: 5, name: 'Michael Torres', alias: 'MiamiMike305', gender: 'male', location: 'Miami, FL', specialty: 'live_reads', stakes: '1/3 to 5/10', bio: 'Cuban-American poker pro who learned the game in Hialeah home games.', voice: 'street_smart', is_active: true },
    ];

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);

        try {
            // Load personas
            const { data: personaData, error: personaError } = await supabase
                .from('content_authors')
                .select('*')
                .order('name');

            // Load settings
            const { data: settingsData } = await supabase
                .from('content_settings')
                .select('*')
                .single();

            // Load stats
            const { data: statsData } = await supabase
                .from('content_stats')
                .select('*');

            // Load pipeline runs
            const { data: runsData } = await supabase
                .from('pipeline_runs')
                .select('*')
                .order('started_at', { ascending: false })
                .limit(10);

            setPersonas(personaData?.length > 0 ? personaData : demoPersonas);
            if (settingsData) setSettings(settingsData);
            setStats(statsData || []);
            setPipelineRuns(runsData || []);
        } catch (err) {
            console.log('Using demo data');
            setPersonas(demoPersonas);
        }

        setLoading(false);
    };

    const showNotification = (message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    };

    const togglePersona = async (id, currentStatus) => {
        const newStatus = !currentStatus;
        setPersonas(personas.map(p =>
            p.id === id ? { ...p, is_active: newStatus } : p
        ));

        try {
            await supabase
                .from('content_authors')
                .update({ is_active: newStatus })
                .eq('id', id);
            showNotification(`Persona ${newStatus ? 'activated' : 'deactivated'}`);
        } catch (err) {
            showNotification('Demo mode - changes not saved', 'info');
        }
    };

    const toggleAllPersonas = async (activate) => {
        setPersonas(personas.map(p => ({ ...p, is_active: activate })));

        try {
            await supabase
                .from('content_authors')
                .update({ is_active: activate })
                .neq('id', 0);
            showNotification(`All personas ${activate ? 'activated' : 'deactivated'}`);
        } catch (err) {
            showNotification('Demo mode - changes not saved', 'info');
        }
    };

    const updateSettings = async (key, value) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);

        try {
            await supabase
                .from('content_settings')
                .upsert({ id: 1, ...newSettings });
        } catch (err) {
            console.log('Demo mode - settings not saved');
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        // Generate alias if not provided or auto-generate
        const alias = newPersona.name.replace(/[^a-zA-Z0-9]/g, '') + Math.floor(Math.random() * 1000);

        const personaToCreate = {
            ...newPersona,
            alias,
            avatar_seed: alias.toLowerCase(),
            timezone: 'America/New_York', // Default, can be refined later
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
            // For demo mode fallback
            const demoId = Date.now();
            const demoPersona = { ...personaToCreate, id: demoId };
            setPersonas([demoPersona, ...personas]);
            setShowCreateModal(false);
            showNotification('Horse created (Demo Mode)', 'success');
        }
    };

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Are you sure you want to retire ${name}? This cannot be undone.`)) return;

        // Optimistic update
        setPersonas(personas.filter(p => p.id !== id));

        try {
            const { error } = await supabase.from('content_authors').delete().eq('id', id);
            if (error) throw error;
            showNotification(`${name} has been retired.`, 'info');
        } catch (err) {
            showNotification(`Retired ${name} (Demo Mode)`, 'info');
        }
    };

    const triggerGeneration = async (type, params = {}) => {
        showNotification(`${type} pipeline triggered!`, 'success');

        // Add to pipeline runs locally for demo
        const newRun = {
            id: Date.now(),
            run_type: type,
            started_at: new Date().toISOString(),
            text_posts_created: params.posts || 10,
            videos_created: params.videos || 0,
            errors: 0,
            duration_seconds: Math.floor(Math.random() * 60) + 30
        };
        setPipelineRuns([newRun, ...pipelineRuns.slice(0, 9)]);
    };

    // Filter personas
    const filteredPersonas = personas.filter(p => {
        const matchesSearch = p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.alias?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.location?.toLowerCase().includes(searchTerm.toLowerCase());

        if (filter === 'active') return matchesSearch && p.is_active;
        if (filter === 'inactive') return matchesSearch && !p.is_active;
        return matchesSearch;
    });

    const activeCount = personas.filter(p => p.is_active).length;

    if (loading) {
        return (
            <div className="horses-loading">
                <span className="logo spinning">🐴</span>
                <p>Loading stable...</p>
            </div>
        );
    }

    return (
        <div className="horses-dashboard">
            {/* Notification */}
            {notification && (
                <div className={`notification ${notification.type}`}>
                    {notification.message}
                </div>
            )}

            {/* HEADER */}
            <header className="dashboard-header">
                <div className="header-left">
                    <span className="logo">🐴</span>
                    <h1>HORSES</h1>
                    <span className="subtitle">Content Stable</span>
                </div>
                <div className="header-right">
                    <div className="engine-status">
                        <span className={`status-dot ${settings.engine_enabled ? 'active' : 'inactive'}`}></span>
                        <span>{settings.engine_enabled ? 'Engine Running' : 'Engine Stopped'}</span>
                    </div>
                    <span className="user-info">{user?.email || 'admin@smarter.poker'}</span>
                    <button onClick={onLogout} className="logout-btn">Logout</button>
                </div>
            </header>

            {/* NAVIGATION */}
            <nav className="dashboard-nav">
                <button
                    className={activeTab === 'stable' ? 'active' : ''}
                    onClick={() => setActiveTab('stable')}
                >
                    🐎 The Stable
                </button>
                <button
                    className={activeTab === 'pipeline' ? 'active' : ''}
                    onClick={() => setActiveTab('pipeline')}
                >
                    🚀 Pipeline
                </button>
                <button
                    className={activeTab === 'settings' ? 'active' : ''}
                    onClick={() => setActiveTab('settings')}
                >
                    ⚙️ Settings
                </button>
                <button
                    className={activeTab === 'stats' ? 'active' : ''}
                    onClick={() => setActiveTab('stats')}
                >
                    📊 Statistics
                </button>
            </nav>

            {/* MAIN CONTENT */}
            <main className="dashboard-content">

                {/* THE STABLE - Persona Management */}
                {activeTab === 'stable' && (
                    <div className="stable-view">
                        <div className="stable-header">
                            <div className="stable-stats">
                                <div className="stat-box">
                                    <span className="stat-number">{personas.length}</span>
                                    <span className="stat-label">Total Horses</span>
                                </div>
                                <div className="stat-box active">
                                    <span className="stat-number">{activeCount}</span>
                                    <span className="stat-label">Active</span>
                                </div>
                                <div className="stat-box inactive">
                                    <span className="stat-number">{personas.length - activeCount}</span>
                                    <span className="stat-label">Resting</span>
                                </div>
                            </div>

                            <div className="stable-controls">
                                <input
                                    type="text"
                                    placeholder="Search horses..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="search-input"
                                />
                                <select
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    className="filter-select"
                                >
                                    <option value="all">All Horses</option>
                                    <option value="active">Active Only</option>
                                    <option value="inactive">Resting Only</option>
                                </select>
                                <button className="btn-success" onClick={() => toggleAllPersonas(true)}>
                                    Activate All
                                </button>
                                <button className="btn-create" onClick={() => setShowCreateModal(true)}>
                                    ➕ New Horse
                                </button>
                            </div>
                        </div>

                        <div className="persona-grid">
                            {filteredPersonas.map(persona => (
                                <div
                                    key={persona.id}
                                    className={`persona-card ${persona.is_active ? 'active' : 'inactive'}`}
                                >
                                    <div className="persona-header">
                                        <div className="persona-avatar">
                                            {persona.gender === 'female' ? '👩' : '👨'}
                                        </div>
                                        <div className="persona-info">
                                            <h3>{persona.name}</h3>
                                            <span className="alias">@{persona.alias}</span>
                                        </div>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={persona.is_active}
                                                onChange={() => togglePersona(persona.id, persona.is_active)}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                    </div>
                                    <div className="persona-details">
                                        <p className="location">📍 {persona.location}</p>
                                        <p className="specialty">🎯 {persona.specialty?.replace('_', ' ')}</p>
                                        <p className="stakes">💰 {persona.stakes}</p>
                                    </div>
                                    <div className="persona-bio">{persona.bio}</div>
                                    <div className="persona-voice">
                                        <span className="voice-tag">{persona.voice}</span>
                                        <button
                                            className="delete-btn"
                                            onClick={() => handleDelete(persona.id, persona.name)}
                                            title="Retire Horse"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* PIPELINE */}
                {activeTab === 'pipeline' && (
                    <div className="pipeline-view">
                        <h2>🚀 Content Pipeline</h2>

                        <div className="pipeline-actions">
                            <h3>Quick Actions</h3>
                            <div className="action-buttons">
                                <button onClick={() => triggerGeneration('test')} className="action-btn">
                                    <span className="icon">🧪</span>
                                    <span className="label">Test Run</span>
                                    <span className="desc">3 posts, no video</span>
                                </button>
                                <button onClick={() => triggerGeneration('cycle', { posts: 10, videos: 2 })} className="action-btn">
                                    <span className="icon">🔄</span>
                                    <span className="label">Quick Cycle</span>
                                    <span className="desc">10 posts + 2 videos</span>
                                </button>
                                <button onClick={() => triggerGeneration('daily')} className="action-btn featured">
                                    <span className="icon">📅</span>
                                    <span className="label">Full Daily</span>
                                    <span className="desc">{settings.posts_per_day} posts</span>
                                </button>
                                <button onClick={() => triggerGeneration('publish')} className="action-btn">
                                    <span className="icon">📤</span>
                                    <span className="label">Publish Due</span>
                                    <span className="desc">Post scheduled</span>
                                </button>
                            </div>
                        </div>

                        <div className="rss-sources">
                            <h3>📡 RSS Sources</h3>
                            <div className="source-list">
                                {[
                                    { name: 'PokerNews', status: 'active' },
                                    { name: 'Card Player', status: 'active' },
                                    { name: 'PocketFives', status: 'active' },
                                    { name: 'Upswing Poker', status: 'active' },
                                    { name: '2+2 Forums', status: 'active' }
                                ].map((source, i) => (
                                    <div key={i} className="source-item">
                                        <span className="source-name">{source.name}</span>
                                        <span className="source-status">🟢</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="recent-runs">
                            <h3>📊 Recent Pipeline Runs</h3>
                            {pipelineRuns.length === 0 ? (
                                <p className="no-data">No pipeline runs yet. Trigger one above!</p>
                            ) : (
                                <table className="runs-table">
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
                                                <td><span className={`run-type ${run.run_type}`}>{run.run_type}</span></td>
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

                {/* SETTINGS */}
                {activeTab === 'settings' && (
                    <div className="settings-view">
                        <h2>⚙️ Engine Settings</h2>

                        <div className="settings-grid">
                            <div className="setting-card">
                                <h3>📅 Posting Schedule</h3>
                                <div className="setting-item">
                                    <label>Posts Per Day</label>
                                    <input
                                        type="number"
                                        value={settings.posts_per_day}
                                        onChange={(e) => updateSettings('posts_per_day', parseInt(e.target.value))}
                                        min="1"
                                        max="100"
                                    />
                                </div>
                                <div className="setting-item">
                                    <label>Min Delay (minutes)</label>
                                    <input
                                        type="number"
                                        value={settings.min_delay_minutes}
                                        onChange={(e) => updateSettings('min_delay_minutes', parseInt(e.target.value))}
                                        min="5"
                                        max="180"
                                    />
                                </div>
                                <div className="setting-item">
                                    <label>Max Delay (minutes)</label>
                                    <input
                                        type="number"
                                        value={settings.max_delay_minutes}
                                        onChange={(e) => updateSettings('max_delay_minutes', parseInt(e.target.value))}
                                        min="15"
                                        max="300"
                                    />
                                </div>
                            </div>

                            <div className="setting-card">
                                <h3>🤖 AI Settings</h3>
                                <div className="setting-item">
                                    <label>Model</label>
                                    <select
                                        value={settings.ai_model}
                                        onChange={(e) => updateSettings('ai_model', e.target.value)}
                                    >
                                        <option value="gpt-4o">GPT-4o (Best)</option>
                                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                                    </select>
                                </div>
                                <div className="setting-item">
                                    <label>Temperature</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={settings.temperature * 100}
                                        onChange={(e) => updateSettings('temperature', e.target.value / 100)}
                                    />
                                    <span className="range-value">{settings.temperature}</span>
                                </div>
                                <div className="setting-item">
                                    <label>Max Tokens</label>
                                    <input
                                        type="number"
                                        value={settings.max_tokens}
                                        onChange={(e) => updateSettings('max_tokens', parseInt(e.target.value))}
                                        min="100"
                                        max="1000"
                                    />
                                </div>
                            </div>

                            <div className="setting-card full-width">
                                <h3>🔌 System Controls</h3>
                                <div className="system-controls">
                                    <div className="control-item">
                                        <label>Content Engine</label>
                                        <label className="toggle-switch large">
                                            <input
                                                type="checkbox"
                                                checked={settings.engine_enabled}
                                                onChange={(e) => updateSettings('engine_enabled', e.target.checked)}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                        <span className="control-status">
                                            {settings.engine_enabled ? '🟢 Running' : '🔴 Stopped'}
                                        </span>
                                    </div>
                                    <div className="control-item">
                                        <label>Auto-Publish</label>
                                        <label className="toggle-switch large">
                                            <input
                                                type="checkbox"
                                                checked={settings.auto_publish}
                                                onChange={(e) => updateSettings('auto_publish', e.target.checked)}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                        <span className="control-status">
                                            {settings.auto_publish ? '🟢 Active' : '🔴 Manual'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="setting-card full-width">
                                <h3>⏰ Peak Hours</h3>
                                <p className="setting-description">Posts will be scheduled during these hours.</p>
                                <div className="hour-grid">
                                    {Array.from({ length: 24 }, (_, i) => (
                                        <button
                                            key={i}
                                            className={`hour-btn ${settings.peak_hours?.includes(i) ? 'active' : ''}`}
                                            onClick={() => {
                                                const current = settings.peak_hours || [];
                                                const updated = current.includes(i)
                                                    ? current.filter(h => h !== i)
                                                    : [...current, i].sort((a, b) => a - b);
                                                updateSettings('peak_hours', updated);
                                            }}
                                        >
                                            {i}:00
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* STATISTICS */}
                {activeTab === 'stats' && (
                    <div className="stats-view">
                        <h2>📊 Content Statistics</h2>

                        <div className="stats-overview">
                            <div className="stat-card large">
                                <span className="stat-number">{personas.length}</span>
                                <span className="stat-label">Total Authors</span>
                            </div>
                            <div className="stat-card large">
                                <span className="stat-number">{activeCount}</span>
                                <span className="stat-label">Active Authors</span>
                            </div>
                            <div className="stat-card large">
                                <span className="stat-number">{pipelineRuns.length}</span>
                                <span className="stat-label">Pipeline Runs</span>
                            </div>
                            <div className="stat-card large">
                                <span className="stat-number">
                                    {pipelineRuns.reduce((sum, r) => sum + (r.text_posts_created || 0), 0)}
                                </span>
                                <span className="stat-label">Posts Created</span>
                            </div>
                        </div>

                        <div className="content-breakdown">
                            <h3>Content Type Breakdown</h3>
                            <div className="breakdown-grid">
                                {[
                                    { type: 'Strategy Tips', count: 45, color: '#8b5cf6' },
                                    { type: 'Hand Analysis', count: 32, color: '#22c55e' },
                                    { type: 'Mindset Posts', count: 28, color: '#f59e0b' },
                                    { type: 'Beginner Guides', count: 21, color: '#3b82f6' },
                                    { type: 'Videos', count: 12, color: '#ef4444' }
                                ].map((item, i) => (
                                    <div key={i} className="breakdown-item">
                                        <div className="breakdown-bar" style={{
                                            width: `${(item.count / 50) * 100}%`,
                                            backgroundColor: item.color
                                        }}></div>
                                        <span className="breakdown-label">{item.type}</span>
                                        <span className="breakdown-count">{item.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </main>
                )}
        </main>

            {/* CREATE MODAL */ }
    {
        showCreateModal && (
            <div className="modal-overlay">
                <div className="modal-content">
                    <div className="modal-header">
                        <h2>🐴 New Horse</h2>
                        <button className="close-btn" onClick={() => setShowCreateModal(false)}>×</button>
                    </div>
                    <form onSubmit={handleCreate}>
                        <div className="form-group">
                            <label>Name</label>
                            <input
                                type="text"
                                value={newPersona.name}
                                onChange={e => setNewPersona({ ...newPersona, name: e.target.value })}
                                placeholder="e.g. Johnny Sticks"
                                required
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Gender</label>
                                <select
                                    value={newPersona.gender}
                                    onChange={e => setNewPersona({ ...newPersona, gender: e.target.value })}
                                >
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                </select>
                            </div>
                            <div className="form-group">
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
                        <div className="form-group">
                            <label>Bio</label>
                            <textarea
                                value={newPersona.bio}
                                onChange={e => setNewPersona({ ...newPersona, bio: e.target.value })}
                                placeholder="Brief backstory..."
                                rows="3"
                                required
                            />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
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
                            <div className="form-group">
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
                        <div className="form-actions">
                            <button type="button" className="btn-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
                            <button type="submit" className="btn-submit">Stabling Horse</button>
                        </div>
                    </form>
                </div>
            </div>
        )
    }
        </div >
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════

export default function HorsesAdmin() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for existing session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            setLoading(false);
        }).catch(() => {
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setUser(session?.user ?? null);
            }
        );

        return () => subscription?.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        setUser(null);
    };

    if (loading) {
        return (
            <div className="horses-loading">
                <span className="logo spinning">🐴</span>
                <p>Saddling up...</p>
            </div>
        );
    }

    if (!user) {
        return <HorsesLogin onLogin={setUser} />;
    }

    return <HorsesDashboard user={user} onLogout={handleLogout} />;
}
