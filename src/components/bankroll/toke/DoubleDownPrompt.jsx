import React, { memo } from 'react';
import { createPortal } from 'react-dom';
import { Timer } from 'lucide-react';
import useAccessibleDialog from '../../../hooks/useAccessibleDialog';
import shift from './ShiftConsole.module.css';

function DoubleDownPrompt({ show, promptDown, onYes, onNo }) {
    const open = show && Boolean(promptDown);
    const { dialogRef } = useAccessibleDialog({ open, dismissDisabled: true });
    if (!open) return null;
    const isBreak = promptDown.down_type === 'break';
    const isBrush = promptDown.down_type === 'brush';
    const activity = promptDown.game_type || (promptDown.down_type === 'cash' ? 'Cash Game' : 'Tournament');
    return createPortal(<div className={'smarterdesign ' + shift.overlay}>
        <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="toke-confirm-heading" className={'sd-panel ' + shift.dialog}>
            <div className={shift.kicker}><Timer size={19} aria-hidden="true" />35-Minute Check</div>
            <h2 id="toke-confirm-heading" className={shift.dialogTitle}>{isBreak ? 'Still On Break?' : isBrush ? 'Still Brushing?' : 'Same Table - Double Down?'}</h2>
            <p className={shift.promptNote}>{isBreak ? 'Your break has lasted 35 minutes.' : isBrush ? 'Your brush down has lasted 35 minutes.'
                : activity + (promptDown.table_number ? ' · Table ' + promptDown.table_number : '')}</p>
            <div className={shift.actions}>
                <button type="button" onClick={onYes} className="sd-button sd-primary">Yes, Double Down</button>
                <button type="button" onClick={onNo} className="sd-button">No, New Down</button>
            </div>
        </section>
    </div>, document.body);
}
export default memo(DoubleDownPrompt);
