/**
 * ADD DOWN MODAL
 * ═══════════════════════════════════════════════════════════════
 * Image-mapped modal for adding a new down (Cash / Tournament / Break / Brush).
 * Extracted from TokeTracker.jsx for maintainability.
 * ═══════════════════════════════════════════════════════════════
 */

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function AddDownModal({ show, downForm, setDownForm, onSubmit, onClose, styles }) {
    if (!show) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={styles.modalOverlay}
            >
                <motion.div
                    id="toke-pure-modal"
                    className="toke-modal-card"
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    style={styles.modalCard}
                >
                    <style>{`
                        #toke-pure-modal.toke-modal-card {
                            border: none !important;
                            box-shadow: none !important;
                            background-color: transparent !important;
                        }
                        #toke-pure-modal button.toke-img-map-element,
                        #toke-pure-modal input.toke-img-map-element,
                        #toke-pure-modal select.toke-img-map-element {
                            border: none !important;
                            outline: none !important;
                            box-shadow: none !important;
                            background-color: transparent !important;
                            -webkit-tap-highlight-color: transparent !important;
                            -webkit-appearance: none !important;
                            appearance: none !important;
                        }
                        #toke-pure-modal button.toke-img-map-element:focus,
                        #toke-pure-modal button.toke-img-map-element:hover,
                        #toke-pure-modal button.toke-img-map-element:active {
                            border: none !important;
                            outline: none !important;
                            box-shadow: none !important;
                            background-color: transparent !important;
                        }
                        #toke-pure-modal select.toke-img-map-element option {
                            background-color: #1a1a1a !important;
                            color: #fff !important;
                        }
                    `}</style>

                    {/* Down Type Selection Zones */}
                    <button
                        className="toke-img-map-element"
                        onClick={() => setDownForm({ ...downForm, down_type: 'cash' })}
                        style={{ ...styles.imgMapBtn, top: '12.5%', left: '8%', width: '41%', height: '16.5%' }}
                        title="Cash Game"
                    />
                    <button
                        className="toke-img-map-element"
                        onClick={() => setDownForm({ ...downForm, down_type: 'tournament' })}
                        style={{ ...styles.imgMapBtn, top: '12.5%', left: '51%', width: '41%', height: '16.5%' }}
                        title="Tournament"
                    />
                    <button
                        className="toke-img-map-element"
                        onClick={() => setDownForm({ ...downForm, down_type: 'break' })}
                        style={{ ...styles.imgMapBtn, top: '31%', left: '8%', width: '41%', height: '16.5%' }}
                        title="On Break"
                    />
                    <button
                        className="toke-img-map-element"
                        onClick={() => setDownForm({ ...downForm, down_type: 'brush' })}
                        style={{ ...styles.imgMapBtn, top: '31%', left: '51%', width: '41%', height: '16.5%' }}
                        title="Brush"
                    />

                    {/* Game Type Input Zone */}
                    {(downForm.down_type === 'cash' || downForm.down_type === 'tournament') && (
                        <div style={{ position: 'absolute', top: '52%', left: '5%', width: '90%', height: '10%', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {downForm.down_type === 'cash' ? (
                                <>
                                    <select
                                        className="toke-img-map-element"
                                        value={downForm.cash_variant}
                                        onChange={e => setDownForm({ ...downForm, cash_variant: e.target.value })}
                                        style={{ ...styles.imgMapInput, flex: 1, textAlign: 'center', paddingLeft: 4 }}
                                    >
                                        <option value="Holdem">Holdem</option>
                                        <option value="PLO">PLO</option>
                                        <option value="Mixed">Mixed</option>
                                    </select>
                                    <select
                                        className="toke-img-map-element"
                                        value={downForm.cash_stakes}
                                        onChange={e => setDownForm({ ...downForm, cash_stakes: e.target.value })}
                                        style={{ ...styles.imgMapInput, flex: 1, textAlign: 'center', paddingLeft: 4 }}
                                    >
                                        <option value="1/2">1/2</option>
                                        <option value="1/3">1/3</option>
                                        <option value="2/5">2/5</option>
                                        <option value="5/10">5/10</option>
                                        <option value="10/20">10/20</option>
                                        <option value="25/50">25/50</option>
                                    </select>
                                </>
                            ) : (
                                <input
                                    type="text"
                                    className="toke-img-map-element"
                                    value={downForm.tournament_name || ''}
                                    onChange={e => setDownForm({ ...downForm, tournament_name: e.target.value })}
                                    placeholder="Game Type"
                                    style={{ ...styles.imgMapInput, flex: 1, textAlign: 'center', paddingLeft: 4 }}
                                />
                            )}
                        </div>
                    )}

                    {/* Table Number Input Zone */}
                    {(downForm.down_type === 'cash' || downForm.down_type === 'tournament') && (
                        <div style={{ position: 'absolute', top: '67%', left: '5%', width: '90%', height: '10%', display: 'flex', alignItems: 'center' }}>
                            <input
                                type="text"
                                className="toke-img-map-element"
                                value={downForm.table_number || ''}
                                onChange={e => setDownForm({ ...downForm, table_number: e.target.value })}
                                placeholder="Table #"
                                style={{ ...styles.imgMapInput, textAlign: 'center', paddingLeft: 4 }}
                            />
                        </div>
                    )}

                    {/* Action Buttons */}
                    <button
                        className="toke-img-map-element"
                        onClick={onSubmit}
                        style={{ ...styles.imgMapBtn, top: '82.5%', left: '9%', width: '56.5%', height: '9%' }}
                        title="Start Down"
                    />
                    <button
                        className="toke-img-map-element"
                        onClick={onClose}
                        style={{ ...styles.imgMapBtn, top: '82.5%', left: '68.5%', width: '22.5%', height: '9%' }}
                        title="Cancel"
                    />
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default memo(AddDownModal);
