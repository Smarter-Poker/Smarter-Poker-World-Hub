/**
 * The empty-dashboard offer to import sessions (2026-11-28). Shown only when
 * the player's whole ledger is empty, which it checks itself: the dashboard's
 * own list is filtered by time and venue, so an empty list there is not an
 * empty ledger. A failed check shows nothing rather than a wrong offer.
 */
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import css from './BankrollDataTools.module.css';

const SessionImportSheet = dynamic(() => import('./SessionImportSheet'), { ssr: false });

export default function ImportSessionsPrompt({ userId }) {
  const [empty, setEmpty] = useState(false);
  const [open, setOpen] = useState(false);

  const check = useCallback(async () => {
    if (!userId) return;
    const { count, error } = await supabase
      .from('bankroll_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    setEmpty(!error && count === 0);
  }, [userId]);

  useEffect(() => {
    check();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener('bankroll-updated', check);
    return () => window.removeEventListener('bankroll-updated', check);
  }, [check]);

  if (!empty && !open) return null;
  return (
    <>
      {empty && (
        <section className={css.card} data-testid="import-sessions-prompt" aria-labelledby="import-prompt-title">
          <h3 id="import-prompt-title" className={css.cardTitle}>Already Track Your Sessions Somewhere?</h3>
          <span className={css.hint}>Import Them From A Spreadsheet Or Poker Bankroll Tracker CSV. Amounts In US Dollars (USD).</span>
          <button type="button" className="sd-button sd-primary" style={{ minHeight: 44, width: '100%' }} onClick={() => setOpen(true)}>Import Sessions</button>
        </section>
      )}
      {open && <SessionImportSheet userId={userId} onClose={() => setOpen(false)} />}
    </>
  );
}
