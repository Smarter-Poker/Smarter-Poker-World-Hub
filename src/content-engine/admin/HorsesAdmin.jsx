/**
 * 🐴 HORSES ADMIN PANEL
 * ═══════════════════════════════════════════════════════════════════════════
 * Content Persona Management System
 * Control your stable of content creators from one dashboard.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import './HorsesAdmin.css';

// Initialize Supabase
const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
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
    const [settings, setSettings] = useState({});
    const [stats, setStats] = useState({});
    const [activeTab, setActiveTab] = useState('stable');
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);

        // Load personas
        const { data: personaData } = await supabase
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

        setPersonas(personaData || []);
        setSettings(settingsData || {});
        setStats(statsData || []);
        setLoading(false);
    };

    const togglePersona = async (id, currentStatus) => {
        const newStatus = !currentStatus;

        await supabase
            .from('content_authors')
            .update({ is_active: newStatus })
            .eq('id', id);

        setPersonas(personas.map(p =>
            p.id === id ? { ...p, is_active: newStatus } : p
        ));
    };

    const toggleAllPersonas = async (activate) => {
        await supabase
            .from('content_authors')
            .update({ is_active: activate })
            .neq('id', 0); // Update all

        setPersonas(personas.map(p => ({ ...p, is_active: activate })));
    };

    const updateSettings = async (key, value) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);

        await supabase
            .from('content_settings')
            .upsert({ id: 1, ...newSettings });
    };

    const triggerGeneration = async (count) => {
        // Call edge function to generate content
        const { data, error } = await supabase.functions.invoke('generate-content', {
            body: { count }
        });

        if (error) {
            alert('Generation failed: ' + error.message);
        } else {
            alert(`Generated ${count} posts successfully!`);
            loadData();
        }
    };

    // Filter personas
    const filteredPersonas = personas.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.alias.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.location.toLowerCase().includes(searchTerm.toLowerCase());

        if (filter === 'active') return matchesSearch && p.is_active;
        if (filter === 'inactive') return matchesSearch && !p.is_active;
        return matchesSearch;
    });

    const activeCount = personas.filter(p => p.is_active).length;

    return (
        <div className="horses-dashboard">
            {/* HEADER */}
            <header className="dashboard-header">
                <div className="header-left">
                    <span className="logo">🐴</span>
                    <h1>HORSES</h1>
                    <span className="subtitle">Content Stable</span>
                </div>
                <div className="header-right">
                    <span className="user-info">{user.email}</span>
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
                <button
                    className={activeTab === 'generate' ? 'active' : ''}
                    onClick={() => setActiveTab('generate')}
                >
                    ⚡ Generate
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
                                <button
                                    className="btn-success"
                                    onClick={() => toggleAllPersonas(true)}
                                >
                                    Activate All
                                </button>
                                <button
                                    className="btn-danger"
                                    onClick={() => toggleAllPersonas(false)}
                                >
                                    Rest All
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
                                    <div className="persona-bio">
                                        {persona.bio}
                                    </div>
                                    <div className="persona-voice">
                                        <span className="voice-tag">{persona.voice}</span>
                                    </div>
                                </div>
                            ))}
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
                                        value={settings.posts_per_day || 20}
                                        onChange={(e) => updateSettings('posts_per_day', parseInt(e.target.value))}
                                        min="1"
                                        max="100"
                                    />
                                </div>
                                <div className="setting-item">
                                    <label>Min Delay Between Posts (minutes)</label>
                                    <input
                                        type="number"
                                        value={settings.min_delay_minutes || 30}
                                        onChange={(e) => updateSettings('min_delay_minutes', parseInt(e.target.value))}
                                        min="5"
                                        max="180"
                                    />
                                </div>
                                <div className="setting-item">
                                    <label>Max Delay Between Posts (minutes)</label>
                                    <input
                                        type="number"
                                        value={settings.max_delay_minutes || 120}
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
                                        value={settings.ai_model || 'gpt-4o'}
                                        onChange={(e) => updateSettings('ai_model', e.target.value)}
                                    >
                                        <option value="gpt-4o">GPT-4o (Best Quality)</option>
                                        <option value="gpt-4o-mini">GPT-4o Mini (Faster)</option>
                                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Cheapest)</option>
                                    </select>
                                </div>
                                <div className="setting-item">
                                    <label>Temperature (Creativity)</label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={(settings.temperature || 0.8) * 100}
                                        onChange={(e) => updateSettings('temperature', e.target.value / 100)}
                                    />
                                    <span className="range-value">{settings.temperature || 0.8}</span>
                                </div>
                                <div className="setting-item">
                                    <label>Max Tokens Per Post</label>
                                    <input
                                        type="number"
                                        value={settings.max_tokens || 500}
                                        onChange={(e) => updateSettings('max_tokens', parseInt(e.target.value))}
                                        min="100"
                                        max="1000"
                                    />
                                </div>
                            </div>

                            <div className="setting-card">
                                <h3>🎯 Content Mix</h3>
                                {['strategy_tip', 'hand_analysis', 'mindset_post', 'beginner_guide', 'advanced_concept', 'bankroll_advice', 'tournament_tip'].map(type => (
                                    <div className="setting-item" key={type}>
                                        <label>{type.replace('_', ' ')}</label>
                                        <input
                                            type="number"
                                            value={settings[`mix_${type}`] || 3}
                                            onChange={(e) => updateSettings(`mix_${type}`, parseInt(e.target.value))}
                                            min="0"
                                            max="20"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="setting-card">
                                <h3>⏰ Peak Hours</h3>
                                <p className="setting-description">
                                    Posts will be scheduled during these hours (local time).
                                </p>
                                <div className="hour-grid">
                                    {Array.from({ length: 24 }, (_, i) => (
                                        <button
                                            key={i}
                                            className={`hour-btn ${(settings.peak_hours || [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]).includes(i) ? 'active' : ''}`}
                                            onClick={() => {
                                                const current = settings.peak_hours || [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
                                                const updated = current.includes(i)
                                                    ? current.filter(h => h !== i)
                                                    : [...current, i].sort((a, b) => a - b);
                                                updateSettings('peak_hours', updated);
                                            }}
                                        >
                                            {i}
                                        </button>
                                    ))}
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
                                                checked={settings.engine_enabled !== false}
                                                onChange={(e) => updateSettings('engine_enabled', e.target.checked)}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                        <span className="control-status">
                                            {settings.engine_enabled !== false ? '🟢 Running' : '🔴 Stopped'}
                                        </span>
                                    </div>
                                    <div className="control-item">
                                        <label>Auto-Publish</label>
                                        <label className="toggle-switch large">
                                            <input
                                                type="checkbox"
                                                checked={settings.auto_publish !== false}
                                                onChange={(e) => updateSettings('auto_publish', e.target.checked)}
                                            />
                                            <span className="slider"></span>
                                        </label>
                                        <span className="control-status">
                                            {settings.auto_publish !== false ? '🟢 Active' : '🔴 Manual'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* STATISTICS */}
                {activeTab === 'stats' && (
                    <div className="stats-view">
                        <h2>📊 Content Statistics</h2>
                        <div className="stats-grid">
                            {stats.map && stats.map(stat => (
                                <div className="stat-card" key={stat.content_type}>
                                    <h3>{stat.content_type?.replace('_', ' ')}</h3>
                                    <div className="stat-numbers">
                                        <div>
                                            <span className="big-number">{stat.total_posts || 0}</span>
                                            <span className="label">Total</span>
                                        </div>
                                        <div>
                                            <span className="big-number">{stat.published || 0}</span>
                                            <span className="label">Published</span>
                                        </div>
                                        <div>
                                            <span className="big-number">{stat.scheduled || 0}</span>
                                            <span className="label">Scheduled</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* GENERATE */}
                {activeTab === 'generate' && (
                    <div className="generate-view">
                        <h2>⚡ Manual Generation</h2>
                        <p className="view-description">
                            Trigger immediate content generation. Active horses will create content now.
                        </p>

                        <div className="generate-buttons">
                            <button onClick={() => triggerGeneration(10)} className="generate-btn">
                                <span className="btn-count">10</span>
                                <span className="btn-label">Quick Batch</span>
                            </button>
                            <button onClick={() => triggerGeneration(50)} className="generate-btn">
                                <span className="btn-count">50</span>
                                <span className="btn-label">Medium Batch</span>
                            </button>
                            <button onClick={() => triggerGeneration(100)} className="generate-btn featured">
                                <span className="btn-count">100</span>
                                <span className="btn-label">Full Stable Run</span>
                            </button>
                        </div>

                        <div className="active-horses-preview">
                            <h3>🏇 Active Horses ({activeCount})</h3>
                            <div className="horse-chips">
                                {personas.filter(p => p.is_active).slice(0, 20).map(p => (
                                    <span key={p.id} className="horse-chip">
                                        {p.gender === 'female' ? '👩' : '👨'} {p.alias}
                                    </span>
                                ))}
                                {activeCount > 20 && (
                                    <span className="horse-chip more">+{activeCount - 20} more</span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
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
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setUser(session?.user ?? null);
            }
        );

        return () => subscription.unsubscribe();
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
