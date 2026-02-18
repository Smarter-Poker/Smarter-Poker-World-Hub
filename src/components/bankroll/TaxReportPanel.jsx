/**
 * TAX REPORT PANEL
 * Futuristic Metal UI - Generate IRS-ready reports with W2-G tracking
 * Includes W-2G Document Vault for uploading and managing W-2G forms
 */

import { useState, useEffect, useRef } from 'react';
import { FileText, Download, Calendar, AlertTriangle, Loader2, DollarSign, TrendingUp, TrendingDown, Upload, Trash2, Eye, Plus, X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { METAL, GRADIENTS, GLOWS, ANIMATIONS } from './metalStyles';

const W2G_TYPES = [
    { value: 'poker', label: 'Poker' },
    { value: 'slots', label: 'Slots' },
    { value: 'sports', label: 'Sports Bet' },
    { value: 'table_games', label: 'Table Games' },
    { value: 'other', label: 'Other' },
];

export default function TaxReportPanel({ userId }) {
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState(null);

    // W-2G Vault state
    const [w2gForms, setW2gForms] = useState([]);
    const [w2gLoading, setW2gLoading] = useState(false);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadMeta, setUploadMeta] = useState({ form_type: 'poker', source_description: '', amount: '' });
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

    // Fetch W-2G forms when year changes
    useEffect(() => {
        if (userId) fetchW2gForms();
    }, [userId, selectedYear]);

    const fetchW2gForms = async () => {
        setW2gLoading(true);
        try {
            const { data, error: fetchErr } = await supabase
                .from('w2g_forms')
                .select('*')
                .eq('user_id', userId)
                .eq('tax_year', selectedYear)
                .order('upload_date', { ascending: false });

            if (fetchErr) throw fetchErr;
            setW2gForms(data || []);
        } catch (err) {
            console.error('W-2G fetch error:', err);
        } finally {
            setW2gLoading(false);
        }
    };

    const handleFileSelect = (file) => {
        if (!file) return;
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!validTypes.includes(file.type)) {
            setError('Only images (JPG, PNG, WEBP) and PDFs are accepted');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setError('File too large (max 10MB)');
            return;
        }
        setUploadFile(file);
        setError(null);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    const handleUpload = async () => {
        if (!uploadFile || !userId) return;
        setUploading(true);
        setError(null);

        try {
            const fileExt = uploadFile.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const filePath = `w2g/${userId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('images')
                .upload(filePath, uploadFile);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('images')
                .getPublicUrl(filePath);

            // Save metadata to w2g_forms table
            const { error: insertError } = await supabase
                .from('w2g_forms')
                .insert({
                    user_id: userId,
                    tax_year: selectedYear,
                    form_type: uploadMeta.form_type,
                    source_description: uploadMeta.source_description || null,
                    amount: uploadMeta.amount ? parseFloat(uploadMeta.amount) : null,
                    file_url: publicUrl,
                    file_name: uploadFile.name,
                });

            if (insertError) throw insertError;

            // Reset form and refresh
            setUploadFile(null);
            setUploadMeta({ form_type: 'poker', source_description: '', amount: '' });
            setShowUploadForm(false);
            fetchW2gForms();
        } catch (err) {
            console.error('W-2G upload error:', err);
            setError('UPLOAD FAILED: ' + (err.message || 'Unknown error'));
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteW2g = async (formId, fileUrl) => {
        if (!confirm('Delete this W-2G form?')) return;
        try {
            // Delete from storage
            const pathMatch = fileUrl.match(/w2g\/[^?]+/);
            if (pathMatch) {
                await supabase.storage.from('images').remove([pathMatch[0]]);
            }

            // Delete from table
            const { error: delError } = await supabase
                .from('w2g_forms')
                .delete()
                .eq('id', formId);

            if (delError) throw delError;
            setW2gForms(prev => prev.filter(f => f.id !== formId));
        } catch (err) {
            console.error('Delete error:', err);
            setError('DELETE FAILED');
        }
    };

    const fetchPreview = async () => {
        setLoading(true);
        setError(null);
        setReport(null);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch(`/api/bankroll/tax-report?year=${selectedYear}&format=json`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch report');

            const data = await res.json();
            setReport(data);
        } catch (err) {
            console.error('Tax report error:', err);
            setError('FAILED TO GENERATE REPORT');
        } finally {
            setLoading(false);
        }
    };

    const downloadPDF = async () => {
        setDownloading(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch(`/api/bankroll/tax-report?year=${selectedYear}&format=pdf`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Download failed');

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `poker_tax_report_${selectedYear}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Download error:', err);
            setError('DOWNLOAD FAILED');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div style={styles.container}>
            {/* LED Strip */}
            <div style={styles.ledStrip} />

            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerTitle}>
                    <FileText size={16} style={{ color: METAL.cyan }} />
                    <span>TAX REPORT GENERATOR</span>
                </div>
                <span style={styles.headerHint}>IRS-ready Logs With W2-G Tracking</span>
            </div>

            {/* Year Selector */}
            <div style={styles.selectorRow}>
                <label style={styles.selectorLabel}>
                    <Calendar size={14} />
                    TAX YEAR
                </label>
                <div style={styles.yearBtnGroup}>
                    {years.map(year => (
                        <button
                            key={year}
                            onClick={() => setSelectedYear(year)}
                            style={{
                                ...styles.yearBtn,
                                ...(selectedYear === year ? styles.yearBtnActive : {}),
                            }}
                        >
                            {year}
                        </button>
                    ))}
                </div>
            </div>

            {/* ━━━ W-2G DOCUMENT VAULT ━━━ */}
            <div style={styles.vaultSection}>
                <div style={styles.vaultHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AlertTriangle size={14} style={{ color: METAL.warning }} />
                        <span>W-2G DOCUMENT VAULT</span>
                    </div>
                    <button
                        onClick={() => setShowUploadForm(!showUploadForm)}
                        style={styles.addFormBtn}
                    >
                        {showUploadForm ? <X size={14} /> : <Plus size={14} />}
                        {showUploadForm ? 'CANCEL' : 'UPLOAD W-2G'}
                    </button>
                </div>

                {/* Upload Form */}
                {showUploadForm && (
                    <div style={styles.uploadForm}>
                        {/* Drop Zone */}
                        <div
                            style={{
                                ...styles.dropZone,
                                ...(dragOver ? styles.dropZoneActive : {}),
                                ...(uploadFile ? styles.dropZoneHasFile : {}),
                            }}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,.pdf"
                                style={{ display: 'none' }}
                                onChange={(e) => handleFileSelect(e.target.files[0])}
                            />
                            {uploadFile ? (
                                <div style={{ textAlign: 'center' }}>
                                    <Check size={24} style={{ color: METAL.success, marginBottom: 4 }} />
                                    <div style={{ color: '#fff', fontSize: 13, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
                                        {uploadFile.name}
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: "'Rajdhani', sans-serif" }}>
                                        {(uploadFile.size / 1024).toFixed(0)}KB — Tap to change
                                    </div>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center' }}>
                                    <Upload size={24} style={{ color: METAL.warning, marginBottom: 4 }} />
                                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
                                        Drop W-2G form here or tap to browse
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: "'Rajdhani', sans-serif" }}>
                                        JPG, PNG, WEBP, PDF — Max 10MB
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Metadata Inputs */}
                        <div style={styles.metaRow}>
                            <div style={{ flex: 1 }}>
                                <label style={styles.metaLabel}>SOURCE TYPE</label>
                                <select
                                    value={uploadMeta.form_type}
                                    onChange={(e) => setUploadMeta(p => ({ ...p, form_type: e.target.value }))}
                                    style={styles.metaSelect}
                                >
                                    {W2G_TYPES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={styles.metaLabel}>AMOUNT ($)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={uploadMeta.amount}
                                    onChange={(e) => setUploadMeta(p => ({ ...p, amount: e.target.value }))}
                                    style={styles.metaInput}
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                            <label style={styles.metaLabel}>DESCRIPTION (optional)</label>
                            <input
                                type="text"
                                placeholder="e.g. Bellagio Main Event, DraftKings Super Bowl"
                                value={uploadMeta.source_description}
                                onChange={(e) => setUploadMeta(p => ({ ...p, source_description: e.target.value }))}
                                style={styles.metaInput}
                            />
                        </div>

                        {/* Upload Button */}
                        <button
                            onClick={handleUpload}
                            disabled={!uploadFile || uploading}
                            style={{
                                ...styles.uploadBtn,
                                opacity: (!uploadFile || uploading) ? 0.5 : 1,
                            }}
                        >
                            {uploading ? (
                                <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> UPLOADING...</>
                            ) : (
                                <><Upload size={14} /> SAVE W-2G FORM</>
                            )}
                        </button>
                    </div>
                )}

                {/* Uploaded Forms List */}
                {w2gLoading ? (
                    <div style={styles.vaultEmpty}>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', color: METAL.warning }} />
                    </div>
                ) : w2gForms.length === 0 ? (
                    <div style={styles.vaultEmpty}>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, fontFamily: "'Rajdhani', sans-serif" }}>
                            No W-2G forms uploaded for {selectedYear}
                        </span>
                    </div>
                ) : (
                    <div style={styles.formsList}>
                        {w2gForms.map(form => (
                            <div key={form.id} style={styles.formCard}>
                                <div style={styles.formCardLeft}>
                                    <div style={styles.formTypeBadge}>
                                        {W2G_TYPES.find(t => t.value === form.form_type)?.label || form.form_type}
                                    </div>
                                    <div style={styles.formCardMeta}>
                                        {form.source_description && (
                                            <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>
                                                {form.source_description}
                                            </span>
                                        )}
                                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                                            {form.file_name || 'W-2G Form'} • {new Date(form.upload_date || form.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <div style={styles.formCardRight}>
                                    {form.amount && (
                                        <span style={styles.formAmount}>
                                            ${parseFloat(form.amount).toLocaleString()}
                                        </span>
                                    )}
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            onClick={() => window.open(form.file_url, '_blank')}
                                            style={styles.formActionBtn}
                                            title="View"
                                        >
                                            <Eye size={14} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteW2g(form.id, form.file_url)}
                                            style={{ ...styles.formActionBtn, ...styles.formDeleteBtn }}
                                            title="Delete"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div style={styles.actionRow}>
                <button
                    onClick={fetchPreview}
                    disabled={loading}
                    style={styles.previewBtn}
                >
                    {loading ? (
                        <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> GENERATING...</>
                    ) : (
                        <><FileText size={14} /> PREVIEW REPORT</>
                    )}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div style={styles.errorBox}>
                    <AlertTriangle size={14} />
                    {error}
                </div>
            )}

            {/* Report Preview */}
            {report && (
                <div style={styles.reportContainer}>
                    {/* Summary Stats */}
                    <div style={styles.statsGrid}>
                        <div style={styles.statBox}>
                            <div style={styles.statIcon}>
                                <TrendingUp size={16} />
                            </div>
                            <span style={styles.statValue}>
                                ${(report.summary?.totalWinnings || 0).toLocaleString()}
                            </span>
                            <span style={styles.statLabel}>GROSS WINNINGS</span>
                        </div>
                        <div style={styles.statBox}>
                            <div style={{ ...styles.statIcon, background: 'rgba(239,68,68,0.15)', borderColor: METAL.danger }}>
                                <TrendingDown size={16} style={{ color: METAL.danger }} />
                            </div>
                            <span style={{ ...styles.statValue, color: METAL.danger }}>
                                ${(report.summary?.totalLosses || 0).toLocaleString()}
                            </span>
                            <span style={styles.statLabel}>GROSS LOSSES</span>
                        </div>
                        <div style={styles.statBox}>
                            <div style={{ ...styles.statIcon, background: 'rgba(168,85,247,0.15)', borderColor: METAL.purple }}>
                                <DollarSign size={16} style={{ color: METAL.purple }} />
                            </div>
                            <span style={{
                                ...styles.statValue,
                                color: (report.summary?.netGamblingResult || 0) >= 0 ? METAL.success : METAL.danger
                            }}>
                                ${(report.summary?.netGamblingResult || 0).toLocaleString()}
                            </span>
                            <span style={styles.statLabel}>NET RESULT</span>
                        </div>
                    </div>

                    {/* Session Breakdown */}
                    <div style={styles.breakdownSection}>
                        <div style={styles.sectionHeader}>BREAKDOWN</div>
                        <div style={styles.breakdownGrid}>
                            <div style={styles.breakdownCard}>
                                <span style={styles.breakdownLabel}>CASH GAMES</span>
                                <span style={{
                                    ...styles.breakdownValue,
                                    color: (report.breakdown?.cashGame?.net || 0) >= 0 ? METAL.success : METAL.danger
                                }}>
                                    ${(report.breakdown?.cashGame?.net || 0).toLocaleString()}
                                </span>
                            </div>
                            <div style={styles.breakdownCard}>
                                <span style={styles.breakdownLabel}>TOURNAMENTS</span>
                                <span style={{
                                    ...styles.breakdownValue,
                                    color: (report.breakdown?.tournament?.net || 0) >= 0 ? METAL.success : METAL.danger
                                }}>
                                    ${(report.breakdown?.tournament?.net || 0).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* W2-G Alerts (auto-detected) */}
                    {report.w2gEvents?.length > 0 && (
                        <div style={styles.w2gSection}>
                            <div style={styles.w2gHeader}>
                                <AlertTriangle size={14} style={{ color: METAL.warning }} />
                                W2-G REPORTABLE ({report.w2gEvents.length})
                            </div>
                            {report.w2gEvents.map((event, i) => (
                                <div key={i} style={styles.w2gRow}>
                                    <div>
                                        <span style={styles.w2gDate}>{event.date}</span>
                                        <span style={styles.w2gVenue}>{event.venue}</span>
                                    </div>
                                    <span style={styles.w2gAmount}>
                                        ${event.amount?.toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Uploaded W-2G Forms in Report */}
                    {w2gForms.length > 0 && (
                        <div style={{ ...styles.w2gSection, borderColor: METAL.cyan, background: 'rgba(35,116,225,0.08)' }}>
                            <div style={{ ...styles.w2gHeader, color: METAL.cyan, borderColor: METAL.cyan, background: 'rgba(35,116,225,0.1)' }}>
                                <FileText size={14} style={{ color: METAL.cyan }} />
                                UPLOADED W-2G FORMS ({w2gForms.length})
                            </div>
                            {w2gForms.map((form, i) => (
                                <div key={form.id} style={styles.w2gRow}>
                                    <div>
                                        <span style={styles.w2gDate}>
                                            {W2G_TYPES.find(t => t.value === form.form_type)?.label || form.form_type}
                                        </span>
                                        <span style={styles.w2gVenue}>
                                            {form.source_description || form.file_name}
                                        </span>
                                    </div>
                                    <span style={{ ...styles.w2gAmount, color: METAL.cyan }}>
                                        {form.amount ? `$${parseFloat(form.amount).toLocaleString()}` : '—'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Download Button */}
                    <button
                        onClick={downloadPDF}
                        disabled={downloading}
                        style={styles.downloadBtn}
                    >
                        {downloading ? (
                            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> GENERATING PDF...</>
                        ) : (
                            <><Download size={16} /> DOWNLOAD PDF</>
                        )}
                    </button>
                </div>
            )}

            <style jsx global>{ANIMATIONS}</style>
        </div>
    );
}

const styles = {
    container: {
        position: 'relative',
        background: GRADIENTS.darkPanel,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 12,
        overflow: 'hidden',
    },
    ledStrip: {
        position: 'absolute',
        top: 0,
        left: '10%',
        right: '10%',
        height: 2,
        background: METAL.cyan,
        boxShadow: GLOWS.cyanSubtle,
    },
    header: {
        padding: '16px 18px',
        borderBottom: `1px solid ${METAL.mid}`,
    },
    headerTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.15em',
        color: '#fff',
        marginBottom: 4,
    },
    headerHint: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        marginLeft: 24,
    },
    selectorRow: {
        padding: '16px 18px',
        borderBottom: `1px solid ${METAL.mid}`,
    },
    selectorLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.15em',
        marginBottom: 10,
    },
    yearBtnGroup: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
    },
    yearBtn: {
        padding: '8px 16px',
        background: GRADIENTS.metalButton,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.6)',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    yearBtnActive: {
        background: METAL.cyanDim,
        borderColor: METAL.cyan,
        color: METAL.cyan,
        boxShadow: GLOWS.cyanSubtle,
    },

    // ━━━ W-2G VAULT ━━━
    vaultSection: {
        margin: '0',
        borderBottom: `1px solid ${METAL.mid}`,
    },
    vaultHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 18px',
        background: 'rgba(245,158,11,0.06)',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        color: METAL.warning,
        letterSpacing: '0.12em',
    },
    addFormBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        background: 'rgba(245,158,11,0.15)',
        border: `1px solid ${METAL.warning}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        color: METAL.warning,
        letterSpacing: '0.05em',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    uploadForm: {
        padding: '14px 18px',
        background: 'rgba(0,0,0,0.2)',
        borderTop: `1px solid rgba(245,158,11,0.15)`,
    },
    dropZone: {
        padding: '24px 16px',
        border: '2px dashed rgba(245,158,11,0.3)',
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'all 0.2s',
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dropZoneActive: {
        borderColor: METAL.warning,
        background: 'rgba(245,158,11,0.08)',
    },
    dropZoneHasFile: {
        borderColor: METAL.success,
        borderStyle: 'solid',
        background: 'rgba(49,162,76,0.06)',
    },
    metaRow: {
        display: 'flex',
        gap: 10,
        marginBottom: 10,
    },
    metaLabel: {
        display: 'block',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.1em',
        marginBottom: 4,
    },
    metaSelect: {
        width: '100%',
        padding: '10px 12px',
        background: METAL.darkest,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 6,
        color: '#fff',
        fontSize: 13,
        fontFamily: "'Rajdhani', sans-serif",
        outline: 'none',
    },
    metaInput: {
        width: '100%',
        padding: '10px 12px',
        background: METAL.darkest,
        border: `1px solid ${METAL.mid}`,
        borderRadius: 6,
        color: '#fff',
        fontSize: 13,
        fontFamily: "'Rajdhani', sans-serif",
        outline: 'none',
        boxSizing: 'border-box',
    },
    uploadBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '12px',
        background: 'rgba(245,158,11,0.9)',
        border: 'none',
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color: '#000',
        letterSpacing: '0.08em',
        cursor: 'pointer',
    },
    vaultEmpty: {
        padding: '20px 18px',
        textAlign: 'center',
    },
    formsList: {
        padding: '8px 12px 12px',
    },
    formCard: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 8,
        marginBottom: 6,
    },
    formCardLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flex: 1,
        minWidth: 0,
    },
    formTypeBadge: {
        padding: '3px 8px',
        background: 'rgba(245,158,11,0.15)',
        border: `1px solid rgba(245,158,11,0.3)`,
        borderRadius: 4,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 700,
        color: METAL.warning,
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
    },
    formCardMeta: {
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        fontFamily: "'Rajdhani', sans-serif",
        minWidth: 0,
        overflow: 'hidden',
    },
    formCardRight: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
    },
    formAmount: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color: METAL.warning,
    },
    formActionBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 6,
        color: 'rgba(255,255,255,0.5)',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    formDeleteBtn: {
        color: METAL.danger,
        borderColor: 'rgba(240,40,73,0.3)',
    },

    // ━━━ EXISTING STYLES ━━━
    actionRow: {
        padding: '16px 18px',
    },
    previewBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '14px',
        background: GRADIENTS.cyanAction,
        border: 'none',
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color: '#000',
        letterSpacing: '0.1em',
        cursor: 'pointer',
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        margin: '0 18px 16px',
        padding: '14px',
        background: 'rgba(239,68,68,0.1)',
        border: `1px solid ${METAL.danger}`,
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        fontWeight: 600,
        color: METAL.danger,
        letterSpacing: '0.1em',
    },
    reportContainer: {
        padding: '0 18px 18px',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        marginBottom: 16,
    },
    statBox: {
        padding: 14,
        background: 'rgba(0,0,0,0.3)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 10,
        textAlign: 'center',
    },
    statIcon: {
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 8px',
        background: METAL.cyanDim,
        border: `1px solid ${METAL.cyan}`,
        borderRadius: '50%',
        color: METAL.cyan,
    },
    statValue: {
        display: 'block',
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 16,
        fontWeight: 700,
        color: METAL.cyan,
        textShadow: `0 0 10px ${METAL.cyanGlow}`,
    },
    statLabel: {
        display: 'block',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 9,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: '0.1em',
        marginTop: 4,
    },
    breakdownSection: {
        marginBottom: 16,
    },
    sectionHeader: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 700,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.15em',
        marginBottom: 10,
    },
    breakdownGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
    },
    breakdownCard: {
        padding: 14,
        background: 'rgba(0,0,0,0.2)',
        border: `1px solid ${METAL.mid}`,
        borderRadius: 8,
        textAlign: 'center',
    },
    breakdownLabel: {
        display: 'block',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.5)',
        letterSpacing: '0.1em',
        marginBottom: 4,
    },
    breakdownValue: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 18,
        fontWeight: 700,
    },
    w2gSection: {
        background: 'rgba(245,158,11,0.08)',
        border: `1px solid ${METAL.warning}`,
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 16,
    },
    w2gHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 14px',
        background: 'rgba(245,158,11,0.1)',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        fontWeight: 700,
        color: METAL.warning,
        letterSpacing: '0.1em',
        borderBottom: `1px solid ${METAL.warning}`,
    },
    w2gRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: `1px solid rgba(245,158,11,0.2)`,
    },
    w2gDate: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 12,
        fontWeight: 600,
        color: '#fff',
        marginRight: 8,
    },
    w2gVenue: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)',
    },
    w2gAmount: {
        fontFamily: "'Orbitron', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: METAL.warning,
    },
    downloadBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        padding: '16px',
        background: GRADIENTS.purplePro,
        border: 'none',
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '0.1em',
        cursor: 'pointer',
        boxShadow: `0 4px 20px ${METAL.purpleGlow}`,
    },
};
