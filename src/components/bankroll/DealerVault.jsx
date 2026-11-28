/**
 * DEALER VAULT
 * ═══════════════════════════════════════════════════════════════
 * Secure document management for professional dealers
 * SmarterPoker Dark UI — matches TaxReportPanel / TokeTracker pattern
 * ═══════════════════════════════════════════════════════════════
 */

import BankrollHeaderAdd from './BankrollHeaderAdd';
import vault from './toke/DealerVault.module.css';
import form from './toke/TokeForm.module.css';
import TokeFormHeader from './toke/TokeFormHeader';
import view from './toke/TokeWorkspace.module.css';
import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { Camera, FileText, Loader2, Upload, Trash2, FolderLock, ChevronDown, BadgeCheck, Files, Briefcase, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { uploadBankrollFile, removeBankrollObject } from '../../lib/bankroll/receiptStorage';
import { readText, releaseOcr, OcrUnavailableError } from '../../lib/docscan/ocr.mjs';
import { readPdf, isPdf, PdfUnreadableError } from '../../lib/docscan/pdfText.mjs';
import { downscaleForOcr } from '../../lib/docscan/imageSource';
import { reportReaderFailure, READER_SECTIONS } from '../../lib/bankroll/reportReaderFailure';
import { getFreshAccessToken } from '../../lib/authUtils';
import { requestErrorMessage } from '../../lib/bankroll/apiGuard.mjs';
import toast from '../../stores/toastStore';
import LiveCameraScanner from './LiveCameraScanner';
import DocumentCropper from './DocumentCropper';

// ── Constants ────────────────────────────────────────────────────

const TABS = [
    { id: 'gaming_license', label: 'Gaming Licenses', Icon: BadgeCheck },
    { id: 'tax', label: 'Tax Documents', Icon: Files },
    { id: 'employment', label: 'Employment', Icon: Briefcase },
    { id: 'paystub', label: 'Pay Stubs', Icon: Receipt },
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
    base: '#0d1b2b',
    mid: '#112338',
    elevated: '#30485f',
    darkest: '#07111e',
    highlight: 'rgba(255,255,255,0.12)',
    primary: '#8acbff',
    primaryDim: 'rgba(74,144,217,0.15)',
    danger: '#e7effa',
    success: '#8cdeee',
    warn: '#85d8fb',
    textPrimary: '#eff5fc',
    textSecondary: '#bfcee0',
};

// ── License expiry badge ─────────────────────────────────────────
function expiryBadge(expiry_date) {
    if (!expiry_date) return { label: 'No Expiry', color: METAL.textSecondary, dot: '#a6bdd2' };
    const now = new Date();
    const exp = new Date(expiry_date + 'T12:00:00');
    const diffDays = Math.floor((exp - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: 'Expired', color: METAL.danger, dot: METAL.danger };
    if (diffDays <= 30) return { label: `Expires in ${diffDays}d`, color: METAL.warn, dot: METAL.warn };
    return { label: 'Active', color: METAL.success, dot: METAL.success };
}

// ── Main Component ───────────────────────────────────────────────

function DealerVault({ userId, completedGigs = [] }) {
    const [activeTab, setActiveTab] = useState('gaming_license');
    const [docs, setDocs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [readError, setReadError] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [expanded, setExpanded] = useState(true);
    const fileInputRef = useRef(null);
    const uploading = useRef(false);

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
    // 0-100 while the on-device engine reads. The first scan also downloads
    // the engine, which is worth showing rather than a still screen.
    const [ocrProgress, setOcrProgress] = useState(null);

    // Load docs from DB
    const loadDocs = useCallback(async () => {
        if (!userId) return;
        setIsLoading(true);
        setReadError(false);
        try {
            const { data, error } = await supabase
                .from('dealer_documents')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setDocs(data || []);
        } catch (err) {
            setReadError(true);
            console.warn('DealerVault load error:', err);
            toast.error('Failed to load documents');
        } finally {
            setIsLoading(false);
        }
    }, [userId]);

    useEffect(() => { loadDocs(); }, [loadDocs]);

    // The OCR engine holds a WebAssembly heap of tens of megabytes. It is let
    // go when the vault closes, not left running behind the rest of the app.
    useEffect(() => () => { releaseOcr(); }, []);

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
        return Object.entries(venueMap || {})
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
            toast.error('File too large - max 20MB');
            return;
        }

        setExpanded(true);
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setRawImage(ev.target.result);
                setShowCropper(true);
            };
            reader.readAsDataURL(file);
        } else {
            // A PDF used to stop here: uploaded, stored, and never read, so
            // every field on it was typed in by hand. Casinos email W-2Gs as
            // PDFs, which is the most common way a player receives one.
            setPendingFile(file);
            setShowUploadForm(true);
            if (isPdf(file)) analyzeDocument(file);
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

    /**
     * Read the document.
     *
     * THE PICTURE NEVER LEAVES THE DEVICE. Tesseract, compiled to WebAssembly
     * and served from our own origin, reads a dealer's gaming card or W-2 on
     * their own phone. What crosses the network is the text it produced. The
     * route is still called because it holds the Bankroll Pro gate and runs
     * the shared parser, which is the same pure module the tests exercise.
     */
    const analyzeDocument = async (input) => {
        setIsAnalyzing(true);
        try {
            // A token read straight out of localStorage is whatever was there
            // when the tab opened. This one refreshes it if it is about to
            // expire, which is the difference between a scan and a 401.
            const token = await getFreshAccessToken();
            if (!token) throw new Error('not-signed-in');

            // The full-resolution photograph went straight to the engine
            // here while ReceiptScanner had shrunk its copy since day one.
            // A modern phone camera is 4000px on the long side; the engine
            // reads a document just as well at 1600 and several times faster.
            // A PDF is read by pdf.js: page one's TEXT LAYER when it has one,
            // which is exact and needs no recognition at all, and only a
            // rasterised page through the same engine when it does not.
            let read;
            if (isPdf(input)) {
                read = await readPdf(input, { onProgress: (pct) => setOcrProgress(pct) });
            } else {
                const full = await fetch(input).then((r) => r.blob());
                const forOcr = await downscaleForOcr(full, 1600, 0.85);
                read = await readText(forOcr, { onProgress: (pct) => setOcrProgress(pct) });
            }
            setOcrProgress(null);
            if (!read.text.trim()) throw new Error('no-text-found');

            const res = await fetch('/api/bankroll/scan-dealer-document', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ text: read.text, ocrConfidence: read.confidence })
            });

            // A refusal is not an unreadable document: say which it was. The
            // document still saves either way; only the auto-fill is skipped.
            if (!res.ok) {
                const refusal = new Error('OCR failed');
                refusal.status = res.status;
                throw refusal;
            }

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
            console.warn('OCR Error:', err);
            // An engine that cannot start means the DEPLOY is broken, not the
            // photograph. That one pages somebody; a hard-to-read licence
            // does not.
            if (err instanceof OcrUnavailableError || err instanceof PdfUnreadableError) {
                reportReaderFailure(err, READER_SECTIONS.DEALER_VAULT, userId);
            }
            const refused = err && [401, 403, 429, 503].includes(err.status);
            toast.error(refused
                ? requestErrorMessage(err.status, '').replace(/\.?$/, '.') + ' Enter the details manually for now.'
                : 'Could not auto-extract data. Please enter manually.');
        } finally {
            setOcrProgress(null);
            setIsAnalyzing(false);
        }
    };

    const handleUpload = async () => {
        if (!pendingFile || uploading.current) return;
        if (!userId) { toast.error('Sign In To Upload A Document'); return; }
        if (activeTab === 'gaming_license' && !uploadForm.state) {
            toast.error('Please select a state');
            return;
        }
        uploading.current = true;
        setIsUploading(true);
        try {
            // The upload goes through the one module that knows the bucket.
            // `images` has no INSERT policy, so writing there was refused 403
            // for every dealer document. Existing objects stay where they are;
            // reads and deletes below still point at them.
            const fileUrl = await uploadBankrollFile(supabase, userId, pendingFile);

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
            uploading.current = false;
            setIsUploading(false);
        }
    };

    const handleDelete = async (doc) => {
        if (!confirm(`Delete "${doc.label || doc.file_name}"?`)) return;
        try {
            const { data, error } = await supabase.from('dealer_documents')
                .delete().eq('id', doc.id).eq('user_id', userId).select('id').maybeSingle();
            if (error || !data) throw new Error('The document could not be deleted');
            const removed = await removeBankrollObject(supabase, doc.file_url);
            if (removed) toast.success('Document Deleted');
            else toast.error('Record Deleted. The Stored File Could Not Be Removed.');
            await loadDocs();
            window.dispatchEvent(new CustomEvent('bankroll-updated'));
        } catch (err) {
            toast.error('Failed to delete document');
        }
    };

    const closeUpload = () => {
        setPendingFile(null);
        setShowUploadForm(false);
    };

    // ── Render ───────────────────────────────────────────────────
    return (
        <section className={'sd-panel ' + view.panel + ' ' + vault.library} aria-labelledby="dealer-library-title">
            {userId && !showUploadForm && !isUploading && <BankrollHeaderAdd label="Upload Document" onClick={() => fileInputRef.current?.click()} />}
            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" hidden onChange={e => { handleFileSelect(e.target.files?.[0]); e.target.value = ''; }} />

            {/* Header */}
            <button type="button" className={view.disclosure} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>
                <div className={vault.headerLeft}><span className={form.seal}><FolderLock size={21} aria-hidden="true" /></span>

                    <div>
                        <span className="sd-section-title" id="dealer-library-title">Documents</span>
                        {userId && !isLoading && !readError && <div style={s.headerSub}>{`${docs.length} ${docs.length === 1 ? 'Document' : 'Documents'} Stored`}</div>}
                    </div>
                </div>
                <ChevronDown size={20} className={vault.expandIcon} aria-hidden="true" />
            </button>

            {!expanded ? null : (
                <div style={s.body}>
                    {/* 1099 Threshold Alerts */}
                    {thresholdAlerts.length > 0 && (
                        <div style={s.alertBox}>
                            {thresholdAlerts.map(({ venue, total }) => (
                                <div key={venue} style={s.alertRow}>
                                    You've Earned <strong style={{ color: METAL.warn }}>${total.toFixed(0)}</strong> At <strong>{venue}</strong> This Year - You May Receive A 1099-NEC
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Tab Bar */}
                    <div className={"sd-tabs " + vault.categories} aria-label="Document Categories" role="group">
                        {TABS.map(tab => (
                            <button
                                key={tab.id} aria-pressed={activeTab === tab.id}
                                className="sd-button"
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <tab.Icon size={18} aria-hidden="true" />{tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Year Filter (tax + paystub only) */}
                    {['tax', 'paystub'].includes(activeTab) && (
                        <div className={vault.years} role="group" aria-label="Document Year">
                            {YEARS.map(y => (
                                <button
                                    key={y} aria-pressed={selectedYear === y}
                                    className="sd-button"
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
                    {userId && !showUploadForm && !showLiveCamera && (
                        <div className={vault.intake}>
                            <button type="button" className="sd-button" onClick={() => setShowLiveCamera(true)}><Camera size={23} aria-hidden="true" />Scan Document</button>
                            <button type="button" className="sd-button" data-dragging={isDragging} onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}>
                                <Upload size={23} aria-hidden="true" />Upload Document
                            </button>
                        </div>
                    )}

                    {/* Upload Form */}
                    {showUploadForm && (
                        <form className={vault.form} aria-labelledby="vault-intake-title" onSubmit={event => { event.preventDefault(); void handleUpload(); }}>
                            <TokeFormHeader icon={FileText} id="vault-intake-title" title="Document Details" detail={pendingFile?.name} onClose={closeUpload} closeLabel="Close Document Details" disabled={isUploading} />
                            <div className={form.fields}>
                                {isAnalyzing && (
                                    <div className={vault.reading} role="status">
                                        <Loader2 size={18} aria-hidden="true" />
                                        <span>
                                            {ocrProgress === null
                                                ? 'Reading This Document On Your Device...'
                                                : `Reading This Document On Your Device... ${ocrProgress}%`}
                                        </span>
                                    </div>
                                )}

                                <label>Document Label
                                    <input
                                        placeholder="Label (e.g. Nevada Gaming License 2025)"
                                        aria-label="Document Label"
                                        value={uploadForm.label}
                                        onChange={e => setUploadForm(f => ({ ...f, label: e.target.value }))}
                                    />
                                </label>

                                {activeTab === 'gaming_license' && (
                                    <>
                                        <div className={vault.pair}>
                                            <label>Issuing State
                                                <select
                                                    aria-label="Issuing State"
                                                    value={uploadForm.state}
                                                    onChange={e => setUploadForm(f => ({ ...f, state: e.target.value }))}
                                                >
                                                    {US_STATES_GAMING.map(st => (
                                                        <option key={st} value={st}>{st}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label>License Number
                                                <input
                                                    placeholder="License #"
                                                    aria-label="License Number"
                                                    value={uploadForm.license_number}
                                                    onChange={e => setUploadForm(f => ({ ...f, license_number: e.target.value }))}
                                                />
                                            </label>
                                        </div>
                                        <div className={vault.pair}>
                                            <label>Issue Date
                                                <input
                                                        type="date"
                                                        aria-label="Issue Date"
                                                        value={uploadForm.issued_date}
                                                        onChange={e => setUploadForm(f => ({ ...f, issued_date: e.target.value }))}
                                                    />
                                            </label>
                                            <label>Expiry Date
                                                <input
                                                        type="date"
                                                        aria-label="Expiry Date"
                                                        value={uploadForm.expiry_date}
                                                        onChange={e => setUploadForm(f => ({ ...f, expiry_date: e.target.value }))}
                                                    />
                                            </label>
                                        </div>
                                    </>
                                )}

                                {activeTab === 'tax' && (
                                    <>
                                        <div className={vault.pair}>
                                            <label>Document Type
                                                <select
                                                    aria-label="Document Type"
                                                    value={uploadForm.sub_type}
                                                    onChange={e => setUploadForm(f => ({ ...f, sub_type: e.target.value }))}
                                                >
                                                    <option value="">Select Type...</option>
                                                    {TAX_SUB_TYPES.map(t => (
                                                        <option key={t.value} value={t.value}>{t.label}</option>
                                                    ))}
                                                </select>
                                            </label>
                                            <label>Tax Year
                                                <select
                                                    aria-label="Tax Year"
                                                    value={uploadForm.tax_year}
                                                    onChange={e => setUploadForm(f => ({ ...f, tax_year: parseInt(e.target.value, 10) }))}
                                                >
                                                    {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                                </select>
                                            </label>
                                        </div>
                                        <label>Amount ($)
                                            <input
                                                type="number"
                                                placeholder="Amount (optional)"
                                                aria-label="Amount"
                                                value={uploadForm.amount}
                                                onChange={e => setUploadForm(f => ({ ...f, amount: e.target.value }))}
                                            />
                                        </label>
                                    </>
                                )}

                                {activeTab === 'employment' && (
                                    <label>Document Type
                                        <select
                                            aria-label="Document Type"
                                            value={uploadForm.sub_type}
                                            onChange={e => setUploadForm(f => ({ ...f, sub_type: e.target.value }))}
                                        >
                                            <option value="">Select Type...</option>
                                            {EMPLOYMENT_SUB_TYPES.map(t => (
                                                <option key={t.value} value={t.value}>{t.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                )}

                                {activeTab === 'paystub' && (
                                    <div className={vault.pair}>
                                        <label>Gross Amount ($)
                                            <input
                                                type="number"
                                                placeholder="Gross amount"
                                                aria-label="Amount"
                                                value={uploadForm.amount}
                                                onChange={e => setUploadForm(f => ({ ...f, amount: e.target.value }))}
                                            />
                                        </label>
                                        <label>Tax Year
                                            <select
                                                aria-label="Tax Year"
                                                value={uploadForm.tax_year}
                                                onChange={e => setUploadForm(f => ({ ...f, tax_year: parseInt(e.target.value, 10) }))}
                                            >
                                                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                        </label>
                                    </div>
                                )}

                                <label>Notes (Optional)
                                    <input
                                        placeholder="Notes (optional)"
                                        aria-label="Notes"
                                        value={uploadForm.notes}
                                        onChange={e => setUploadForm(f => ({ ...f, notes: e.target.value }))}
                                    />
                                </label>

                            </div>
                            <div className={form.actions}>
                                <button type="button" className="sd-button" onClick={closeUpload} disabled={isUploading}>Cancel</button>
                                <button type="submit" className="sd-button sd-primary" disabled={isUploading}>
                                    {isUploading ? 'Uploading...' : 'Upload'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Document List */}
                    {!userId ? <p className={view.status}>Sign In To View Your Documents.</p> : isLoading ? (
                        <p role="status" className={view.status}>Loading Documents…</p>
                    ) : readError ? (
                        <div role="alert" className={view.status}>Documents Could Not Be Loaded.
                            <button type="button" className="sd-button" onClick={loadDocs}>Retry</button>
                        </div>
                    ) : sortedDocs.length === 0 ? (
                        <div role="status" className={view.status}>No {TABS.find(t => t.id === activeTab)?.label} Uploaded Yet</div>
                    ) : (
                        <ul className={vault.documents} aria-label="Stored Documents">
                            {sortedDocs.map(doc => {
                                const badge = activeTab === 'gaming_license' ? expiryBadge(doc.expiry_date) : null;
                                const isImage = doc.file_url && !doc.file_url.toLowerCase().endsWith('.pdf');
                                return (
                                    <li key={doc.id} className={vault.document}>
                                        {/* Thumbnail or PDF icon */}
                                        <a href={doc.file_url} target="_blank" rel="noreferrer"
                                            aria-label={'Open ' + (doc.label || doc.file_name)}
                                            className={vault.thumb}
                                        >
                                            {isImage
                                                ? <img src={doc.file_url} alt={doc.label} style={s.thumbImg} />
                                                : <FileText size={24} aria-hidden="true" />
                                            }
                                        </a>

                                        {/* Info */}
                                        <div className={vault.docInfo}>
                                            <div className={vault.docLabel}>{doc.label || doc.file_name}</div>

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
                                        <div className={vault.documentActions}>
                                            <button
                                                className="sd-button"
                                                onClick={() => window.open(doc.file_url, '_blank', 'noopener,noreferrer')}
                                            >View</button>
                                            <button
                                                className={'sd-button ' + vault.deleteButton} aria-label={'Delete ' + (doc.label || doc.file_name)}
                                                onClick={() => handleDelete(doc)}
                                            ><Trash2 size={17} aria-hidden="true" /></button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
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
        </section>
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
        background: 'rgba(45,137,234,0.12)',
        border: '1px solid rgba(45,137,234,0.4)',
        borderRadius: 8,
    },
    alertRow: {
        fontSize: 13,
        color: METAL.warn,
        lineHeight: 1.5,
    },

    // Tabs
    // Always-Displayed Mobile Standard: tabs wrap, they never scroll sideways.
    tabBar: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 0,
        padding: '12px 16px 0',
        borderBottom: `1px solid ${METAL.highlight}`,
    },
    tab: {
        flex: '0 0 auto',
        minHeight: 44,
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
        flexWrap: 'wrap',
        gap: 8,
        padding: '12px 16px',
    },
    yearBtn: {
        minHeight: 44,
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
        fontSize: 12,
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
        background: 'rgba(110,151,181,0.1)',
        border: '1px solid rgba(110,151,181,0.3)',
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

export default memo(DealerVault);
