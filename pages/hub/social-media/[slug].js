/**
 * Social Media Slug Redirect
 * Handles: /hub/social-media/[slug] → /hub/social-pages/[slug]
 * Allows users to use the shorter smarter.poker/hub/social-media/CLUBJAQK format
 */
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export default function SocialMediaSlugRedirect() {
    const router = useRouter();
    const { slug } = router.query;

    useEffect(() => {
        if (!router.isReady || !slug) return;
        // Redirect to the canonical social-pages route
        router.replace(`/hub/social-pages/${slug}`);
    }, [router.isReady, slug, router]);

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#F0F2F5', fontFamily: "var(--font-inter), -apple-system, sans-serif",
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: 32, height: 32, border: '3px solid #E4E6EB',
                    borderTopColor: '#1877F2', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
                }} />
                <p style={{ color: '#65676B', fontSize: 14 }}>Redirecting...</p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
