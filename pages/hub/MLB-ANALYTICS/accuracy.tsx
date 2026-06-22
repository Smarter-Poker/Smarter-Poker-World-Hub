import { useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';

/**
 * Accuracy page — redirects to Model Intel which now includes the
 * Lock-In Gate and Daily Performance Log (merged June 2026).
 */
export default function AccuracyRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/hub/MLB-ANALYTICS/model-intel');
  }, [router]);

  return (
    <>
      <SEOHead
        title="MLB Model Accuracy — Redirecting | Smarter.Poker"
        description="Redirecting to the unified Model Intel page."
        noindex={true}
      />
      {/* Blank while redirect fires */}
      <div className="min-h-screen bg-[#0a0a15]" />
    </>
  );
}
