import { useEffect, useRef } from 'react';
import { acquireScrollLock } from '../../../lib/scrollLock';
import styles from './TrainingLobby.module.css';

/** Shared native dialog: keyboard containment, Escape, backdrop and scroll cleanup. */
export default function TrainingLobbyDialog({ open, onClose, labelledBy, children, ...attributes }) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const pressedOutside = useRef(false);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return undefined;
    const release = acquireScrollLock('training-lobby-dialog');
    const handleClose = () => {
      release();
      onCloseRef.current?.();
    };
    dialog.addEventListener('close', handleClose);
    if (!dialog.open) dialog.showModal();
    return () => {
      dialog.removeEventListener('close', handleClose);
      if (dialog.open) dialog.close();
      release();
    };
  }, [open]);

  const outside = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom;
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={labelledBy}
      onPointerDown={(event) => { pressedOutside.current = outside(event); }}
      onPointerUp={(event) => {
        if (pressedOutside.current && outside(event)) event.currentTarget.close();
        pressedOutside.current = false;
      }}
      {...attributes}
    >
      <div className={styles.dialogChrome}>{children}</div>
    </dialog>
  );
}
