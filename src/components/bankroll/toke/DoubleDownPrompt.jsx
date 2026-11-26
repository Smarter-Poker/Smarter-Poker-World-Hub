import React, { memo } from 'react';
import { createPortal } from 'react-dom';
import { Timer } from 'lucide-react';
import useAccessibleDialog from '../../../hooks/useAccessibleDialog';
import shift from './ShiftConsole.module.css';
import TokeFormHeader from './TokeFormHeader';
import form from './TokeForm.module.css';

function DoubleDownPrompt({ show, promptDown, onYes, onNo }) {
    const open = show && Boolean(promptDown);
    const { dialogRef } = useAccessibleDialog({ open, dismissDisabled: true });
    if (!open) return null;
    const isBreak = promptDown.down_type === 'break';
    const isBrush = promptDown.down_type === 'brush';
    const activity = promptDown.game_type || (promptDown.down_type === 'cash' ? 'Cash Game' : 'Tournament');
    return createPortal(<div className={'smarterdesign ' + shift.overlay}>
        <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="toke-confirm-heading" className={'sd-panel ' + shift.dialog + ' ' + form.sheet}>
            <TokeFormHeader icon={Timer} id="toke-confirm-heading" title={isBreak ? 'Still On Break?' : isBrush ? 'Still Brushing?' : 'Same Table - Double Down?'} detail="35-Minute Check" />
            <div className={form.fields}><p>{isBreak ? 'Your Break Has Lasted 35 Minutes.' : isBrush ? 'Your Brush Down Has Lasted 35 Minutes.'
                : activity + (promptDown.table_number ? ' · Table ' + promptDown.table_number : '')}</p></div>
            <div className={form.actions}>
                <button type="button" onClick={onYes} className="sd-button sd-primary">Yes, Double Down</button>
                <button type="button" onClick={onNo} className="sd-button">No, New Down</button>
            </div>
        </section>
    </div>, document.body);
}
export default memo(DoubleDownPrompt);
