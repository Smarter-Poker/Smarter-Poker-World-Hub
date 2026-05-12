import { useEffect } from 'react';

export default function CapHitPopup({ open, onClose, data }) {
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => {}, 0); // noop; component is controlled
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open || !data) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
         onClick={onClose} role="dialog" aria-modal="true">
      <div className="mx-4 max-w-md rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950
                      border border-amber-500/30 p-6 shadow-2xl"
           onClick={(e) => e.stopPropagation()}>
        <div className="text-amber-400 text-2xl font-bold mb-3">{data.title}</div>
        <div className="text-white text-lg font-semibold mb-4">{data.popup_message}</div>
        <div className="text-slate-300 text-sm leading-relaxed mb-4">
          {data.popup_explanation}
        </div>
        {data.next_send_message && (
          <div className="text-emerald-400 text-sm font-medium mb-2">
            ✓ {data.next_send_message}
          </div>
        )}
        {data.limits_lift_message && (
          <div className="text-cyan-300 text-sm font-medium mb-5">
            🔓 {data.limits_lift_message}
          </div>
        )}
        {typeof data.amount_sent_24h === 'number' && typeof data.amount_cap_24h === 'number' && (
          <div className="mb-5">
            <div className="text-xs text-slate-400 mb-1">
              {data.amount_sent_24h} / {data.amount_cap_24h} 💎 used today
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-red-500"
                   style={{ width: `${Math.min(100, (data.amount_sent_24h / data.amount_cap_24h) * 100)}%` }}/>
            </div>
          </div>
        )}
        <button onClick={onClose}
                className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-900
                           font-bold py-3 transition-colors">
          Got It
        </button>
      </div>
    </div>
  );
}
