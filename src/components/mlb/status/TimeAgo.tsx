import React, { useState, useEffect } from 'react';

export const TimeAgo = ({
  dateString,
  serverNow,
  fallback = '—',
}: {
  dateString?: string | null;
  serverNow?: string | null;
  fallback?: string;
}) => {
  const [mounted, setMounted] = useState(false);
  const [diff, setDiff] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (serverNow) {
      const serverClientDiff = new Date(serverNow).getTime() - Date.now();
      setDiff(Number.isNaN(serverClientDiff) ? 0 : serverClientDiff);
    }
  }, [serverNow]);

  // Tick to trigger re-renders and keep time fresh without SWR refresh
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!mounted) return <>{fallback}</>;
  if (!dateString) return <>{fallback}</>;

  const isoStr = dateString.trim().replace(/ /g, 'T');
  const safeDate = isoStr.endsWith('Z') || isoStr.includes('+') ? isoStr : isoStr + 'Z';
  const past = new Date(safeDate);
  if (isNaN(past.getTime())) return <>{fallback}</>;

  const effectiveNow = Date.now() + diff;
  const diffMs = Math.max(0, effectiveNow - past.getTime());
  const s = Math.round(diffMs / 1000);

  if (s < 45) return <>Just Now</>;
  const m = Math.round(s / 60);
  if (m < 60) return <>{`${m}m Ago`}</>;
  const h = Math.round(m / 60);
  if (h < 24) return <>{`${h}h Ago`}</>;
  const dd = Math.round(h / 24);
  return <>{`${dd}d Ago`}</>;
};
