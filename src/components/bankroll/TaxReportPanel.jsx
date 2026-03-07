/**
 * TAX REPORT PANEL
 * Facebook Dark UI - Generate IRS-ready reports with W2-G tracking
 * Includes W-2G Document Vault for uploading and managing W-2G forms
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Download, Calendar, AlertTriangle, Loader2, DollarSign, TrendingUp, TrendingDown, Upload, Trash2, Eye, Plus, X, Check, Camera, Scan, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { METAL, GRADIENTS, GLOWS, ANIMATIONS } from './metalStyles';
import DocumentCropper from './DocumentCropper';
import LiveCameraScanner from './LiveCameraScanner';

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
    const [showLiveCamera, setShowLiveCamera] = useState(false);
    const [showCropper, setShowCropper] = useState(false);
    const [rawImage, setRawImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
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

    const handleFileSelect = useCallback((file) => {
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
        setError(null);

        // For images, open the DocumentCropper for edge detection + perspective warp
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setRawImage(ev.target.result);
                setShowCropper(true);
            };
            reader.readAsDataURL(file);
        } else {
            // PDFs go straight through — no cropping needed
            setUploadFile(file);
        }
    }, []);

    // Handle cropped image from DocumentCropper
    const handleCropConfirm = useCallback(async (croppedBase64) => {
        setShowCropper(false);
        setRawImage(null);
        setImagePreview(croppedBase64);
        const res = await fetch(croppedBase64);
        const blob = await res.blob();
        const file = new File([blob], 'w2g-cropped.jpg', { type: 'image/jpeg' });
        setUploadFile(file);
    }, []);

    // Skip cropper — use original image
    const handleCropSkip = useCallback(async () => {
        setShowCropper(false);
        if (rawImage) {
            setImagePreview(rawImage);
            const res = await fetch(rawImage);
            const blob = await res.blob();
            const file = new File([blob], 'w2g-original.jpg', { type: 'image/jpeg' });
            setUploadFile(file);
        }
        setRawImage(null);
    }, [rawImage]);

    // Handle live camera capture — already cropped by OpenCV scanner
    const handleLiveCapture = useCallback(async (capturedBase64) => {
        setShowLiveCamera(false);
        setImagePreview(capturedBase64);
        const res = await fetch(capturedBase64);
        const blob = await res.blob();
        const file = new File([blob], 'w2g-scanned.jpg', { type: 'image/jpeg' });
        setUploadFile(file);
    }, []);

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

            setUploadFile(null);
            setImagePreview(null);
            setShowLiveCamera(false);
            setRawImage(null);
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
            const pathMatch = fileUrl.match(/w2g\/[^?]+/);
            if (pathMatch) {
                await supabase.storage.from('images').remove([pathMatch[0]]);
            }

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
            const session = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
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
            const session = { access_token: JSON.parse(localStorage.getItem('smarter-poker-auth') || '{}').access_token };
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
            {/* Top accent */}
            <div style={styles.topAccent} />

            {/* Header */}
            <div style={styles.header}>
                <div style={styles.headerTitle}>
                    <FileText size={20} style={{ color: METAL.primary }} />
                    <span>TAX REPORT GENERATOR</span>
                </div>
                <span style={styles.headerHint}>IRS-Ready Logs With W-2G Tracking</span>
            </div>

            {/* Year Selector */}
            <div style={styles.selectorRow}>
                <label style={styles.selectorLabel}>
                    <Calendar size={16} />
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileText size={18} style={{ color: METAL.primary }} />
                        <span>W-2G DOCUMENT VAULT</span>
                    </div>
                    <button
                        onClick={() => setShowUploadForm(!showUploadForm)}
                        style={styles.addFormBtn}
                    >
                        {showUploadForm ? <X size={16} /> : <Plus size={16} />}
                        {showUploadForm ? 'CANCEL' : 'UPLOAD W-2G'}
                    </button>
                </div>

                {/* Upload Form */}
                {showUploadForm && (
                    <div style={styles.uploadForm}>
                        {/* Live Camera Scanner */}
                        {showLiveCamera && !uploadFile && (
                            <LiveCameraScanner
                                onCapture={handleLiveCapture}
                                onClose={() => setShowLiveCamera(false)}
                            />
                        )}

                        {/* File/Camera Selection Area — only when no file selected and camera not active */}
                        {!showLiveCamera && !uploadFile && (
                            <div style={styles.w2gCaptureArea}>
                                {/* Camera Scan Button */}
                                <div
                                    style={styles.w2gCameraBtn}
                                    onClick={() => setShowLiveCamera(true)}
                                >
                                    <div style={styles.w2gCameraIcon}>
                                        <Camera size={32} />
                                    </div>
                                    <p style={styles.w2gCameraText}>TAP TO SCAN W-2G</p>
                                    <p style={styles.w2gCameraHint}>Auto-Detects And Isolates Document</p>
                                </div>

                                {/* Divider */}
                                <div style={styles.w2gDivider}>
                                    <span style={styles.w2gDividerLine} />
                                    <span style={styles.w2gDividerText}>Or</span>
                                    <span style={styles.w2gDividerLine} />
                                </div>

                                {/* File Upload Drop Zone */}
                                <div
                                    style={{
                                        ...styles.dropZone,
                                        ...(dragOver ? styles.dropZoneActive : {}),
                                        padding: '20px',
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
                                    <div style={{ textAlign: 'center' }}>
                                        <Upload size={22} style={{ color: METAL.textSecondary, marginBottom: 4 }} />
                                        <div style={{ color: METAL.textSecondary, fontSize: 15, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
                                            Upload from gallery or drop file
                                        </div>
                                        <div style={{ color: METAL.textMuted, fontSize: 13, fontFamily: "'Rajdhani', sans-serif" }}>
                                            JPG, PNG, WEBP, PDF — Max 10MB
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* File Selected Preview */}
                        {uploadFile && (
                            <div style={styles.w2gFilePreview}>
                                {imagePreview ? (
                                    <img src={imagePreview} alt="W-2G Preview" style={styles.w2gPreviewImage} />
                                ) : (
                                    <div style={styles.w2gFileInfo}>
                                        <Check size={28} style={{ color: METAL.success, marginBottom: 6 }} />
                                        <div style={{ color: '#fff', fontSize: 16, fontFamily: "'Rajdhani', sans-serif", fontWeight: 600 }}>
                                            {uploadFile.name}
                                        </div>
                                    </div>
                                )}
                                <button
                                    onClick={() => { setUploadFile(null); setImagePreview(null); }}
                                    style={styles.w2gChangeBtn}
                                >
                                    <RefreshCw size={12} />
                                    CHANGE
                                </button>
                            </div>
                        )}

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

                        <div style={{ marginBottom: 14 }}>
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
                                <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> UPLOADING...</>
                            ) : (
                                <><Upload size={18} /> SAVE W-2G FORM</>
                            )}
                        </button>
                    </div>
                )}

                {/* Uploaded Forms List */}
                {w2gLoading ? (
                    <div style={styles.vaultEmpty}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: METAL.primary }} />
                    </div>
                ) : w2gForms.length === 0 ? (
                    <div style={styles.vaultEmpty}>
                        <span style={{ color: METAL.textMuted, fontSize: 15, fontFamily: "'Rajdhani', sans-serif", fontWeight: 500 }}>
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
                                            <span style={{ color: METAL.textPrimary, fontSize: 15, fontWeight: 600 }}>
                                                {form.source_description}
                                            </span>
                                        )}
                                        <span style={{ color: METAL.textSecondary, fontSize: 14 }}>
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
                                            <Eye size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteW2g(form.id, form.file_url)}
                                            style={{ ...styles.formActionBtn, ...styles.formDeleteBtn }}
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
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
                        <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> GENERATING...</>
                    ) : (
                        <><FileText size={18} /> PREVIEW REPORT</>
                    )}
                </button>
            </div>

            {/* Error */}
            {error && (
                <div style={styles.errorBox}>
                    <AlertTriangle size={18} />
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
                                <TrendingUp size={20} />
                            </div>
                            <span style={styles.statValue}>
                                ${(report.summary?.totalWinnings || 0).toLocaleString()}
                            </span>
                            <span style={styles.statLabel}>GROSS WINNINGS</span>
                        </div>
                        <div style={styles.statBox}>
                            <div style={{ ...styles.statIcon, background: 'rgba(240,40,73,0.15)', borderColor: METAL.danger }}>
                                <TrendingDown size={20} style={{ color: METAL.danger }} />
                            </div>
                            <span style={{ ...styles.statValue, color: METAL.danger }}>
                                ${(report.summary?.totalLosses || 0).toLocaleString()}
                            </span>
                            <span style={styles.statLabel}>GROSS LOSSES</span>
                        </div>
                        <div style={styles.statBox}>
                            <div style={{ ...styles.statIcon, background: 'rgba(155,89,182,0.15)', borderColor: METAL.purple }}>
                                <DollarSign size={20} style={{ color: METAL.purple }} />
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
                            <div style={styles.w2gSectionHeader}>
                                <AlertTriangle size={18} style={{ color: METAL.primary }} />
                                W-2G REPORTABLE ({report.w2gEvents.length})
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
                        <div style={styles.w2gSection}>
                            <div style={styles.w2gSectionHeader}>
                                <FileText size={18} style={{ color: METAL.primary }} />
                                UPLOADED W-2G FORMS ({w2gForms.length})
                            </div>
                            {w2gForms.map((form) => (
                                <div key={form.id} style={styles.w2gRow}>
                                    <div>
                                        <span style={styles.w2gDate}>
                                            {W2G_TYPES.find(t => t.value === form.form_type)?.label || form.form_type}
                                        </span>
                                        <span style={styles.w2gVenue}>
                                            {form.source_description || form.file_name}
                                        </span>
                                    </div>
                                    <span style={styles.w2gAmount}>
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
                            <><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> GENERATING PDF...</>
                        ) : (
                            <><Download size={20} /> DOWNLOAD PDF</>
                        )}
                    </button>
                </div>
            )}

            <style jsx global>{ANIMATIONS}</style>

            {/* Document Cropper Overlay — for gallery image uploads */}
            {showCropper && rawImage && (
                <DocumentCropper
                    imageSrc={rawImage}
                    onConfirm={handleCropConfirm}
                    onCancel={handleCropSkip}
                />
            )}
        </div>
    );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   FACEBOOK DARK STYLES — Large fonts, defined borders
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const styles = {
    container: {
        position: 'relative',
        background: METAL.base,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 12,
        overflow: 'hidden',
    },
    topAccent: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: METAL.primary,
    },
    header: {
        padding: '20px 20px 16px',
        borderBottom: `2px solid ${METAL.highlight}`,
    },
    headerTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: METAL.textPrimary,
        marginBottom: 4,
    },
    headerHint: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: METAL.textSecondary,
        marginLeft: 30,
    },

    // Year Selector
    selectorRow: {
        padding: '18px 20px',
        borderBottom: `2px solid ${METAL.highlight}`,
    },
    selectorLabel: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: METAL.textSecondary,
        letterSpacing: '0.1em',
        marginBottom: 12,
    },
    yearBtnGroup: {
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
    },
    yearBtn: {
        padding: '10px 20px',
        background: METAL.mid,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 16,
        fontWeight: 700,
        color: METAL.textSecondary,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    yearBtnActive: {
        background: METAL.primaryDim,
        borderColor: METAL.primary,
        color: METAL.primary,
    },

    // ━━━ W-2G VAULT ━━━
    vaultSection: {
        borderBottom: `2px solid ${METAL.highlight}`,
    },
    vaultHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        background: METAL.mid,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 16,
        fontWeight: 700,
        color: METAL.textPrimary,
        letterSpacing: '0.08em',
        borderBottom: `2px solid ${METAL.highlight}`,
    },
    addFormBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 18px',
        background: METAL.primaryDim,
        border: `2px solid ${METAL.primary}`,
        borderRadius: 8,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: METAL.primary,
        letterSpacing: '0.05em',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    uploadForm: {
        padding: '18px 20px',
        background: 'rgba(0,0,0,0.15)',
        borderBottom: `1px solid ${METAL.highlight}`,
    },
    dropZone: {
        padding: '32px 20px',
        border: `2px dashed ${METAL.highlight}`,
        borderRadius: 12,
        cursor: 'pointer',
        transition: 'all 0.2s',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dropZoneActive: {
        borderColor: METAL.primary,
        background: METAL.primaryDim,
    },
    dropZoneHasFile: {
        borderColor: METAL.success,
        borderStyle: 'solid',
        background: 'rgba(49,162,76,0.06)',
    },
    metaRow: {
        display: 'flex',
        gap: 12,
        marginBottom: 12,
    },
    metaLabel: {
        display: 'block',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: METAL.textSecondary,
        letterSpacing: '0.08em',
        marginBottom: 6,
    },
    metaSelect: {
        width: '100%',
        padding: '12px 14px',
        background: METAL.darkest,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 8,
        color: METAL.textPrimary,
        fontSize: 16,
        fontFamily: "'Rajdhani', sans-serif",
        fontWeight: 600,
        outline: 'none',
    },
    metaInput: {
        width: '100%',
        padding: '12px 14px',
        background: METAL.darkest,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 8,
        color: METAL.textPrimary,
        fontSize: 16,
        fontFamily: "'Rajdhani', sans-serif",
        fontWeight: 600,
        outline: 'none',
        boxSizing: 'border-box',
    },
    uploadBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        padding: '14px',
        background: METAL.primary,
        border: 'none',
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 16,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '0.06em',
        cursor: 'pointer',
    },
    vaultEmpty: {
        padding: '24px 20px',
        textAlign: 'center',
    },
    formsList: {
        padding: '10px 14px 14px',
    },
    formCard: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        background: METAL.darkest,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 10,
        marginBottom: 8,
    },
    formCardLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flex: 1,
        minWidth: 0,
    },
    formTypeBadge: {
        padding: '4px 12px',
        background: METAL.primaryDim,
        border: `2px solid ${METAL.primary}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: METAL.primary,
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
        gap: 12,
        flexShrink: 0,
    },
    formAmount: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 17,
        fontWeight: 700,
        color: METAL.primary,
    },
    formActionBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        background: METAL.mid,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 8,
        color: METAL.textSecondary,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    formDeleteBtn: {
        color: METAL.danger,
        borderColor: 'rgba(240,40,73,0.4)',
    },

    // ━━━ ACTION / REPORT STYLES ━━━
    actionRow: {
        padding: '18px 20px',
    },
    previewBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        padding: '16px',
        background: METAL.primary,
        border: 'none',
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 17,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '0.06em',
        cursor: 'pointer',
    },
    errorBox: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        margin: '0 20px 18px',
        padding: '16px',
        background: 'rgba(240,40,73,0.1)',
        border: `2px solid ${METAL.danger}`,
        borderRadius: 10,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 15,
        fontWeight: 700,
        color: METAL.danger,
        letterSpacing: '0.06em',
    },
    reportContainer: {
        padding: '0 20px 20px',
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12,
        marginBottom: 18,
    },
    statBox: {
        padding: 16,
        background: METAL.darkest,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 12,
        textAlign: 'center',
    },
    statIcon: {
        width: 38,
        height: 38,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 8px',
        background: METAL.primaryDim,
        border: `2px solid ${METAL.primary}`,
        borderRadius: '50%',
        color: METAL.primary,
    },
    statValue: {
        display: 'block',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 22,
        fontWeight: 800,
        color: METAL.primary,
    },
    statLabel: {
        display: 'block',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: METAL.textMuted,
        letterSpacing: '0.08em',
        marginTop: 4,
    },
    breakdownSection: {
        marginBottom: 18,
    },
    sectionHeader: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: METAL.textSecondary,
        letterSpacing: '0.1em',
        marginBottom: 10,
    },
    breakdownGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
    },
    breakdownCard: {
        padding: 16,
        background: METAL.darkest,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 10,
        textAlign: 'center',
    },
    breakdownLabel: {
        display: 'block',
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        fontWeight: 700,
        color: METAL.textSecondary,
        letterSpacing: '0.08em',
        marginBottom: 6,
    },
    breakdownValue: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 24,
        fontWeight: 800,
    },

    // W-2G Report sections
    w2gSection: {
        background: METAL.darkest,
        border: `2px solid ${METAL.highlight}`,
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 18,
    },
    w2gSectionHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 16px',
        background: METAL.mid,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 15,
        fontWeight: 700,
        color: METAL.textPrimary,
        letterSpacing: '0.08em',
        borderBottom: `2px solid ${METAL.highlight}`,
    },
    w2gRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: `1px solid ${METAL.mid}`,
    },
    w2gDate: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 15,
        fontWeight: 700,
        color: METAL.textPrimary,
        marginRight: 10,
    },
    w2gVenue: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 14,
        color: METAL.textSecondary,
    },
    w2gAmount: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 18,
        fontWeight: 700,
        color: METAL.primary,
    },

    downloadBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        width: '100%',
        padding: '18px',
        background: METAL.primary,
        border: 'none',
        borderRadius: 12,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 18,
        fontWeight: 700,
        color: '#fff',
        letterSpacing: '0.06em',
        cursor: 'pointer',
    },

    // ━━━ W-2G DOCUMENT SCANNER STYLES ━━━
    w2gCaptureArea: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: 16,
    },
    w2gCameraBtn: {
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 0',
    },
    w2gCameraIcon: {
        width: 64,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,180,255,0.1)',
        border: `2px dashed ${METAL.primary}`,
        borderRadius: '50%',
        color: METAL.primary,
        marginBottom: 12,
    },
    w2gCameraText: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 15,
        fontWeight: 700,
        letterSpacing: '0.12em',
        color: '#fff',
        margin: 0,
    },
    w2gCameraHint: {
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 13,
        color: 'rgba(255,255,255,0.4)',
        marginTop: 4,
    },
    w2gDivider: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '0 24px',
        margin: '4px 0 12px',
    },
    w2gDividerLine: {
        flex: 1,
        height: 1,
        background: 'rgba(255,255,255,0.1)',
    },
    w2gDividerText: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: 'Inter, -apple-system, sans-serif',
    },
    w2gFilePreview: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '16px',
        border: `2px solid ${METAL.success}`,
        borderRadius: 12,
        background: 'rgba(49,162,76,0.06)',
        marginBottom: 16,
    },
    w2gPreviewImage: {
        maxWidth: '100%',
        maxHeight: 200,
        objectFit: 'contain',
        borderRadius: 8,
        border: `2px solid ${METAL.highlight}`,
    },
    w2gFileInfo: {
        textAlign: 'center',
    },
    w2gChangeBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 14px',
        background: 'rgba(255,255,255,0.1)',
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 6,
        fontFamily: "'Rajdhani', sans-serif",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.08em',
        color: 'rgba(255,255,255,0.6)',
        cursor: 'pointer',
    },
};
