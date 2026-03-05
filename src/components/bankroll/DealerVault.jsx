/**
 * DEALER VAULT
 * ═══════════════════════════════════════════════════════════════
 * Secure document management for professional dealers
 * Facebook Dark UI — matches TaxReportPanel / TokeTracker pattern
 * ═══════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Camera, Scan, Loader2, Upload, Check, RefreshCw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from '../../stores/toastStore';
import LiveCameraScanner from './LiveCameraScanner';
import DocumentCropper from './DocumentCropper';

// ── Constants ────────────────────────────────────────────────────

const TABS = [
    { id: 'gaming_license', label: 'Gaming Licenses', icon: '' },
    { id: 'tax', label: 'Tax Documents', icon: '' },
    { id: 'employment', label: 'Employment', icon: '' },
    { id: 'paystub', label: 'Pay Stubs', icon: '' },
];

const TAX_SUB_TYPES = [
    { value: 'w2', label: 'W-2' },
    { value: '1099', label: '1099-NEC' },
    { value: 'tip_log', label: 'Annual Tip Log' },
    { value: 'other', label: 'Other' },
];

const EMPLOYMENT_SUB_TYPES = [
    { value: 'i9', label: 'I-9' },
    { value: 'ein_letter', label: 'EIN Letter' },
    { value: 'contract', label: 'Contract' },
    { value: 'other', label: 'Other' },
];

const US_STATES_GAMING = [
    'NV', 'CA', 'NJ', 'MS', 'LA', 'CO', 'MI', 'PA', 'WA', 'AZ',
    'IN', 'OH', 'FL', 'IL', 'CT', 'WV', 'MD', 'OR', 'MT', 'SD', 'Other',
];

const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

const METAL = {
    base: '#1C1E21',
    mid: '#242526',
    elevated: '#3A3B3C',
    darkest: '#18191A',
    highlight: 'rgba(255,255,255,0.12)',
    primary: '#4A90D9',
    primaryDim: 'rgba(74,144,217,0.15)',
    danger: '#F02849',
    success: '#36bb6a',
    warn: '#f59e0b',
    textPrimary: '#E4E6EB',
    textSecondary: '#B0B3B8',
};

// ── License expiry badge ─────────────────────────────────────────
function expiryBadge(expiry_date) {
    if (!expiry_date) return { label: 'No Expiry', color: METAL.textSecondary, dot: '#888' };
    const now = new Date();
    const exp = new Date(expiry_date + 'T12:00:00');
    const diffDays = Math.floor((exp - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: 'Expired', color: METAL.danger, dot: METAL.danger };
    if (diffDays <= 30) return { label: `Expires in ${diffDays}d`, color: METAL.warn, dot: METAL.warn };
    return { label: 'Active', color: METAL.success, dot: METAL.success };
}

// ── Main Component ───────────────────────────────────────────────

export default function DealerVault({ userId, completedGigs = [] }) {
    const [activeTab, setActiveTab] = useState('gaming_license');
    const [docs, setDocs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [expanded, setExpanded] = useState(true);
    const fileInputRef = useRef(null);

    // Upload form state
    const [uploadForm, setUploadForm] = useState({
        label: '',
        sub_type: '',
        tax_year: new Date().getFullYear(),
        issued_date: '',
        expiry_date: '',
        state: 'NV',
        license_number: '',
        amount: '',
        notes: '',
    });
    const [pendingFile, setPendingFile] = useState(null);
    const [showUploadForm, setShowUploadForm] = useState(false);

    // OCR Auto-Capture State
    const [showLiveCamera, setShowLiveCamera] = useState(false);
    const [showCropper, setShowCropper] = useState(false);
    const [rawImage, setRawImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Load docs from DB
    const loadDocs = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('dealer_documents')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setDocs(data || []);
        } catch (err) {
            console.error('DealerVault load error:', err);
            toast.error('Failed to load documents');
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadDocs(); }, [loadDocs]);

    // Filter docs for current tab
    const tabDocs = docs.filter(d => d.category === activeTab);
    const filteredDocs = ['tax', 'paystub'].includes(activeTab)
        ? tabDocs.filter(d => d.tax_year === selectedYear)
        : tabDocs;

    // Sort gaming licenses by expiry (most urgent first)
    const sortedDocs = activeTab === 'gaming_license'
        ? [...filteredDocs].sort((a, b) => {
            if (!a.expiry_date) return 1;
            if (!b.expiry_date) return -1;
            return new Date(a.expiry_date) - new Date(b.expiry_date);
        })
        : filteredDocs;

    // ── 1099 Threshold Checker ──────────────────────────────────
    const thresholdAlerts = (() => {
        const currentYear = new Date().getFullYear();
        const venueMap = {};
        for (const gig of completedGigs) {
            if (!gig.start_date) continue;
            const year = parseInt(gig.start_date.slice(0, 4), 10);
            if (year !== currentYear) continue;
            const venue = gig.venue_name || 'Unknown Venue';
            // Use pre-computed totalTokes (attached by fetchGigs) — fallback to days traversal for safety
            const total = gig.totalTokes !== undefined
                ? gig.totalTokes
                : (gig.days || []).reduce((sum, day) =>
                    sum + (day.downs || []).reduce((s, d) => s + (d.toke_amount || 0), 0), 0);
            venueMap[venue] = (venueMap[venue] || 0) + total;
        }
        return Object.entries(venueMap)
            .filter(([, total]) => total >= 600)
            .map(([venue, total]) => ({ venue, total }));
    })();

    // ── File handling ────────────────────────────────────────────
    const handleFileSelect = useCallback((file) => {
        if (!file) return;
        const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'];
        if (!allowed.includes(file.type)) {
            toast.error('Only JPG, PNG, HEIC, WEBP, or PDF allowed');
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            toast.error('File too large — max 20MB');
            return;
        }

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setRawImage(ev.target.result);
                setShowCropper(true);
            };
            reader.readAsDataURL(file);
        } else {
            setPendingFile(file);
            setShowUploadForm(true);
        }
    }, []);

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        handleFileSelect(file);
    };

    const handleCropConfirm = useCallback(async (croppedBase64) => {
        setShowCropper(false);
        setRawImage(null);
        setImagePreview(croppedBase64);
        const res = await fetch(croppedBase64);
        const blob = await res.blob();
        const file = new File([blob], 'dealer-doc-cropped.jpg', { type: 'image/jpeg' });
        setPendingFile(file);
        setShowUploadForm(true);
        analyzeDocument(croppedBase64);
    }, []);

    const handleCropSkip = useCallback(async () => {
        setShowCropper(false);
        if (rawImage) {
            setImagePreview(rawImage);
            const res = await fetch(rawImage);
            const blob = await res.blob();
            const file = new File([blob], 'dealer-doc-original.jpg', { type: 'image/jpeg' });
            setPendingFile(file);
            setShowUploadForm(true);
            analyzeDocument(rawImage);
        }
        setRawImage(null);
    }, [rawImage]);

    const handleLiveCapture = useCallback(async (capturedBase64) => {
        setShowLiveCamera(false);
        setImagePreview(capturedBase64);
        const res = await fetch(capturedBase64);
        const blob = await res.blob();
        const file = new File([blob], 'dealer-doc-scanned.jpg', { type: 'image/jpeg' });
        setPendingFile(file);
        setShowUploadForm(true);
        analyzeDocument(capturedBase64);
    }, []);

    const analyzeDocument = async (imageBase64) => {
        setIsAnalyzing(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            const res = await fetch('/api/bankroll/scan-dealer-document', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ image: imageBase64 })
            });

            if (!res.ok) throw new Error('OCR failed');

            const { data } = await res.json();

            if (data) {
                setUploadForm(prev => ({
                    ...prev,
                    label: data.label || prev.label,
                    sub_type: data.sub_type || prev.sub_type,
                    state: data.state || prev.state,
                    license_number: data.license_number || prev.license_number,
                    issued_date: data.issued_date || prev.issued_date,
                    expiry_date: data.expiry_date || prev.expiry_date,
                    tax_year: data.tax_year ?? prev.tax_year,
                    amount: data.amount ?? prev.amount,
                }));

                if (data.category && ['gaming_license', 'tax', 'employment', 'paystub'].includes(data.category)) {
                    setActiveTab(data.category);
                }

                toast.success('Document data auto-extracted!');
            }
        } catch (err) {
            console.error('OCR Error:', err);
            toast.error('Could not auto-extract data. Please enter manually.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleUpload = async () => {
        if (!pendingFile || !userId) return;
        if (activeTab === 'gaming_license' && !uploadForm.state) {
            toast.error('Please select a state');
            return;
        }
        setIsUploading(true);
        try {
            const ext = pendingFile.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
            const storagePath = `dealer-docs/${userId}/${activeTab}/${fileName}`;

            const { error: storageError } = await supabase.storage
                .from('images')
                .upload(storagePath, pendingFile, { upsert: false });
            if (storageError) throw storageError;

            const { data: urlData } = supabase.storage.from('images').getPublicUrl(storagePath);
            const fileUrl = urlData?.publicUrl;

            const insertPayload = {
                user_id: userId,
                category: activeTab,
                file_url: fileUrl,
                file_name: pendingFile.name,
                label: uploadForm.label || pendingFile.name,
                sub_type: uploadForm.sub_type || null,
                tax_year: ['tax', 'paystub'].includes(activeTab) ? parseInt(uploadForm.tax_year, 10) : null,
                issued_date: uploadForm.issued_date || null,
                expiry_date: uploadForm.expiry_date || null,
                state: activeTab === 'gaming_license' ? uploadForm.state : null,
                license_number: activeTab === 'gaming_license' ? (uploadForm.license_number || null) : null,
                amount: uploadForm.amount ? parseFloat(uploadForm.amount) : null,
                notes: uploadForm.notes || null,
            };

            const { error: dbError } = await supabase.from('dealer_documents').insert(insertPayload);
            if (dbError) throw dbError;

            toast.success('Document uploaded!');
            setPendingFile(null);
            setShowUploadForm(false);
            setUploadForm({
                label: '', sub_type: '', tax_year: new Date().getFullYear(),
                issued_date: '', expiry_date: '', state: 'NV',
                license_number: '', amount: '', notes: '',
            });
            await loadDocs();
            window.dispatchEvent(new CustomEvent('bankroll-updated'));
        } catch (err) {
            toast.error(err.message || 'Upload failed');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (doc) => {
        if (!confirm(`Delete "${doc.label || doc.file_name}"?`)) return;
        try {
            // Extract path from URL
            const url = new URL(doc.file_url);
            const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/images\/(.+)/);
            if (pathMatch) {
                await supabase.storage.from('images').remove([pathMatch[1]]);
            }
            await supabase.from('dealer_documents').delete().eq('id', doc.id);
            toast.success('Document deleted');
            await loadDocs();
            window.dispatchEvent(new CustomEvent('bankroll-updated'));
        } catch (err) {
            toast.error('Failed to delete document');
        }
    };

    // ── Render ───────────────────────────────────────────────────
    return (
        <div style={s.card}>
            {/* Header */}
            <button style={s.header} onClick={() => setExpanded(v => !v)}>
                <div style={s.headerLeft}>
                    <span style={s.headerIcon}></span>
                    <div>
                        <div style={s.headerTitle}>Dealer Vault</div>
                        <div style={s.headerSub}>{docs.length} document{docs.length !== 1 ? 's' : ''} stored</div>
                    </div>
                </div>
                <span style={{ ...s.chevron, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
            </button>

            {!expanded ? null : (
                <div style={s.body}>
                    {/* 1099 Threshold Alerts */}
                    {thresholdAlerts.length > 0 && (
                        <div style={s.alertBox}>
                            {thresholdAlerts.map(({ venue, total }) => (
                                <div key={venue} style={s.alertRow}>
                                    You've earned <strong style={{ color: METAL.warn }}>${total.toFixed(0)}</strong> at <strong>{venue}</strong> this year — you may receive a 1099-NEC
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Tab Bar */}
                    <div style={s.tabBar}>
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                style={{ ...s.tab, ...(activeTab === tab.id ? s.tabActive : {}) }}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.icon} {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Year Filter (tax + paystub only) */}
                    {['tax', 'paystub'].includes(activeTab) && (
                        <div style={s.yearRow}>
                            {YEARS.map(y => (
                                <button
                                    key={y}
                                    style={{ ...s.yearBtn, ...(selectedYear === y ? s.yearBtnActive : {}) }}
                                    onClick={() => setSelectedYear(y)}
                                >{y}</button>
                            ))}
                        </div>
                    )}

                    {/* Live Camera Scanner */}
                    {showLiveCamera && !pendingFile && (
                        <LiveCameraScanner
                            onCapture={handleLiveCapture}
                            onClose={() => setShowLiveCamera(false)}
                        />
                    )}

                    {/* Camera Button & Drop Zone */}
                    {!showUploadForm && !showLiveCamera && (
                        <div>
                            {/* Camera Scan Button */}
                            <div
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    padding: '24px 0', cursor: 'pointer', background: METAL.mid,
                                    borderRadius: 12, border: `1px solid ${METAL.highlight}`, marginBottom: 16
                                }}
                                onClick={() => setShowLiveCamera(true)}
                            >
                                <div style={{
                                    width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(74,144,217,0.1)', border: `2px dashed ${METAL.primary}`,
                                    borderRadius: '50%', color: METAL.primary, marginBottom: 12
                                }}>
                                    <Camera size={32} />
                                </div>
                                <div style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', fontFamily: "'Rajdhani', sans-serif", letterSpacing: '0.05em' }}>TAP TO SCAN DOCUMENT</div>
                                <div style={{ color: METAL.textSecondary, fontSize: 13, marginTop: 4 }}>Auto-Detects And Extracts Data</div>
                            </div>

                            <div style={{ textAlign: 'center', color: METAL.textSecondary, margin: '8px 0', fontSize: 14 }}>Or Choose A File From Device</div>

                            <div
                                style={{ ...s.dropZone, ...(isDragging ? s.dropZoneActive : {}) }}
                                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <div style={s.dropIcon}></div>
                                <div style={s.dropText}>Drop A Document Here Or Tap To Upload</div>
                                <div style={s.dropSub}>JPG · PNG · PDF · HEIC</div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*,application/pdf"
                                    style={{ display: 'none' }}
                                    onChange={e => handleFileSelect(e.target.files?.[0])}
                                />
                            </div>
                        </div>
                    )}

                    {/* Upload Form */}
                    {showUploadForm && (
                        <div style={s.uploadForm}>
                            {isAnalyzing && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'rgba(74,144,217,0.1)', border: `1px solid ${METAL.primary}`, borderRadius: 8, marginBottom: 16, color: METAL.primary }}>
                                    <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                                    <span style={{ fontFamily: "'Rajdhani', sans-serif", fontWeight: 600, fontSize: 14 }}>Extracting document data with Vision OCR...</span>
                                </div>
                            )}
                            <div style={s.uploadFormTitle}>📄 {pendingFile?.name}</div>

                            <input
                                style={s.input}
                                placeholder="Label (e.g. Nevada Gaming License 2025)"
                                value={uploadForm.label}
                                onChange={e => setUploadForm(f => ({ ...f, label: e.target.value }))}
                            />

                            {activeTab === 'gaming_license' && (
                                <>
                                    <div style={s.row2}>
                                        <select
                                            style={s.select}
                                            value={uploadForm.state}
                                            onChange={e => setUploadForm(f => ({ ...f, state: e.target.value }))}
                                        >
                                            {US_STATES_GAMING.map(st => (
                                                <option key={st} value={st}>{st}</option>
                                            ))}
                                        </select>
                                        <input
                                            style={s.input}
                                            placeholder="License #"
                                            value={uploadForm.license_number}
                                            onChange={e => setUploadForm(f => ({ ...f, license_number: e.target.value }))}
                                        />
                                    </div>
                                    <div style={s.row2}>
                                        <div>
                                            <div style={s.fieldLabel}>Issue Date</div>
                                            <input
                                                type="date"
                                                style={s.input}
                                                value={uploadForm.issued_date}
                                                onChange={e => setUploadForm(f => ({ ...f, issued_date: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <div style={s.fieldLabel}>Expiry Date</div>
                                            <input
                                                type="date"
                                                style={s.input}
                                                value={uploadForm.expiry_date}
                                                onChange={e => setUploadForm(f => ({ ...f, expiry_date: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeTab === 'tax' && (
                                <>
                                    <div style={s.row2}>
                                        <select
                                            style={s.select}
                                            value={uploadForm.sub_type}
                                            onChange={e => setUploadForm(f => ({ ...f, sub_type: e.target.value }))}
                                        >
                                            <option value="">Select type...</option>
                                            {TAX_SUB_TYPES.map(t => (
                                                <option key={t.value} value={t.value}>{t.label}</option>
                                            ))}
                                        </select>
                                        <select
                                            style={s.select}
                                            value={uploadForm.tax_year}
                                            onChange={e => setUploadForm(f => ({ ...f, tax_year: parseInt(e.target.value, 10) }))}
                                        >
                                            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                    <input
                                        type="number"
                                        style={s.input}
                                        placeholder="Amount (optional)"
                                        value={uploadForm.amount}
                                        onChange={e => setUploadForm(f => ({ ...f, amount: e.target.value }))}
                                    />
                                </>
                            )}

                            {activeTab === 'employment' && (
                                <select
                                    style={s.select}
                                    value={uploadForm.sub_type}
                                    onChange={e => setUploadForm(f => ({ ...f, sub_type: e.target.value }))}
                                >
                                    <option value="">Select type...</option>
                                    {EMPLOYMENT_SUB_TYPES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            )}

                            {activeTab === 'paystub' && (
                                <div style={s.row2}>
                                    <input
                                        type="number"
                                        style={s.input}
                                        placeholder="Gross amount"
                                        value={uploadForm.amount}
                                        onChange={e => setUploadForm(f => ({ ...f, amount: e.target.value }))}
                                    />
                                    <select
                                        style={s.select}
                                        value={uploadForm.tax_year}
                                        onChange={e => setUploadForm(f => ({ ...f, tax_year: parseInt(e.target.value, 10) }))}
                                    >
                                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            )}

                            <input
                                style={s.input}
                                placeholder="Notes (optional)"
                                value={uploadForm.notes}
                                onChange={e => setUploadForm(f => ({ ...f, notes: e.target.value }))}
                            />

                            <div style={s.row2}>
                                <button
                                    style={{ ...s.btn, background: METAL.primary }}
                                    onClick={handleUpload}
                                    disabled={isUploading}
                                >
                                    {isUploading ? 'Uploading...' : 'Upload'}
                                </button>
                                <button
                                    style={{ ...s.btn, background: METAL.elevated }}
                                    onClick={() => { setPendingFile(null); setShowUploadForm(false); }}
                                    disabled={isUploading}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Document List */}
                    {isLoading ? (
                        <div style={s.emptyState}>Loading Documents...</div>
                    ) : sortedDocs.length === 0 ? (
                        <div style={s.emptyState}>No {TABS.find(t => t.id === activeTab)?.label} Uploaded Yet</div>
                    ) : (
                        <div style={s.docList}>
                            {sortedDocs.map(doc => {
                                const badge = activeTab === 'gaming_license' ? expiryBadge(doc.expiry_date) : null;
                                const isImage = doc.file_url && !doc.file_url.toLowerCase().endsWith('.pdf');
                                return (
                                    <div key={doc.id} style={s.docCard}>
                                        {/* Thumbnail or PDF icon */}
                                        <div
                                            style={s.docThumb}
                                            onClick={() => window.open(doc.file_url, '_blank')}
                                        >
                                            {isImage
                                                ? <img src={doc.file_url} alt={doc.label} style={s.thumbImg} />
                                                : <div style={s.pdfIcon}>📄</div>
                                            }
                                        </div>

                                        {/* Info */}
                                        <div style={s.docInfo}>
                                            <div style={s.docLabel}>{doc.label || doc.file_name}</div>

                                            {activeTab === 'gaming_license' && (
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                                                    {doc.state && <span style={s.badge}>{doc.state}</span>}
                                                    {doc.license_number && <span style={{ ...s.badge, color: METAL.textSecondary }}># {doc.license_number}</span>}
                                                    {badge && (
                                                        <span style={{ ...s.badge, color: badge.color, border: `1px solid ${badge.color}` }}>
                                                            {badge.label}
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {activeTab === 'tax' && (
                                                <div style={s.docMeta}>
                                                    {doc.sub_type && <span style={s.badge}>{TAX_SUB_TYPES.find(t => t.value === doc.sub_type)?.label || doc.sub_type}</span>}
                                                    {doc.tax_year && <span style={{ ...s.badge, color: METAL.textSecondary }}>{doc.tax_year}</span>}
                                                    {doc.amount && <span style={{ ...s.badge, color: METAL.success }}>${parseFloat(doc.amount).toLocaleString()}</span>}
                                                </div>
                                            )}

                                            {activeTab === 'paystub' && (
                                                <div style={s.docMeta}>
                                                    {doc.tax_year && <span style={s.badge}>{doc.tax_year}</span>}
                                                    {doc.amount && <span style={{ ...s.badge, color: METAL.success }}>${parseFloat(doc.amount).toLocaleString()}</span>}
                                                </div>
                                            )}

                                            {activeTab === 'employment' && doc.sub_type && (
                                                <div style={s.docMeta}>
                                                    <span style={s.badge}>{EMPLOYMENT_SUB_TYPES.find(t => t.value === doc.sub_type)?.label || doc.sub_type}</span>
                                                </div>
                                            )}

                                            {doc.notes && <div style={s.docNotes}>{doc.notes}</div>}
                                            <div style={s.docDate}>{new Date(doc.created_at).toLocaleDateString()}</div>
                                        </div>

                                        {/* Actions */}
                                        <div style={s.docActions}>
                                            <button
                                                style={s.viewBtn}
                                                onClick={() => window.open(doc.file_url, '_blank')}
                                            >View</button>
                                            <button
                                                style={s.deleteBtn}
                                                onClick={() => handleDelete(doc)}
                                            ></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Document Cropper Overlay */}
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

// ── Styles ────────────────────────────────────────────────────────
const s = {
    card: {
        background: METAL.mid,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        overflow: 'hidden',
    },
    header: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '18px 20px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: METAL.textPrimary,
    },
    headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
    },
    headerIcon: { fontSize: 24 },
    headerTitle: {
        fontSize: 17,
        fontWeight: 700,
        color: METAL.textPrimary,
    },
    headerSub: {
        fontSize: 13,
        color: METAL.textSecondary,
        marginTop: 2,
    },
    chevron: {
        fontSize: 18,
        color: METAL.textSecondary,
        transition: 'transform 0.2s',
    },

    body: {
        borderTop: `1px solid ${METAL.highlight}`,
        padding: '0 0 16px',
    },

    // 1099 alert
    alertBox: {
        margin: '12px 16px 0',
        padding: '12px 16px',
        background: 'rgba(245,158,11,0.12)',
        border: '1px solid rgba(245,158,11,0.4)',
        borderRadius: 8,
    },
    alertRow: {
        fontSize: 13,
        color: METAL.warn,
        lineHeight: 1.5,
    },

    // Tabs
    tabBar: {
        display: 'flex',
        gap: 0,
        padding: '12px 16px 0',
        overflowX: 'auto',
        borderBottom: `1px solid ${METAL.highlight}`,
    },
    tab: {
        flex: '0 0 auto',
        padding: '10px 14px',
        background: 'none',
        border: 'none',
        borderBottom: '2px solid transparent',
        color: METAL.textSecondary,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'all 0.15s',
    },
    tabActive: {
        color: METAL.primary,
        borderBottomColor: METAL.primary,
    },

    // Year filter
    yearRow: {
        display: 'flex',
        gap: 8,
        padding: '12px 16px',
        overflowX: 'auto',
    },
    yearBtn: {
        padding: '6px 12px',
        background: METAL.darkest,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 6,
        color: METAL.textSecondary,
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
    },
    yearBtnActive: {
        background: METAL.primaryDim,
        border: `1px solid ${METAL.primary}`,
        color: METAL.primary,
    },

    // Drop zone
    dropZone: {
        margin: '12px 16px',
        padding: '28px 20px',
        border: `2px dashed ${METAL.highlight}`,
        borderRadius: 10,
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    dropZoneActive: {
        border: `2px dashed ${METAL.primary}`,
        background: METAL.primaryDim,
    },
    dropIcon: { fontSize: 28, marginBottom: 8 },
    dropText: { color: METAL.textPrimary, fontSize: 14, fontWeight: 600 },
    dropSub: { color: METAL.textSecondary, fontSize: 12, marginTop: 4 },

    // Upload form
    uploadForm: {
        margin: '12px 16px',
        padding: '16px',
        background: METAL.darkest,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    uploadFormTitle: {
        fontSize: 13,
        color: METAL.textSecondary,
        marginBottom: 4,
        wordBreak: 'break-all',
    },
    input: {
        padding: '10px 12px',
        background: METAL.mid,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        color: METAL.textPrimary,
        fontSize: 14,
        width: '100%',
        boxSizing: 'border-box',
        outline: 'none',
    },
    select: {
        padding: '10px 12px',
        background: METAL.mid,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 8,
        color: METAL.textPrimary,
        fontSize: 14,
        width: '100%',
        boxSizing: 'border-box',
        outline: 'none',
    },
    fieldLabel: {
        fontSize: 12,
        color: METAL.textSecondary,
        marginBottom: 4,
    },
    row2: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 10,
    },
    btn: {
        padding: '11px 0',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        width: '100%',
    },

    // Doc list
    docList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        margin: '8px 16px 0',
    },
    docCard: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 0',
        borderBottom: `1px solid ${METAL.highlight}`,
    },
    docThumb: {
        width: 52,
        height: 52,
        borderRadius: 8,
        overflow: 'hidden',
        background: METAL.darkest,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
    },
    thumbImg: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    pdfIcon: { fontSize: 26 },
    docInfo: { flex: 1, minWidth: 0 },
    docLabel: {
        fontSize: 14,
        fontWeight: 600,
        color: METAL.textPrimary,
        wordBreak: 'break-word',
    },
    docMeta: {
        display: 'flex',
        gap: 6,
        flexWrap: 'wrap',
        marginTop: 4,
    },
    badge: {
        display: 'inline-block',
        padding: '2px 8px',
        background: METAL.elevated,
        border: `1px solid ${METAL.highlight}`,
        borderRadius: 4,
        fontSize: 12,
        color: METAL.textPrimary,
    },
    docNotes: {
        fontSize: 12,
        color: METAL.textSecondary,
        marginTop: 4,
    },
    docDate: {
        fontSize: 11,
        color: METAL.textSecondary,
        marginTop: 4,
    },
    docActions: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        alignItems: 'flex-end',
        flexShrink: 0,
    },
    viewBtn: {
        padding: '6px 12px',
        background: METAL.primaryDim,
        border: `1px solid ${METAL.primary}`,
        borderRadius: 6,
        color: METAL.primary,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
    },
    deleteBtn: {
        padding: '6px 10px',
        background: 'rgba(240,40,73,0.1)',
        border: '1px solid rgba(240,40,73,0.3)',
        borderRadius: 6,
        fontSize: 13,
        cursor: 'pointer',
    },

    emptyState: {
        textAlign: 'center',
        color: METAL.textSecondary,
        fontSize: 14,
        padding: '30px 20px',
    },
};
