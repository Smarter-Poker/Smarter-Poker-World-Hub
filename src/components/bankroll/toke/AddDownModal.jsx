import React, { memo, useEffect, useRef } from 'react';
import view from './TokeWorkspace.module.css';

const types = [
    ['cash', 'Cash Game'], ['tournament', 'Tournament'], ['break', 'On Break'], ['brush', 'Brush'],
];

function AddDownModal({ show, downForm, setDownForm, onSubmit, onClose }) {
    const dialog = useRef(null);
    useEffect(() => {
        const element = dialog.current;
        if (!show || !element) return;
        const opener = document.activeElement;
        element.showModal();
        return () => {
            element.close();
            if (opener?.isConnected) opener.focus({ preventScroll: true });
        };
    }, [show]);

    if (!show) return null;
    const playing = downForm.down_type === 'cash' || downForm.down_type === 'tournament';
    return (
        <dialog ref={dialog} className={'sd-panel ' + view.dialog} aria-labelledby="toke-new-down-title"
            onCancel={event => { event.preventDefault(); onClose(); }}>
            <h2 className="sd-section-title" id="toke-new-down-title">Add Down</h2>
            <form onSubmit={event => { event.preventDefault(); onSubmit(); }}>
                <fieldset className={view.types}>
                    <legend>Down Type</legend>
                    <div className={view.chartChoices}>
                        {types.map(([value, label]) => (
                            <button key={value} type="button" className="sd-button"
                                aria-pressed={value === downForm.down_type}
                                onClick={() => setDownForm({ ...downForm, down_type: value })}>{label}</button>
                        ))}
                    </div>
                </fieldset>
                {downForm.down_type === 'cash' && (
                    <div className={view.formRow}>
                        <label>Game
                            <select value={downForm.cash_variant} onChange={e => setDownForm({ ...downForm, cash_variant: e.target.value })}>
                                <option value="Holdem">Holdem</option><option value="PLO">PLO</option><option value="Mixed">Mixed</option>
                            </select>
                        </label>
                        <label>Stakes
                            <select value={downForm.cash_stakes} onChange={e => setDownForm({ ...downForm, cash_stakes: e.target.value })}>
                                {['1/2', '1/3', '2/5', '5/10', '10/20', '25/50'].map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                        </label>
                    </div>
                )}
                {downForm.down_type === 'tournament' && <label>Tournament Name
                    <input value={downForm.tournament_name || ''} onChange={e => setDownForm({ ...downForm, tournament_name: e.target.value })} />
                </label>}
                {playing && <label>Table Number
                    <input value={downForm.table_number || ''} onChange={e => setDownForm({ ...downForm, table_number: e.target.value })} />
                </label>}
                <div className={view.formActions}>
                    <button className="sd-button" type="button" onClick={onClose}>Cancel</button>
                    <button className="sd-button sd-primary" type="submit">Start Down</button>
                </div>
            </form>
        </dialog>
    );
}

export default memo(AddDownModal);
