import { useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Target } from 'lucide-react';
import desk from './DealerAnalytics.module.css';
import { monthTokes } from '../../../lib/bankroll/tokeReport.mjs';
import { formatCurrency } from '../../../lib/bankroll/currencyUtils';

const legacyKey = 'toke_monthly_goal';

export default function MonthlyIncomeGoal({ userId, completedGigs = [], activeGig = null, displayEUR = false }) {
    const money = { format: (value) => formatCurrency(value, displayEUR, { cents: true }) };
    const key = legacyKey + ':' + userId;
    const [goal, setGoal] = useState(0);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [hasPrevious, setHasPrevious] = useState(false);
    const [importing, setImporting] = useState(false);
    const [feedback, setFeedback] = useState('');
    const trigger = useRef(null);
    const input = useRef(null);

    useEffect(() => {
        if (!userId) return;
        try {
            const saved = localStorage.getItem(key);
            const amount = Number(saved);
            setGoal(Number.isFinite(amount) && amount > 0 ? amount : 0);
            setHasPrevious(saved === null && Number(localStorage.getItem(legacyKey)) > 0);
        } catch {
            setFeedback('This Browser Cannot Store A Goal.');
        }
    }, [key, userId]);

    useEffect(() => { if (editing) input.current?.focus(); }, [editing]);

    const now = new Date();
    // Tokes count in the month each down was dealt, including the event still
    // in progress (an event that started last month no longer hides this
    // month's tokes, and today's tokes count before the event is completed).
    const earned = monthTokes(activeGig ? [...completedGigs, activeGig] : completedGigs, userId, now);
    const percent = goal > 0 ? Math.min(100, 100 * earned / goal) : 0;
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();

    function finish(message) {
        setEditing(false);
        setImporting(false);
        setFeedback(message);
        requestAnimationFrame(() => trigger.current?.focus());
    }

    function save(event) {
        event.preventDefault();
        const amount = Number(draft);
        if (draft.trim() === '' || !Number.isFinite(amount) || amount < 0) return;
        try {
            localStorage.setItem(key, String(amount));
        } catch {
            setFeedback('Your Goal Could Not Be Saved On This Device.');
            return;
        }
        if (importing) {
            // The owner-specific save is already durable if the browser prevents cleanup.
            try { localStorage.removeItem(legacyKey); } catch { /* Keep the saved goal. */ }
        }
        setHasPrevious(false);
        setGoal(amount);
        finish(amount > 0 ? 'Goal Saved.' : 'Goal Cleared.');
    }

    function importPrevious() {
        try {
            const previous = Number(localStorage.getItem(legacyKey));
            if (previous > 0 && Number.isFinite(previous)) {
                setDraft(String(previous));
                setImporting(true);
                input.current?.focus();
            } else setHasPrevious(false);
        } catch { setFeedback('Your Previous Device Goal Is Unavailable.'); }
    }

    return <section aria-label="Monthly Income Goal" className={'sd-panel ' + desk.goal}>
        <header className={desk.goalHead}>
            <div className={desk.goalTitle}>
                <span className={desk.icon}><Target size={22} aria-hidden="true" /></span>
                <h2><small>{now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</small>Monthly Income Goal</h2>
            </div>
            {userId && !editing &&
                <button type="button" className={'sd-button ' + (!goal ? 'sd-primary' : '')} ref={trigger}
                    aria-label={goal > 0 ? 'Edit Monthly Income Goal' : 'Set Monthly Income Goal'}
                    onClick={() => { setDraft(goal > 0 ? String(goal) : ''); setFeedback(''); setEditing(true); }}>
                    {goal > 0 ? <Pencil size={16} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
                    {goal > 0 ? 'Edit Goal' : 'Set Goal'}
                </button>}
        </header>
        {!userId ? <p className={desk.status}>Sign In To Set Your Monthly Goal.</p> : editing ? (
            <form onSubmit={save} className={desk.goalEditor} onKeyDown={e => {
                if (e.key === 'Escape') { e.preventDefault(); finish(''); }
            }}>
                <label>Monthly Target ($)
                    <input ref={input} type="number" min="0" step="0.01" inputMode="decimal"
                        value={draft} required onChange={e => setDraft(e.target.value)} />
                </label>
                <button type="submit" className="sd-button sd-primary">Save Goal</button>
                <button type="button" className="sd-button" onClick={() => finish('')}>Cancel</button>
                {hasPrevious && <button type="button" className="sd-button" onClick={importPrevious}>Use Previous Device Goal</button>}
            </form>
        ) : goal > 0 && (
            <div className={desk.goalProgress}>
                <div className={desk.goalReading}><strong>{money.format(earned)}</strong><span>Of {money.format(goal)} Earned</span></div>
                <progress aria-label="Monthly Income Goal Progress" value={percent} max="100" />
                <div className={desk.goalMeta}><span>{Math.round(percent)}%</span><span>{daysLeft} {daysLeft === 1 ? 'Day' : 'Days'} Left</span></div>
            </div>
        )}
        <div role="status" className={feedback ? desk.goalFeedback : undefined}>{feedback}</div>
    </section>;
}
