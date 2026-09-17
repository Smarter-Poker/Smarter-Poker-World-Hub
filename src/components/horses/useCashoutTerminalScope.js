import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { createCashoutActorFence } from '../../lib/club-arena/cashoutTerminalIntent.mjs';

export default function useCashoutTerminalScope(actorId, viewKey, router) {
  const auth = useRef(null);
  if (!auth.current) auth.current = createCashoutActorFence();
  const view = useRef({ key: viewKey, generation: 0, mounted: true });
  if (view.current.key !== viewKey) {
    view.current = { key: viewKey, generation: view.current.generation + 1, mounted: true };
  }
  useEffect(() => {
    view.current.mounted = true;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      auth.current.update(session?.user?.id || null);
    });
    const retire = () => { view.current.generation += 1; };
    router.events.on('routeChangeStart', retire);
    router.events.on('hashChangeStart', retire);
    return () => {
      view.current.mounted = false;
      view.current.generation += 1;
      auth.current.update(null);
      data.subscription.unsubscribe();
      router.events.off('routeChangeStart', retire);
      router.events.off('hashChangeStart', retire);
    };
  }, [router.events]);
  return () => {
    const authCurrent = auth.current.capture(actorId), generation = view.current.generation;
    let valid = true;
    return () => (valid = valid && authCurrent() && view.current.mounted &&
      view.current.generation === generation && view.current.key === viewKey);
  };
}
