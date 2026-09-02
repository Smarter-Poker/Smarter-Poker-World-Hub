/**
 * ConfirmDialog - a Modal that asks one question and takes one answer.
 *
 * `requireTyped` is for the operations where a click is too cheap: the confirm
 * button stays disabled until the operator types the exact phrase. Nothing in
 * this file guesses at consequences - the caller passes the sentence, because
 * the caller is the only thing that knows what is about to move.
 */
import React, { useState } from 'react';
import Modal from './Modal';
import styles from './shared.module.css';

export default function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  busy = false,
  tone = 'go',
  requireTyped = null,
  note = null,
  sticky = false,
  blockEscape = false,
}) {
  const [typed, setTyped] = useState('');
  const typedOk = !requireTyped || typed.trim().toUpperCase() === String(requireTyped).trim().toUpperCase();

  return (
    <Modal
      title={title}
      onClose={busy ? undefined : onCancel}
      sticky={sticky}
      blockEscape={blockEscape}
      hideClose
    >
      <div className={styles.confirmBody}>{children}</div>

      {requireTyped && (
        <>
          <label className={styles.confirmTypedLabel} htmlFor="confirm-typed">
            Type {requireTyped} To Confirm
          </label>
          <input
            id="confirm-typed"
            className={styles.confirmTypedInput}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </>
      )}

      {note && <p className={styles.dialogNote}>{note}</p>}

      <div className={styles.confirmActions}>
        <button
          type="button"
          className={`${styles.confirmBtn} ${tone === 'danger' ? styles.confirmDanger : styles.confirmGo}`}
          onClick={onConfirm}
          disabled={busy || !typedOk}
        >
          {busy ? 'Working' : confirmLabel}
        </button>
        <button
          type="button"
          className={`${styles.confirmBtn} ${styles.confirmCancel}`}
          onClick={onCancel}
          disabled={busy}
        >
          {cancelLabel}
        </button>
      </div>
    </Modal>
  );
}
