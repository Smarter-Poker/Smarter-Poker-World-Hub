// Client-side permanent redirect — avoids getStaticProps prerender error on Vercel
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function RedirectPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/hub/daily-tournaments');
    }, [router]);
    return null;
}
