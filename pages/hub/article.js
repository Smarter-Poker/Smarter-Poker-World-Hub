import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';

/**
 * In-App Article Viewer
 * Displays poker news articles within smarter.poker instead of redirecting
 */
export default function ArticleViewer() {
    const router = useRouter();
    const { url, source } = router.query;
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (url) {
            // Small delay to show loading state
            setTimeout(() => setLoading(false), 500);
        }
    }, [url]);

    if (!url) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-white text-center">
                    <h1 className="text-2xl mb-4">No article specified</h1>
                    <button
                        onClick={() => router.push('/hub/social-media')}
                        className="px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                        Back to Feed
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Article Viewer | Smarter.Poker</title>
            </Head>

            <div className="min-h-screen bg-gray-900">
                {/* Header */}
                <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
                    <button
                        onClick={() => router.back()}
                        className="text-white hover:text-blue-400 flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Feed
                    </button>

                    {source && (
                        <div className="text-gray-400 text-sm">
                            Source: <span className="text-white">{source}</span>
                        </div>
                    )}

                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-2"
                    >
                        Open in New Tab
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </a>
                </div>

                {/* Article iframe */}
                <div className="relative w-full" style={{ height: 'calc(100vh - 60px)' }}>
                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                            <div className="text-white text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                                <p>Loading article...</p>
                            </div>
                        </div>
                    )}

                    <iframe
                        src={url}
                        className="w-full h-full border-0"
                        title="Article Viewer"
                        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                        onLoad={() => setLoading(false)}
                    />
                </div>
            </div>

            <style jsx>{`
        iframe {
          background: white;
        }
      `}</style>
        </>
    );
}
