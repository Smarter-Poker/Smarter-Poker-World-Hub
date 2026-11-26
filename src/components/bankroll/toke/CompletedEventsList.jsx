import React, { memo, useState } from 'react';
import { CalendarDays, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import shift from './ShiftConsole.module.css';
import controls from './TokeForm.module.css';

const money = value => (value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const date = value => new Date(value + 'T12:00:00').toLocaleDateString();

function CompletedEventsList({ completedGigs, isLoading, loadError, onRetry, onViewReport, onSaveEdit, onDeleteGig }) {
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    function edit(gig) {
        setForm({ venue_name: gig.venue_name || '', hourly_rate: gig.hourly_rate ?? '', notes: gig.notes || '' });
        setSaveError('');
        setEditing(gig.id);
    }
    async function save(event, gigId) {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setSaveError('');
        try {
            await onSaveEdit(gigId, form);
            setEditing(null);
        } catch (error) {
            setSaveError(error.message || 'Could not save this event.');
        } finally {
            setSaving(false);
        }
    }

    return <section className="sd-panel" aria-labelledby="toke-completed-heading">
        <div className={controls.eventHeading}>
            <span className={controls.seal} aria-hidden="true"><CalendarDays size={20} /></span>
            <h2 className="sd-section-title" id="toke-completed-heading">Completed Events</h2>
            {!isLoading && !loadError && completedGigs.length > 0 && <span>{completedGigs.length}</span>}
        </div>
        {isLoading ? <p className={shift.status} role="status">Loading Events…</p>
            : loadError ? <div role="alert"><p>{loadError}</p><button className="sd-button" onClick={onRetry}>Retry</button></div>
            : !completedGigs.length ? <p className={shift.status}>No Completed Events Yet.</p>
            : <ul className={shift.history}>{completedGigs.map(gig => <li key={gig.id}>
                {editing === gig.id ? <form className={controls.eventEdit} aria-label="Edit Completed Event" onSubmit={event => save(event, gig.id)}>
                    <h3>Edit Event</h3>
                    <div className={shift.form + ' ' + controls.fields}>
                        <div className={shift.pair}>
                            <label>Venue Name<input autoFocus required value={form.venue_name} onChange={e => setForm({ ...form, venue_name: e.target.value })} /></label>
                            <label>Hourly Rate ($)<input type="number" step="0.01" value={form.hourly_rate} onChange={e => setForm({ ...form, hourly_rate: e.target.value })} /></label>
                        </div>
                        <label>Notes<textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
                        {saveError && <p role="alert">{saveError}</p>}
                    </div>
                    <div className={controls.actions + ' ' + controls.editActions}>
                        <button type="button" className="sd-button" aria-label="Delete Event" disabled={saving} onClick={event => onDeleteGig(event, gig.id)}><Trash2 aria-hidden="true" size={16} /></button>
                        <button type="button" className="sd-button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
                        <button type="submit" className="sd-button sd-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                </form> : <div className={shift.historyRow}>
                    <button type="button" className={shift.historyOpen} onClick={() => onViewReport(gig.id)} aria-label={'View Report For ' + gig.venue_name}>
                        <span><strong>{gig.venue_name}</strong>
                            <small>{date(gig.start_date)}{gig.end_date && gig.end_date !== gig.start_date ? ' To ' + date(gig.end_date) : ''}</small>
                            <small>{gig.totalDowns || 0} Downs · {(gig.totalHoursWorked || 0).toFixed(1)}h</small></span>
                        <b>{money(gig.totalTokes)}</b><ChevronRight aria-hidden="true" size={15} />
                    </button>
                    <button type="button" className="sd-button" aria-label={'Edit ' + gig.venue_name} onClick={() => edit(gig)}><Pencil aria-hidden="true" size={16} /></button>
                </div>}
            </li>)}</ul>}
    </section>;
}
export default memo(CompletedEventsList);
