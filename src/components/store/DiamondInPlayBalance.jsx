import { useEffect, useState } from 'react';
import supabase from '../../lib/supabase';

export default function DiamondInPlayBalance({ refreshKey }) {
  const [value, setValue] = useState(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    let generation = 0;
    const refresh = async () => {
      const request = ++generation;
      try {
        const { data, error } = await supabase.rpc('fn_poker_diamond_custody_balance');
        if (error || !Number.isSafeInteger(data?.in_play) || data.in_play < 0)
          throw new Error('Invalid Custody Balance');
        if (alive && generation === request) {
          setValue(data.in_play);
          setFailed(false);
        }
      } catch {
        if (alive && generation === request) {
          setValue(null);
          setFailed(true);
        }
      }
    };
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      ++generation;
      setValue(null);
      queueMicrotask(() => {
        if (alive) void refresh();
      });
    });
    return () => {
      alive = false;
      ++generation;
      subscription.unsubscribe();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshKey, retry]);
  return (
    <div role="status" style={{ textAlign: 'center', color: '#e2e8f0', padding: '8px 16px' }}>
      {failed ? (
        <>
          In-Play Balance Unavailable.{' '}
          <button onClick={() => setRetry((v) => v + 1)}>Retry Balance</button>
        </>
      ) : value === null ? (
        'Loading In-Play Balance'
      ) : (
        <>Diamonds In Play: {value.toLocaleString()}</>
      )}
    </div>
  );
}
