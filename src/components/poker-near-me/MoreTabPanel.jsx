/**
 * MoreTabPanel — Extracted from poker-near-me.js renderContent() 'more' case
 * More Tools overview + sub-tab routing for Road Trip, Social, Alerts, NearMeNow, TripCost.
 */
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const RoadTripPlanner = dynamic(() => import('./RoadTripPlanner'), { ssr: false });
const SocialLayer = dynamic(() => import('./SocialLayer'), { ssr: false });
const TournamentAlerts = dynamic(() => import('./TournamentAlerts'), { ssr: false });
const NearMeNowFeed = dynamic(() => import('./NearMeNowFeed'), { ssr: false });
const TripCostCalculator = dynamic(() => import('./TripCostCalculator'), { ssr: false });

export default function MoreTabPanel({
    activeMoreTab,
    setActiveMoreTab,
    allVenuesForMap,
    venues,
    userLocation,
    userId,
    user,
    dailyTournaments,
    series,
    gpsLocationLabel,
    geofenceStatus,
    pushPermission,
    requestPushPermission,
    setPushPermission,
    guardAction,
    requestGpsLocation,
    setActiveTab,
    router,
    openVenueModal,
    authToken: authTokenProp,
}) {
    const effectiveVenues = allVenuesForMap.length > 0 ? allVenuesForMap : venues;

    // `user` comes from AvatarContext — a Supabase auth user/profile object. Supabase puts
    // the JWT on the *session*, not the user, so user?.access_token is normally undefined and
    // SocialLayer/TournamentAlerts fetches silently ran unauthenticated. Resolve the session
    // token here whenever the parent doesn't supply one. Uses the sanctioned authUtils
    // helper (repo rule: never call the Supabase client's auth.getSession() directly).
    const [sessionToken, setSessionToken] = useState(null);
    useEffect(() => {
        if (authTokenProp || user?.access_token) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const { getFreshAccessToken } = await import('../../lib/authUtils');
                const token = await getFreshAccessToken();
                if (!cancelled) setSessionToken(token || null);
            } catch {
                if (!cancelled) setSessionToken(null);
            }
        })();
        return () => { cancelled = true; };
    }, [authTokenProp, user?.access_token, userId]);

    const authToken = authTokenProp || user?.access_token || sessionToken || undefined;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '20px 0', width: '100%' }}>
            {/* TOOLS OVERVIEW LANDING */}
            {activeMoreTab === 'overview' && (
                <div className="more-tools-overview">
                    <div className="more-tools-header">
                        <h2 className="more-tools-title">More Tools</h2>
                        <p className="more-tools-desc">Advanced Features To Enhance Your Poker Experience</p>
                    </div>
                    <div className="more-tools-grid">
                        {[
                            { id: 'roadtrip', title: 'Road Trip Planner', desc: 'Plan Multi-Stop Poker Road Trips Along Your Travel Route', icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z" /><circle cx="12" cy="10" r="3" /><path d="M16 18l2 2 4-4" stroke="#22c55e" strokeWidth="2" /></svg> },
                            { id: 'social', title: 'Social Feed', desc: 'Connect With Players At Nearby Venues And Share Updates', icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg> },
                            { id: 'alerts', title: 'Game Alerts', desc: 'Get Notified When Your Favorite Games And Stakes Go Live', icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /><circle cx="18" cy="4" r="3" fill="#ef4444" stroke="none" /></svg> },
                            { id: 'nearmenow', title: 'Near Me Now', desc: 'Instantly Find The Closest Poker Rooms To Your Location', icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /><circle cx="12" cy="12" r="8" stroke="rgba(34,197,94,0.3)" /></svg> },
                            { id: 'tripcost', title: 'Trip Cost Calculator', desc: 'Estimate Gas, Hotel, And Total Trip Expenses Before You Go', icon: <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5"><rect x="2" y="3" width="20" height="18" rx="2" /><path d="M2 9h20" /><path d="M9 21V9" /><circle cx="15.5" cy="15" r="2" /></svg> },
                        ].map(tool => (
                            <button
                                key={tool.id}
                                className="more-tool-card"
                                onClick={() => setActiveMoreTab(tool.id)}
                            >
                                <div className="more-tool-icon">{tool.icon}</div>
                                <div className="more-tool-info">
                                    <h3 className="more-tool-name">{tool.title}</h3>
                                    <p className="more-tool-desc">{tool.desc}</p>
                                </div>
                                <svg className="more-tool-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {activeMoreTab === 'roadtrip' && (
                <div onClickCapture={(e) => {
                    if (!guardAction(() => {})) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                }}>
                    <RoadTripPlanner venues={effectiveVenues} userLocation={userLocation} dailyTournaments={dailyTournaments} series={series} locationCity={gpsLocationLabel ? gpsLocationLabel.split(',')[0]?.trim() : ''} locationState={gpsLocationLabel ? gpsLocationLabel.split(',')[1]?.trim() : ''} />
                </div>
            )}
            {activeMoreTab === 'social' && (
                <SocialLayer userId={userId} userLocation={userLocation} venues={effectiveVenues} authToken={authToken} />
            )}
            
            {/* ALERTS & NOTIFICATIONS */}
            {activeMoreTab === 'alerts' && (
                <>
                    {geofenceStatus === 'denied' && (
                        <div className="geofence-notice denied" style={{ marginBottom: -10 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            <span>Notifications Blocked - Venue Alerts Will Show In-App Only</span>
                        </div>
                    )}
                    {pushPermission === 'default' && userLocation && (
                        <div className="push-optin-banner" style={{ marginBottom: -10 }}>
                            <span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: -2, marginRight: 4 }}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 01-3.46 0" /></svg>Enable push notifications for venue proximity alerts?</span>
                            <button onClick={requestPushPermission}>Enable</button>
                            <button onClick={() => setPushPermission('dismissed')} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}>Dismiss</button>
                        </div>
                    )}
                    <TournamentAlerts dailyTournaments={dailyTournaments} userId={userId} authToken={authToken} />
                </>
            )}

            {activeMoreTab === 'nearmenow' && (
                <NearMeNowFeed userLocation={userLocation} venues={effectiveVenues} onRequestGPS={requestGpsLocation} onSwitchTab={setActiveTab} onNavigateVenue={(venueId) => { if (openVenueModal) openVenueModal(`/hub/venues/${venueId}`); else if (typeof window !== 'undefined') window.location.href = `/hub/venues/${venueId}`; }} />
            )}
            {activeMoreTab === 'tripcost' && (
                <div onClickCapture={(e) => {
                    if (!guardAction(() => {})) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                }}>
                    <TripCostCalculator venues={effectiveVenues} userLocation={userLocation} />
                </div>
            )}
        </div>
    );
}
