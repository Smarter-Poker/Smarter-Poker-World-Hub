import { useEffect, useRef } from 'react';

export default function ExistingAccountDialog({ open, onClose, onSignIn }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
    else if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  return (
    <dialog className="signup-existing-account-dialog" ref={dialog} onCancel={onClose} aria-labelledby="existing-account-title" aria-describedby="existing-account-help"
      style={{ color: '#fff', background: '#0b1018', border: '1px solid #64819b', borderRadius: 18, padding: 28, width: 'calc(100% - 32px)', maxWidth: 400, boxSizing: 'border-box', boxShadow: '0 16px 60px #000' }}>
      <style>{`.signup-existing-account-dialog::backdrop { background: rgba(0, 0, 0, 0.8); }`}</style>
      <h2 id="existing-account-title" style={{ marginTop: 0, fontSize: 22 }}>You Already Have An Account</h2>
      <p id="existing-account-help" style={{ color: '#c7d4e2', lineHeight: 1.6 }}>Sign In With This Email Address. If You Forgot Your Password, Choose Forgot Password On The Sign In Screen.</p>
      <button type="button" onClick={onSignIn} style={{ width: '100%', minHeight: 46, background: '#245c9b', color: '#fff', border: '1px solid #77a5ce', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Sign In</button>
      <button type="button" onClick={onClose} style={{ width: '100%', minHeight: 44, marginTop: 8, background: 'transparent', color: '#b9cde0', border: 0, cursor: 'pointer' }}>Use A Different Email</button>
    </dialog>
  );
}
