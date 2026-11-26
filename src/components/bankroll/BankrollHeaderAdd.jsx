import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

// The owning section supplies the same form handler whether embedded or standalone.
export const BankrollActionTarget = createContext(undefined);

export default function BankrollHeaderAdd({ label, onClick, children }) {
  const target = useContext(BankrollActionTarget);
  if (target === undefined) return children || null;
  if (!target) return null;
  return createPortal(
    <button type="button" className="bankroll-log-btn sd-button sd-primary" onClick={onClick} aria-label={'Add + · ' + label} title={label}>
      Add +
    </button>,
    target,
  );
}
