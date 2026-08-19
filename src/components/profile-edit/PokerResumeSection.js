import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { C } from './constants';
import { getAccessToken } from '../../lib/authUtils';
import { busEmit } from '../../engine/EventBus';
import { broadcastSync } from '../../lib/broadcastSync';
const CollapsibleSection = dynamic(() => import('./CollapsibleSection'), { ssr: false });
const ProfileField = dynamic(() => import('./ProfileField'), { ssr: false });
const PokerResumeBadge = dynamic(() => import('./PokerResumeBadge'), { ssr: false });

export default function PokerResumeSection({ profile, updateField, saving, setProfile, setMessage }) {
    // The refresh spinner state was lost when this section was split out of
    // pages/hub/profile-edit.js: every setIsRefreshing call survived, the
    // useState behind them did not. Each one threw ReferenceError, so the
    // Hendon Mob sync button died on its first line and the stats never
    // refreshed.
    const [isRefreshing, setIsRefreshing] = useState(false);

    return (
<CollapsibleSection id="sec-resume" title="Poker Resume" icon="🏆">
                        <p style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
                            Link your Hendon Mob profile to automatically display your tournament stats.
                            Stats are synced directly from HendonMob.
                        </p>

                        <ProfileField
                            label="Hendon Mob Profile URL"
                            value={profile.hendon_url}
                            onChange={updateField('hendon_url')}
                            placeholder="https://pokerdb.thehendonmob.com/player.php?a=r&n=YOUR_ID"
                            icon="🔗"
                        />

                        {/* Display Poker Resume badge with sync button */}
                        <PokerResumeBadge
                            hendonData={{
                                hendon_url: profile.hendon_url,
                                total_cashes: profile.hendon_total_cashes,
                                total_earnings: profile.hendon_total_earnings,
                                biggest_cash: profile.hendon_biggest_cash,
                            }}
                            onRefresh={async () => {
                                if (!profile.hendon_url) {
                                    setMessage('Please enter your Hendon Mob URL first');
                                    return;
                                }

                                setIsRefreshing(true);
                                setMessage('🔄 Checking for updated stats...');
                                try {
                                    const _syncToken = getAccessToken();

                                    // Step 1: Try reading from DB (Scrapling may have already synced)
                                    const dbRes = await fetch('/api/hendonmob/sync', {
                                        method: 'GET',
                                        headers: {
                                            ...(_syncToken ? { 'Authorization': `Bearer ${_syncToken}` } : {}),
                                        },
                                    });
                                    const dbData = await dbRes.json();

                                    if (dbRes.ok && dbData.success && (dbData.total_cashes != null || dbData.total_earnings != null)) {
                                        // DB has data — use it
                                        setProfile(prev => ({
                                            ...prev,
                                            hendon_total_cashes: dbData.total_cashes,
                                            hendon_total_earnings: dbData.total_earnings,
                                            hendon_biggest_cash: dbData.biggest_cash,
                                        }));
                                        busEmit.dataMutated('profile');
                                        // Dispatch profile-updated + cache invalidation for cross-tab sync
                                        if (typeof window !== 'undefined') {
                                            window.dispatchEvent(new CustomEvent('profile-updated', {
                                                detail: { hendon_total_cashes: dbData.total_cashes, hendon_total_earnings: dbData.total_earnings }
                                            }));
                                        }
                                        try {
                                            const cacheKey = `sp-profile-cache-${profile.username}`;
                                            localStorage.removeItem(cacheKey);
                                            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                                        } catch { /* noop */ }
                                        setMessage('✅ Stats refreshed successfully!');
                                        setIsRefreshing(false);
                                        return;
                                    }

                                    // Step 2: No data in DB yet (new user) — prompt manual entry
                                    setMessage('📋 No synced stats found. Opening your HendonMob page...');
                                    window.open(profile.hendon_url, '_blank');
                                    await new Promise(r => setTimeout(r, 800));

                                    const earningsInput = window.prompt(
                                        'Your HendonMob page is open in a new tab.\n\nEnter your Total Live Earnings from that page (numbers only, e.g. 900957):',
                                        ''
                                    );
                                    if (earningsInput === null) { setIsRefreshing(false); return; }

                                    const cashesInput = window.prompt(
                                        'Now enter your Total Cashes count:',
                                        ''
                                    );
                                    if (cashesInput === null) { setIsRefreshing(false); return; }

                                    const biggestInput = window.prompt(
                                        'Enter your Best Live Cash amount (numbers only, e.g. 252020):\n\n(Leave blank if unsure)',
                                        ''
                                    );

                                    const totalEarnings = parseFloat(String(earningsInput).replace(/[^0-9.]/g, '')) || null;
                                    const totalCashes = parseInt(String(cashesInput).replace(/[^0-9]/g, ''), 10) || null;
                                    const biggestCash = biggestInput ? parseFloat(String(biggestInput).replace(/[^0-9.]/g, '')) : null;

                                    if (!totalCashes && !totalEarnings) {
                                        setMessage('No valid stats entered. Please try again.');
                                        setIsRefreshing(false);
                                        return;
                                    }

                                    // Save to DB via POST
                                    const postRes = await fetch('/api/hendonmob/sync', {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            ...(_syncToken ? { 'Authorization': `Bearer ${_syncToken}` } : {}),
                                        },
                                        body: JSON.stringify({
                                            hendonUrl: profile.hendon_url,
                                            stats: { totalCashes, totalEarnings, biggestCash }
                                        })
                                    });
                                    const postData = await postRes.json();

                                    if (postRes.ok && postData.success) {
                                        setProfile(prev => ({
                                            ...prev,
                                            hendon_total_cashes: postData.total_cashes,
                                            hendon_total_earnings: postData.total_earnings,
                                            hendon_biggest_cash: postData.biggest_cash,
                                        }));
                                        busEmit.dataMutated('profile');
                                        // Dispatch profile-updated + cache invalidation for cross-tab sync
                                        if (typeof window !== 'undefined') {
                                            window.dispatchEvent(new CustomEvent('profile-updated', {
                                                detail: { hendon_total_cashes: postData.total_cashes, hendon_total_earnings: postData.total_earnings }
                                            }));
                                        }
                                        try {
                                            const cacheKey = `sp-profile-cache-${profile.username}`;
                                            localStorage.removeItem(cacheKey);
                                            broadcastSync('smarter_poker_cache_sync', { type: 'cache_sync', cacheKey, action: 'invalidate', ts: Date.now() });
                                        } catch { /* noop */ }
                                        setMessage('✅ Stats saved successfully! Your Poker Resume is now live.');
                                    } else {
                                        setMessage(`❌ ${postData.error || 'Could not save stats.'}`);
                                    }
                                } catch (e) {
                                    console.warn('Sync error:', e);
                                    setMessage('❌ Error syncing stats. Please try again.');
                                }
                                setIsRefreshing(false);
                            }}
                            isRefreshing={isRefreshing}
                        />
                    </CollapsibleSection>
    );
}
