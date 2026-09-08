/**
 * LIVE CAMERA SCANNER (compatibility wrapper)
 *
 * This used to be a 630-line OpenCV component that waited on a global `cv`
 * nothing loads, so it timed out after 20 seconds on every device. The real
 * scanner now lives in DocumentScanner, which detects the document boundary,
 * corrects perspective and offers review before anything is used.
 *
 * The wrapper stays because TaxReportPanel (W-2G upload) and DealerVault
 * (paystub and tax document upload) both mount this component and expect
 * `onCapture(base64)`. Preserving that contract lets those two surfaces get
 * the working scanner without touching their upload code.
 */

import { useCallback } from 'react';
import dynamic from 'next/dynamic';

const DocumentScanner = dynamic(() => import('./DocumentScanner'), { ssr: false });

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('read-failed'));
        reader.readAsDataURL(blob);
    });
}

export default function LiveCameraScanner({ onCapture, onClose, title = 'Scan Document' }) {
    const handleUse = useCallback(async (scan) => {
        if (!onCapture) return;
        try {
            onCapture(await blobToDataUrl(scan.blob));
        } catch (err) {
            console.warn('[LiveCameraScanner] could not read the scan:', err && err.message);
            if (onClose) onClose();
        }
    }, [onCapture, onClose]);

    return <DocumentScanner title={title} onUse={handleUse} onClose={onClose} />;
}
