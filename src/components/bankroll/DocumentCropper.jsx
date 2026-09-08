/**
 * DOCUMENT CROPPER (compatibility wrapper)
 *
 * The previous implementation looked for the edge pixel nearest each image
 * corner in each quadrant, which on any real photograph returns four points
 * hugging the frame: the "crop" was the whole picture with the corners nudged.
 * Detection, corner adjustment and perspective correction now live in
 * DocumentScanner.
 *
 * The wrapper stays because TaxReportPanel and DealerVault open this component
 * for gallery uploads and expect `onConfirm(base64)` with `onCancel` meaning
 * "use the original image". Those semantics are preserved exactly.
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

export default function DocumentCropper({ imageSrc, onConfirm, onCancel, title = 'Adjust Scan' }) {
    const handleUse = useCallback(async (scan) => {
        if (!onConfirm) return;
        try {
            onConfirm(await blobToDataUrl(scan.blob));
        } catch (err) {
            console.warn('[DocumentCropper] could not read the scan:', err && err.message);
            // Falling back to the untouched source is what the caller's cancel
            // path already means, so reuse it rather than losing the photo.
            if (onCancel) onCancel();
        }
    }, [onConfirm, onCancel]);

    if (!imageSrc) return null;

    return (
        <DocumentScanner
            title={title}
            initialImage={imageSrc}
            onUse={handleUse}
            onClose={onCancel}
        />
    );
}
