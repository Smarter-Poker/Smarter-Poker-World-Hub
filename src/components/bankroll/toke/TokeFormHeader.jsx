import { X } from 'lucide-react';
import form from './TokeForm.module.css';

export default function TokeFormHeader({ icon: Icon, title, id, detail, onClose, closeLabel, disabled }) {
    return <header className={form.header}>
        <span className={form.seal} aria-hidden="true"><Icon size={20} /></span>
        <div className={form.heading}>
            <h2 id={id}>{title}</h2>
            {detail && <p>{detail}</p>}
        </div>
        {onClose && <button type="button" className={'sd-button ' + form.close}
            aria-label={closeLabel} onClick={onClose} disabled={disabled}><X size={20} aria-hidden="true" /></button>}
    </header>;
}
