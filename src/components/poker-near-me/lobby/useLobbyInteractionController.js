import { useCallback, useEffect, useRef, useState } from 'react';
import useAccessibleDialog from '../../../hooks/useAccessibleDialog';

export function useLobbyDialogController({ showPanel, onPanelClose, showVoiceSearch, setShowVoiceSearch }) {
  const { dialogRef: panelRef, initialFocusRef: panelBackBtnRef } = useAccessibleDialog({
    open: showPanel,
    onClose: onPanelClose,
  });
  const { dialogRef: voiceDialogRef, initialFocusRef: voiceCloseBtnRef } = useAccessibleDialog({
    open: showVoiceSearch,
    onClose: () => setShowVoiceSearch(false),
  });

  return { panelRef, panelBackBtnRef, voiceDialogRef, voiceCloseBtnRef };
}

export function useLobbyShareController(panelTitleRef) {
  const [shareCopied, setShareCopied] = useState(false);
  const shareTimeoutRef = useRef(null);

  useEffect(
    () => () => {
      if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
    },
    []
  );

  const handleShareClick = useCallback(() => {
    const url = window.location.href;
    const title = panelTitleRef.current
      ? `Smarter.Poker - ${panelTitleRef.current}`
      : 'Smarter.Poker';
    if (navigator.share) {
      navigator.share({ title, url }).catch((error) =>
        console.warn('[App] Handled promise rejection:', error?.message || error)
      );
      return;
    }
    if (!navigator.clipboard?.writeText) {
      console.warn('[App] Clipboard API unavailable; share link not copied');
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setShareCopied(true);
        if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
        shareTimeoutRef.current = setTimeout(() => setShareCopied(false), 1500);
      })
      .catch((error) =>
        console.warn('[App] Clipboard write rejected:', error?.message || error)
      );
  }, [panelTitleRef]);

  return { shareCopied, handleShareClick };
}
