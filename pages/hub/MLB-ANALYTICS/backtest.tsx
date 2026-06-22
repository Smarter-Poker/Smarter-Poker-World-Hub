import { useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';

/**
 * Backtest page — deprecated June 2026. Its Lock-In Gate, market breakdown,
 * and daily trend were a subset of Model Intel, which adds the cumulative
 * P&L curve and the bet-type trust ledger. Redirects there so there is one
 * source of truth for the real-money go-live gate (n>=500).
 */
export default function BacktestRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/hub/MLB-ANALYTICS/model-intel');
  }, [router]);

  return (
    <>
      <SEOHead
        title="MLB Model Backtest — Redirecting | Smarter.Poker"
        description="Redirecting to the unified Model Intel page."
        noindex={true}
      />
      {/* Blank while redirect fires */}
      <div className="min-h-screen bg-[#0a0a15]" />
    </>
  );
}
