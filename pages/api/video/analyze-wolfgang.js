/**
 * Batch analyze Wolfgang Poker videos
 * Triggers AI analysis for all 4 Wolfgang Poker videos
 */

const WOLFGANG_VIDEOS = [
    { id: 'wolf1', videoId: 'CTZeYizF-g0', title: 'Playing High Stakes with Rampage and Mariano' },
    { id: 'wolf2', videoId: 'clZ-r2QDcbY', title: 'WSOP Vlog - Deep Run Dreams' },
    { id: 'wolf3', videoId: 's0WWs2e2Vhc', title: 'I Win My BIGGEST Pot EVER at $5/10' },
    { id: 'wolf4', videoId: '8XbnLzZIy7Q', title: 'Short Form Poker Content is INSANE!' },
];

export default async function handler(req, res) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://smarter.poker';
    const results = [];

    for (const video of WOLFGANG_VIDEOS) {

        try {
            const response = await fetch(
                `${baseUrl}/api/video/analyze?videoId=${video.videoId}&title=${encodeURIComponent(video.title)}`,
                { method: 'GET' }
            );

            const data = await response.json();
            results.push({
                videoId: video.videoId,
                title: video.title,
                success: data.success,
                source: data.source,
                hasTranscript: data.transcript_available,
                chapters: data.analysis?.chapters?.length || 0,
                keyHands: data.analysis?.keyHands?.length || 0,
                summary: data.analysis?.summary?.substring(0, 100) || 'N/A'
            });
        } catch (error) {
            results.push({
                videoId: video.videoId,
                title: video.title,
                success: false,
                error: error.message
            });
        }
    }

    return res.status(200).json({
        message: `Analyzed ${results.filter(r => r.success).length}/${WOLFGANG_VIDEOS.length} Wolfgang Poker videos`,
        results
    });
}
