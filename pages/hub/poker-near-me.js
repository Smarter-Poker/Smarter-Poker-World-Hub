/**
 * POKER NEAR ME - Simplified Version
 * Guaranteed to work - no fancy animations
 */

import Head from 'next/head';
import { useState, useEffect } from 'react';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

export default function PokerNearMe() {
    const [venues, setVenues] = useState([]);
    const [series, setSeries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch venues
            const venuesRes = await fetch('/api/poker/venues?limit=50');
            const venuesJson = await venuesRes.json();
            console.log('Venues response:', venuesJson);
            setVenues(venuesJson.data || []);

            // Fetch series
            const seriesRes = await fetch('/api/poker/series?limit=10&upcoming=false');
            const seriesJson = await seriesRes.json();
            console.log('Series response:', seriesJson);
            setSeries(seriesJson.data || []);

        } catch (err) {
            console.error('Fetch error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Head>
                <title>Poker Near Me | Smarter.Poker</title>
            </Head>

            <div style={{ minHeight: '100vh', background: '#0a0e1a', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
                <UniversalHeader pageDepth={1} />

                {/* Page Title */}
                <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>
                        <span style={{ color: '#f59e0b' }}>POKER</span> NEAR <span style={{ color: '#f59e0b' }}>ME</span>
                    </h1>
                    <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '14px' }}>
                        Find poker rooms, casinos, and card clubs
                    </p>
                </div>

                {/* Debug Info */}
                <div style={{ padding: '16px', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: '#00d4ff' }}>
                        Status: {loading ? 'Loading...' : error ? `Error: ${error}` : `Loaded ${venues.length} venues, ${series.length} series`}
                    </p>
                </div>

                {/* Main Content */}
                <div style={{ padding: '16px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <p>Loading poker rooms...</p>
                        </div>
                    ) : error ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>
                            <p>Error: {error}</p>
                            <button onClick={fetchData} style={{ marginTop: '16px', padding: '10px 20px', background: '#00d4ff', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer' }}>
                                Retry
                            </button>
                        </div>
                    ) : venues.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <p>No venues found</p>
                            <button onClick={fetchData} style={{ marginTop: '16px', padding: '10px 20px', background: '#00d4ff', border: 'none', borderRadius: '8px', color: '#000', cursor: 'pointer' }}>
                                Refresh
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Tournament Series Section */}
                            {series.length > 0 && (
                                <div style={{ marginBottom: '24px' }}>
                                    <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'rgba(255,255,255,0.7)' }}>
                                        UPCOMING TOURNAMENT SERIES
                                    </h2>
                                    <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
                                        {series.slice(0, 5).map((s, i) => (
                                            <div key={s.id || i} style={{
                                                minWidth: '200px',
                                                padding: '12px',
                                                background: 'linear-gradient(135deg, rgba(30,41,59,0.8), rgba(15,23,42,0.9))',
                                                borderRadius: '12px',
                                                border: '1px solid rgba(255,255,255,0.1)'
                                            }}>
                                                <div style={{
                                                    display: 'inline-block',
                                                    padding: '4px 8px',
                                                    background: 'rgba(0,212,255,0.2)',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    color: '#00d4ff',
                                                    marginBottom: '8px'
                                                }}>
                                                    {s.short_name || 'SERIES'}
                                                </div>
                                                <h3 style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }}>{s.name}</h3>
                                                <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{s.location}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Venues Grid */}
                            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: 'rgba(255,255,255,0.7)' }}>
                                POKER ROOMS ({venues.length})
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                                {venues.map((venue, i) => (
                                    <div key={venue.id || i} style={{
                                        background: 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))',
                                        borderRadius: '16px',
                                        padding: '16px',
                                        border: '1px solid rgba(255,255,255,0.1)'
                                    }}>
                                        <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600 }}>
                                            {venue.name}
                                        </h3>
                                        <p style={{ margin: '0 0 8px', fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>
                                            {venue.city}, {venue.state}
                                        </p>

                                        {/* Games */}
                                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                            {venue.games_offered?.map((game, gi) => (
                                                <span key={gi} style={{
                                                    padding: '4px 8px',
                                                    background: 'rgba(0,212,255,0.2)',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    color: '#00d4ff'
                                                }}>
                                                    {game}
                                                </span>
                                            ))}
                                        </div>

                                        {/* Stakes */}
                                        {venue.stakes_cash && venue.stakes_cash.length > 0 && (
                                            <p style={{ margin: '0 0 12px', fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                                                Stakes: {venue.stakes_cash.slice(0, 3).join(', ')}
                                            </p>
                                        )}

                                        {/* Trust Score */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                            <span style={{
                                                fontSize: '12px',
                                                color: venue.trust_score >= 4.5 ? '#22c55e' : venue.trust_score >= 4.0 ? '#3b82f6' : '#f59e0b'
                                            }}>
                                                Trust: {venue.trust_score?.toFixed(1) || '4.0'}
                                            </span>
                                            {venue.poker_tables && (
                                                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                                                    {venue.poker_tables} tables
                                                </span>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            {venue.phone && (
                                                <a href={`tel:${venue.phone}`} style={{
                                                    flex: 1,
                                                    padding: '10px',
                                                    background: 'rgba(34,197,94,0.2)',
                                                    borderRadius: '8px',
                                                    color: '#22c55e',
                                                    textDecoration: 'none',
                                                    textAlign: 'center',
                                                    fontSize: '13px',
                                                    fontWeight: 500
                                                }}>
                                                    Call
                                                </a>
                                            )}
                                            {venue.website && (
                                                <a href={venue.website.startsWith('http') ? venue.website : `https://${venue.website}`} target="_blank" rel="noopener noreferrer" style={{
                                                    flex: 1,
                                                    padding: '10px',
                                                    background: 'rgba(0,212,255,0.2)',
                                                    borderRadius: '8px',
                                                    color: '#00d4ff',
                                                    textDecoration: 'none',
                                                    textAlign: 'center',
                                                    fontSize: '13px',
                                                    fontWeight: 500
                                                }}>
                                                    Website
                                                </a>
                                            )}
                                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue.name + ' ' + venue.city + ' ' + venue.state)}`} target="_blank" rel="noopener noreferrer" style={{
                                                flex: 1,
                                                padding: '10px',
                                                background: 'rgba(251,191,36,0.2)',
                                                borderRadius: '8px',
                                                color: '#fbbf24',
                                                textDecoration: 'none',
                                                textAlign: 'center',
                                                fontSize: '13px',
                                                fontWeight: 500
                                            }}>
                                                Directions
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
