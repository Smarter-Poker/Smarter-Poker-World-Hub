/**
 * BANKROLL BADGES
 * Milestones earned from the player's own ledger, reached from the footer's
 * BADGES button. Read-only: every badge is computed from recorded rows.
 */

import { useCallback, useEffect, useState } from 'react';
import { Award, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fetchAllRows, SESSION_CATEGORIES } from '../../lib/bankroll/ledgerReport.mjs';
import { computeBadges } from '../../lib/bankroll/bankrollBadges.mjs';
import view from './BankrollBadges.module.css';

async function loadBadgeData(userId) {
    const entries = await fetchAllRows(() => supabase
        .from('bankroll_ledger')
        .select('id, category, net_result, gross_in, gross_out, entry_date, start_time, end_time, created_at')
        .eq('user_id', userId)
        .eq('is_revision', false)
        // in-list: bounded by the five built-in session categories
        .in('category', SESSION_CATEGORIES)
        .order('entry_date', { ascending: true })
        .order('id', { ascending: true }));
    const [trips, forms] = await Promise.all([
        supabase.from('bankroll_trips').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'completed'),
        supabase.from('w2g_forms').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    ]);
    if (trips.error) throw trips.error;
    if (forms.error) throw forms.error;
    return computeBadges(entries, { completedTrips: trips.count || 0, w2gForms: forms.count || 0 });
}

const progressText = (badge) => {
    if (badge.earned) return 'Earned';
    const value = badge.metric === 'hours' ? badge.value.toLocaleString('en-US', { maximumFractionDigits: 1 }) : badge.value;
    return value + ' Of ' + badge.target + (badge.metric === 'hours' ? ' Hours' : '');
};

export default function BankrollBadges({ userId }) {
    const [state, setState] = useState({ status: 'loading' });

    const load = useCallback(() => {
        if (!userId) return () => {};
        let live = true;
        setState({ status: 'loading' });
        loadBadgeData(userId)
            .then(result => { if (live) setState({ status: 'ready', result }); })
            .catch(error => {
                console.warn('[BankrollBadges] Load error:', error);
                if (live) setState({ status: 'error' });
            });
        return () => { live = false; };
    }, [userId]);

    useEffect(() => load(), [load]);

    if (!userId) return <p role="status">Sign In To See Your Badges</p>;
    if (state.status === 'loading') return <p role="status">Loading Your Badges…</p>;
    if (state.status === 'error') {
        return <p role="alert">Could Not Load Your Badges. <button type="button" className="sd-button" onClick={load}>Retry</button></p>;
    }

    const { badges, earned } = state.result;
    return (
        <section className={view.badges} aria-label="Bankroll Badges">
            <p className={view.summary}><span>Earned From Your Ledger</span><strong>{earned} Of {badges.length}</strong></p>
            <ul className={view.list}>
                {badges.map(badge => (
                    <li key={badge.key} className={view.badge + (badge.earned ? ' ' + view.earned : '')}>
                        <span className={view.icon} aria-hidden="true">{badge.earned ? <Award size={21} /> : <Lock size={17} />}</span>
                        <h3>{badge.title}</h3>
                        <p>{badge.description}</p>
                        <div>
                            <div className={view.meter} role="progressbar" aria-label={badge.title + ' Progress'}
                                aria-valuemin={0} aria-valuemax={badge.target} aria-valuenow={Math.min(badge.value, badge.target)}>
                                <span style={{ width: Math.round(badge.progress * 100) + '%' }} />
                            </div>
                            <span className={view.state}>{progressText(badge)}</span>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
