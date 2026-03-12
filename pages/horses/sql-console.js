import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';
import { useRouter } from 'next/router';
import { eventBus, EventType } from '../../src/engine/EventBus';

export default function OmnichannelSQLConsole() {
    const router = useRouter();
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    const [sqlQuery, setSqlQuery] = useState('-- Write your raw PostgreSQL query here\nSELECT * FROM profiles LIMIT 5;');
    const [isRunning, setIsRunning] = useState(false);
    const [allowDestructive, setAllowDestructive] = useState(false);
    const [result, setResult] = useState(null);

    // Auth & Bus Verification
    useEffect(() => {
        let authSubscription = null;

        const verifyAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
                return;
            }
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
            if (profile && ['admin', 'superadmin', 'god'].includes(profile.role)) {
                setIsAdmin(true);
            } else {
                router.push('/');
            }
            setLoadingConfig(false);
        };
        verifyAuth();

        // 1. Strict Auth Listener
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT' || !session) router.push('/login');
        });
        authSubscription = authListener?.subscription;

        // 2. Global EventBus Listener
        const unsubMutated = eventBus.on(EventType.DATA_MUTATED, (event) => {
            console.log('Global data mutation detected, console remains active.', event);
        });

        return () => {
            authSubscription?.unsubscribe();
            unsubMutated();
        };
    }, [router]);

    const handleExecute = async () => {
        if (!sqlQuery.trim()) return;
        setIsRunning(true);
        setResult(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const res = await fetch('/api/admin/execute-sql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ sql: sqlQuery, allowDestructive })
            });

            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const data = await res.json();
            setResult({ status: res.status, data });

            // [HARDENING] Real-time Sync — Broadcast mutation globally
            if (data.success && data.command && /(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)/i.test(data.command)) {
                try {
                    eventBus.emit(EventType.DATA_MUTATED, { source: 'sql-console-execution' }, 'SQLConsole');
                } catch (e) {
                    console.error('Failed to emit mutation event:', e);
                }
            }
        } catch (err) {
            setResult({ status: 500, data: { success: false, error: err.message } });
        } finally {
            setIsRunning(false);
        }
    };

    if (loadingConfig) {
        return <div style={{ background: '#09090b', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#a1a1aa' }}>Authenticating Agent...</div>;
    }
    if (!isAdmin) return null;

    return (
        <div style={{ background: '#09090b', minHeight: '100vh', color: '#e4e4e7', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <Head>
                <title>Omnichannel SQL Console | Antigravity</title>
            </Head>

            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', borderBottom: '1px solid #27272a', paddingBottom: '1rem' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: '#f4f4f5' }}>🧠 Omnichannel SQL Console</h1>
                        <p style={{ margin: '0.5rem 0 0 0', color: '#a1a1aa', fontSize: '0.875rem' }}>Browser Interface for live Supabase PostgreSQL execution.</p>
                    </div>
                    <button
                        onClick={() => router.push('/horses')}
                        style={{ background: '#27272a', color: '#e4e4e7', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer' }}>
                        ← Back to Horses
                    </button>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                    {/* Editor Box */}
                    <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SQL Query</div>
                            <button
                                onClick={handleExecute}
                                disabled={isRunning}
                                style={{
                                    background: isRunning ? '#3f3f46' : '#2563eb',
                                    color: '#fff', border: 'none', padding: '0.5rem 1.5rem', borderRadius: '4px', cursor: isRunning ? 'not-allowed' : 'pointer',
                                    fontWeight: 600, transition: 'background 0.2s'
                                }}>
                                {isRunning ? 'Executing...' : '▶ Run Query'}
                            </button>
                        </div>

                        <textarea
                            value={sqlQuery}
                            onChange={(e) => setSqlQuery(e.target.value)}
                            style={{
                                width: '100%',
                                height: '250px',
                                background: '#000',
                                color: '#10b981',
                                border: '1px solid #3f3f46',
                                borderRadius: '4px',
                                padding: '1rem',
                                fontFamily: 'monospace',
                                fontSize: '14px',
                                resize: 'vertical',
                                outline: 'none'
                            }}
                            spellCheck="false"
                        />

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
                            <input
                                type="checkbox"
                                id="allowDestructive"
                                checked={allowDestructive}
                                onChange={(e) => setAllowDestructive(e.target.checked)}
                                style={{ accentColor: '#ef4444', width: '16px', height: '16px' }}
                            />
                            <label htmlFor="allowDestructive" style={{ fontSize: '0.875rem', color: allowDestructive ? '#ef4444' : '#a1a1aa', fontWeight: 600, cursor: 'pointer' }}>
                                Allow Destructive Operations (DROP, DELETE, TRUNCATE)
                            </label>
                        </div>

                        <p style={{ fontSize: '0.75rem', color: '#71717a', margin: 0 }}>
                            <strong>Caution:</strong> Executions are strictly wrapped in a 10s timeout `BEGIN`/`COMMIT` block with Immutable Forensics Logging.
                        </p>
                    </div>

                    {/* Output Box */}
                    <div style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', padding: '1rem', minHeight: '300px' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Execution Output</div>

                        {result ? (
                            <div style={{ background: '#000', borderRadius: '4px', padding: '1rem', border: `1px solid ${result.data.success ? '#059669' : '#e11d48'}` }}>
                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid #27272a' }}>
                                    <span style={{ color: result.data.success ? '#10b981' : '#f43f5e', fontWeight: 600 }}>
                                        {result.data.success ? '✅ SUCCESS' : '❌ ERROR'}
                                    </span>
                                    {result.data.ms !== undefined && (
                                        <span style={{ color: '#a1a1aa' }}>Time: {result.data.ms}ms</span>
                                    )}
                                    {result.data.rowCount !== undefined && (
                                        <span style={{ color: '#a1a1aa' }}>Rows: {result.data.rowCount}</span>
                                    )}
                                    {result.data.command && (
                                        <span style={{ color: '#a1a1aa' }}>Command: {result.data.command}</span>
                                    )}
                                </div>

                                <pre style={{ margin: 0, color: '#e4e4e7', fontFamily: 'monospace', fontSize: '13px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                    {JSON.stringify(result.data, null, 2)}
                                </pre>
                            </div>
                        ) : (
                            <div style={{ color: '#52525b', textAlign: 'center', padding: '4rem 0', fontStyle: 'italic' }}>
                                Run a query to see the database output here.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
