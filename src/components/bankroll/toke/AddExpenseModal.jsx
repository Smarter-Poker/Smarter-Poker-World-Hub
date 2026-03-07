/**
 * ADD EXPENSE MODAL
 * ═══════════════════════════════════════════════════════════════
 * Expense form with category, amount, description, and receipt scanner.
 * Extracted from TokeTracker.jsx for maintainability.
 * ═══════════════════════════════════════════════════════════════
 */

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Image as ImageIcon } from 'lucide-react';

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

function AddExpenseModal({
    show,
    expenseForm,
    setExpenseForm,
    onSubmit,
    onClose,
    showScanner,
    setShowScanner,
    ReceiptScannerComponent,
    userId,
    styles,
}) {
    if (!show) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={styles.modalOverlay}
                onClick={() => { onClose(); setShowScanner(false); }}
            >
                {showScanner ? (
                    <div style={{ width: '100%', maxWidth: 450 }} onClick={e => e.stopPropagation()}>
                        <ReceiptScannerComponent
                            userId={userId}
                            onScanComplete={({ imageUrl }) => {
                                setExpenseForm({ ...expenseForm, receipt_url: imageUrl });
                                setShowScanner(false);
                            }}
                        />
                        <button type="button" onClick={() => setShowScanner(false)} style={{ ...styles.formCancelBtn, width: '100%', marginTop: 12 }}>Cancel Scan</button>
                    </div>
                ) : (
                    <motion.form
                        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                        style={{ ...styles.promptCard, border: '2px solid rgba(239,68,68,0.4)' }}
                        onClick={e => e.stopPropagation()}
                        onSubmit={onSubmit}
                    >
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#E4E6EB', margin: '0 0 16px' }}>Add Expense</h3>

                        <label style={styles.formLabel}>Category</label>
                        <select
                            value={expenseForm.category}
                            onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                            style={styles.formSelect}
                        >
                            {EXPENSE_CATEGORIES.map(c => (
                                <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                        </select>

                        <label style={{ ...styles.formLabel, marginTop: 12 }}>Amount ($)</label>
                        <input
                            type="number"
                            value={expenseForm.amount}
                            onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                            style={styles.formInput}
                            step="0.01"
                            autoFocus
                        />

                        <label style={{ ...styles.formLabel, marginTop: 12 }}>Description (optional)</label>
                        <input
                            type="text"
                            value={expenseForm.description}
                            onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                            style={styles.formInput}
                        />

                        <div style={{ marginTop: 16 }}>
                            {expenseForm.receipt_url ? (
                                <div style={styles.attachedReceiptBox}>
                                    <ImageIcon size={16} color="#10b981" />
                                    <span style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>Receipt Attached</span>
                                    <button type="button" onClick={() => setExpenseForm({ ...expenseForm, receipt_url: null })} style={styles.removeReceiptBtn}>✕</button>
                                </div>
                            ) : (
                                <button type="button" onClick={() => setShowScanner(true)} style={styles.scanReceiptBtn}>
                                    <Camera size={16} /> Scan Receipt
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                            <button type="submit" style={{ ...styles.formSubmitBtn, background: '#ef4444', color: '#fff' }}>Add Expense</button>
                            <button type="button" onClick={onClose} style={styles.formCancelBtn}>Cancel</button>
                        </div>
                    </motion.form>
                )}
            </motion.div>
        </AnimatePresence>
    );
}

export default memo(AddExpenseModal);
