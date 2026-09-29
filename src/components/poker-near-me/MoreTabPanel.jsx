/**
 * MoreTabPanel: the Discovery Tools section of Poker Near Me.
 *
 * Mobile phase 3 (docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md):
 * this used to be a second tab set (overview / roadtrip / social / alerts /
 * nearmenow / tripcost) that unmounted every tool except the active one, with
 * the swipe gesture as the only way between them on a phone. Every tool now
 * renders stacked in document order under its own heading. The tool cards at
 * the top and the sub-anchor row are jump lists: a tap scrolls to the tool
 * (and the page updates the URL through setActiveMoreTab). Each tool sits in
 * a LazyPanel so it mounts when scrolled near rather than on first paint.
 */
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import LazyPanel from './LazyPanel';
import { MORE_SECTIONS, sectionId } from './pnmSections';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

const RoadTripPlanner = dynamic(() => import('./RoadTripPlanner'), { ssr: false });
const SocialLayer = dynamic(() => import('./SocialLayer'), { ssr: false });
const TournamentAlerts = dynamic(() => import('./TournamentAlerts'), { ssr: false });
const NearMeNowFeed = dynamic(() => import('./NearMeNowFeed'), { ssr: false });
const TripCostCalculator = dynamic(() => import('./TripCostCalculator'), { ssr: false });
const PeakActivityHeatmap = dynamic(() => import('./PeakActivityHeatmap'), { ssr: false });

const TOOL_CARDS = [
    { id: 'besttime', title: 'Best Time To Go', desc: 'Busiest Hours When Enough Qualified Observed History Is Available', icon: 'calendar' },
    { id: 'roadtrip', title: 'Road Trip Planner', desc: 'Plan Multi-Stop Poker Road Trips Along Your Travel Route', icon: 'directions' },
    { id: 'social', title: 'Social Feed', desc: 'Connect With Players At Nearby Venues And Share Updates', icon: 'globe' },
    { id: 'alerts', title: 'Game Alerts', desc: 'Get Notified When Your Favorite Games And Stakes Go Live', icon: 'saved' },
    { id: 'nearmenow', title: 'Near Me Now', desc: 'Instantly Find The Closest Poker Rooms To Your Location', icon: 'location' },
    { id: 'tripcost', title: 'Trip Cost Calculator', desc: 'Estimate Gas, Hotel, And Total Trip Expenses Before You Go', icon: 'directions' },
];

const SUB_ANCHORS = [{ key: 'besttime', label: 'Best Time', heading: 'Best Time To Go' }, ...MORE_SECTIONS];

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
    requireOnline,
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

    // The tool cards and the anchor row both jump to a stacked tool. 'besttime'
    // is a section on this page only (it has no route slug), so it scrolls
    // without touching the URL; the rest go through the page's navigator.
    const jumpTo = (id) => {
        if (id === 'besttime') {
            const el = typeof document !== 'undefined' ? document.getElementById(sectionId('besttime')) : null;
            if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start', behavior: 'smooth' });
            return;
        }
        setActiveMoreTab(id);
    };

    const gate = (e) => {
        if (!guardAction(() => {})) {
            e.stopPropagation();
            e.preventDefault();
        }
    };

    return (
        <div className="more-tools-stack" style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '8px 0 20px', width: '100%' }}>
            <div className="more-tools-overview">
                <nav className="pnm-sub-tabs" aria-label="Discovery tools">
                    {SUB_ANCHORS.map((sub) => {
                        const selected = activeMoreTab === sub.key;
                        return (
                            <button
                                key={sub.key}
                                type="button"
                                className={'pnm-sub-tab' + (selected ? ' active' : '')}
                                aria-current={selected ? 'true' : undefined}
                                onClick={() => jumpTo(sub.key)}
                            >
                                {sub.label}
                            </button>
                        );
                    })}
                </nav>
                <div className="more-tools-grid">
                    {TOOL_CARDS.map(tool => (
                        <PokerNearMePanelShell
                            as="button"
                            key={tool.id}
                            type="button"
                            className="more-tool-card"
                            onClick={() => jumpTo(tool.id)}
                        >
                            <div className="more-tool-icon"><PokerNearMeConsoleIcon name={tool.icon} /></div>
                            <div className="more-tool-info">
                                <h3 className="more-tool-name">{tool.title}</h3>
                                <p className="more-tool-desc">{tool.desc}</p>
                            </div>
                            <PokerNearMeConsoleIcon name="directions" className="more-tool-arrow" />
                        </PokerNearMePanelShell>
                    ))}
                </div>
            </div>

            {/* BEST TIME TO GO publishes only when qualified observed history is
                available. Catalog/schedule rows never become activity counts. */}
            <div id={sectionId('besttime')} className="pnm-subsection" data-tutorial="best-time">
                <h3 className="pnm-subsection__title">Best Time To Go</h3>
                <LazyPanel minHeight={260}>
                    <PeakActivityHeatmap />
                </LazyPanel>
            </div>

            <div id={sectionId('roadtrip')} className="pnm-subsection">
                <h3 className="pnm-subsection__title">Road Trip Planner</h3>
                <LazyPanel minHeight={320}>
                    <div onClickCapture={gate}>
                        <RoadTripPlanner venues={effectiveVenues} userLocation={userLocation} dailyTournaments={dailyTournaments} series={series} locationCity={gpsLocationLabel ? gpsLocationLabel.split(',')[0]?.trim() : ''} locationState={gpsLocationLabel ? gpsLocationLabel.split(',')[1]?.trim() : ''} />
                    </div>
                </LazyPanel>
            </div>

            <div id={sectionId('social')} className="pnm-subsection" data-tutorial="social">
                <h3 className="pnm-subsection__title">Social Feed</h3>
                <LazyPanel minHeight={320}>
                    <SocialLayer userId={userId} userLocation={userLocation} venues={effectiveVenues} authToken={authToken} requireOnline={requireOnline} />
                </LazyPanel>
            </div>

            <div id={sectionId('alerts')} className="pnm-subsection">
                <h3 className="pnm-subsection__title">Game Alerts</h3>
                <LazyPanel minHeight={260}>
                    {geofenceStatus === 'denied' && (
                        <div className="geofence-notice denied" style={{ marginBottom: 12 }}>
                            <PokerNearMeConsoleIcon name="close" className="pnc-icon--notice" />
                            <span>Notifications Blocked - Venue Alerts Will Show In-App Only</span>
                        </div>
                    )}
                    {pushPermission === 'default' && userLocation && (
                        <div className="push-optin-banner" style={{ marginBottom: 12 }}>
                            <span><PokerNearMeConsoleIcon name="saved" className="pnc-icon--notice" />Enable Push Notifications For Venue Proximity Alerts?</span>
                            <button type="button" onClick={requestPushPermission}>Enable</button>
                            <button type="button" onClick={() => setPushPermission('dismissed')} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer', minHeight: 44 }}>Dismiss</button>
                        </div>
                    )}
                    <TournamentAlerts
                        dailyTournaments={dailyTournaments}
                        venues={effectiveVenues}
                        userId={userId}
                        authToken={authToken}
                        userLocation={userLocation}
                        requireOnline={requireOnline}
                    />
                </LazyPanel>
            </div>

            <div id={sectionId('nearmenow')} className="pnm-subsection">
                <h3 className="pnm-subsection__title">Near Me Now</h3>
                <LazyPanel minHeight={260}>
                    <NearMeNowFeed userLocation={userLocation} venues={effectiveVenues} onRequestGPS={requestGpsLocation} onSwitchTab={setActiveTab} onNavigateVenue={(venueId) => { if (openVenueModal) openVenueModal(`/hub/venues/${venueId}`); else if (typeof window !== 'undefined') window.location.href = `/hub/venues/${venueId}`; }} />
                </LazyPanel>
            </div>

            <div id={sectionId('tripcost')} className="pnm-subsection">
                <h3 className="pnm-subsection__title">Trip Cost Calculator</h3>
                <LazyPanel minHeight={260}>
                    <div onClickCapture={gate}>
                        <TripCostCalculator venues={effectiveVenues} userLocation={userLocation} />
                    </div>
                </LazyPanel>
            </div>
        </div>
    );
}
