import { useCallback, useEffect, useRef, useState } from 'react';
import { FOCUSABLE_SELECTOR } from './lobbyController';

export function useLobbyDialogController({ showPanel, onPanelClose, showVoiceSearch, setShowVoiceSearch }) {
  const panelRef = useRef(null);
  const panelBackBtnRef = useRef(null);
  const panelOpenerRef = useRef(null);
  const voiceCloseBtnRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && showPanel) onPanelClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showPanel, onPanelClose]);

  useEffect(() => {
    if (!showPanel) return undefined;
    panelOpenerRef.current = document.activeElement || null;
    const frame = requestAnimationFrame(() => panelBackBtnRef.current?.focus?.());
    return () => {
      cancelAnimationFrame(frame);
      const opener = panelOpenerRef.current;
      panelOpenerRef.current = null;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [showPanel]);

  const handlePanelKeyDown = useCallback((event) => {
    if (event.key !== 'Tab') return;
    const root = panelRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!showVoiceSearch) return undefined;
    const opener = document.activeElement || null;
    const frame = requestAnimationFrame(() => voiceCloseBtnRef.current?.focus?.());
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setShowVoiceSearch(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, [showVoiceSearch, setShowVoiceSearch]);

  return { panelRef, panelBackBtnRef, voiceCloseBtnRef, handlePanelKeyDown };
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
