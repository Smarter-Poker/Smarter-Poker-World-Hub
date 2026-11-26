import React, { memo } from 'react';
import { createPortal } from 'react-dom';
import useAccessibleDialog from '../../../hooks/useAccessibleDialog';
import { Camera, FileCheck, Receipt, X } from 'lucide-react';
import shift from './ShiftConsole.module.css';
import TokeFormHeader from './TokeFormHeader';
import form from './TokeForm.module.css';

const EXPENSE_CATEGORIES = [
    { id: 'food', label: 'Food & Beverage' },
    { id: 'ride_share', label: 'Ride Share' },
    { id: 'gas', label: 'Gas' },
    { id: 'air_fare', label: 'Air Fare' },
    { id: 'lodging', label: 'Lodging / Hotel' },
    { id: 'supplies', label: 'Supplies' },
    { id: 'other', label: 'Other' },
    { id: 'tip_out', label: 'Tip Out' },
];

function AddExpenseModal({ show, expenseForm, setExpenseForm, onSubmit, onClose, showScanner, setShowScanner, ReceiptScannerComponent, userId }) {
    const { dialogRef, initialFocusRef } = useAccessibleDialog({ open: show && !showScanner, onClose });
    if (!show) return null;
    return createPortal(<div className={'smarterdesign ' + shift.overlay} onClick={event => {
        if (event.currentTarget === event.target) { onClose(); setShowScanner(false); }
    }}>
        {showScanner ? <div className={shift.scanner}>
            <ReceiptScannerComponent userId={userId} onScanComplete={({ imageUrl }) => {
                setExpenseForm({ ...expenseForm, receipt_url: imageUrl });
                setShowScanner(false);
            }} />
            <button type="button" onClick={() => setShowScanner(false)} className="sd-button">Cancel Scan</button>
        </div> : <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="toke-expense-heading" className={'sd-panel ' + shift.dialog + ' ' + form.sheet}>
            <TokeFormHeader icon={Receipt} title="Add Expense" id="toke-expense-heading" onClose={onClose} closeLabel="Close Add Expense" />
            <form onSubmit={onSubmit}>
                <div className={form.fields + ' ' + shift.form}>
                    <label>Amount ($)<input type="number" ref={initialFocusRef} value={expenseForm.amount} step="0.01"
                        onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} /></label>
                    <label>Category<select value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                        {EXPENSE_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select></label>
                    <label>Description (Optional)<input value={expenseForm.description}
                        onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} /></label>
                    {expenseForm.receipt_url ? <div className={shift.state}><FileCheck size={18} aria-hidden="true" />Receipt Attached
                        <button type="button" className="sd-button" aria-label="Remove Receipt" onClick={() => setExpenseForm({ ...expenseForm, receipt_url: null })}><X size={16} /></button>
                    </div> : <button type="button" onClick={() => setShowScanner(true)} className={'sd-button ' + shift.scanButton}><Camera size={17} aria-hidden="true" /> Scan Receipt</button>}
                </div>
                <div className={form.actions}>
                    <button type="button" className="sd-button" onClick={onClose}>Cancel</button>
                    <button type="submit" className="sd-button sd-primary">Add Expense</button>
                </div>
            </form>
        </section>}
    </div>, document.body);
}
export default memo(AddExpenseModal);
