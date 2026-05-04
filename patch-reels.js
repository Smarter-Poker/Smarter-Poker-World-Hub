const fs = require('fs');
let content = fs.readFileSync('src/components/social/ReelsFeedCarousel.jsx', 'utf8');

// 1. Change ReelViewer to forwardRef
content = content.replace(
    'function ReelViewer({ reels, startIndex, onClose }) {',
    'const ReelViewer = forwardRef(({ reels, startIndex, onClose, isActive }, ref) => {'
);
content = content.replace(
    /\}\n\nfunction ReelsFeedCarousel\(\{/g,
    '});\n\nfunction ReelsFeedCarousel({'
);

// 2. Add isActiveRef and useImperativeHandle
const refsBlockEnd = `    const goNextRef = useRef(null);`;
const refsBlockReplacement = `    const goNextRef = useRef(null);
    const isActiveRef = useRef(isActive);
    const ytFallbackTimerRef = useRef(null);
    
    useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

    useImperativeHandle(ref, () => ({
        playSynchronously: (index) => {
            userInteractedRef.current = true;
            userWantsSoundRef.current = true; // Auto sound on explicit click
            triggerVideoSwitch(index);
        },
        pauseSynchronously: () => {
            setPaused(true);
            const isYT = isYouTubeUrl(reelsRef.current[currentIndexRef.current]?.video_url);
            if (isYT) {
                sendYTCmd('pauseVideo');
            } else if (videoRef.current) {
                videoRef.current.pause();
            }
        }
    }));

    const triggerVideoSwitch = useCallback((nextIndex) => {
        const reel = reelsRef.current[nextIndex];
        if (!reel) return;
        
        setCurrentIndex(nextIndex);
        setPaused(true);
        setYtReady(false);
        setYtError(null);
        setShowComments(false);
        setShowMoreMenu(false);
        setShowReactionPicker(false);
        setShowShareModal(false);
        setCaptionExpanded(false);

        const isYT = isYouTubeUrl(reel.video_url);

        if (isYT && ytIframeReadyRef.current) {
            const videoId = getYouTubeVideoId(reel.video_url);
            if (videoId) {
                sendYTCmd('loadVideoById', [videoId]);
                sendYTCmd('playVideo');
                if (userInteractedRef.current && userWantsSoundRef.current) {
                    sendYTCmd('unMute');
                    sendYTCmd('setVolume', [100]);
                    setMuted(false);
                }
            }
            if (videoRef.current && !videoRef.current.paused) {
                videoRef.current.pause();
            }
        } else if (!isYT) {
            sendYTCmd('pauseVideo');
            if (videoRef.current) {
                videoRef.current.src = reel.video_url;
                videoRef.current.poster = reel.thumbnail_url || '';
                videoRef.current.muted = !userWantsSoundRef.current;
                videoRef.current.load();
                videoRef.current.play().catch(e => console.warn('[Reels] Autoplay prevented:', e));
                setMuted(!userWantsSoundRef.current);
            }
        }
        
        if (ytFallbackTimerRef.current) clearTimeout(ytFallbackTimerRef.current);
        ytFallbackTimerRef.current = setTimeout(() => setYtReady(true), 5000);
        autoUnmuteRetryTimersRef.current.forEach(t => clearTimeout(t));
        autoUnmuteRetryTimersRef.current = [];
    }, []);
`;
content = content.replace(refsBlockEnd, refsBlockReplacement);

// 3. Remove the old goNext / goPrev / useEffect block
const blockToRemoveStart = `    const goNext = useCallback(() => {`;
const blockToRemoveEnd = `        // eslint-disable-next-line react-hooks/exhaustive-deps\n    }, []); // MUST stay [] — listener registered once; reads fresh data via refs`;

// We will manually replace goNext and goPrev
content = content.replace(
    /const goNext = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/m,
    `const goNext = useCallback(() => {
        const nextIndex = currentIndexRef.current + 1;
        if (nextIndex >= reelsRef.current.length) return;
        triggerVideoSwitch(nextIndex);
    }, [triggerVideoSwitch]);`
);
content = content.replace(
    /const goPrev = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/m,
    `const goPrev = useCallback(() => {
        const nextIndex = currentIndexRef.current - 1;
        if (nextIndex < 0) return;
        triggerVideoSwitch(nextIndex);
    }, [triggerVideoSwitch]);`
);

// 4. Remove the old useEffect([currentIndex]) which switches video
content = content.replace(
    /\/\/ Switch video on index change using loadVideoById \(NO iframe remount!\)[\s\S]*?autoUnmuteRetryTimersRef\.current = \[\];\n        };\n        \/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\n    \}, \[currentIndex\]\);/m,
    ''
);

// 5. Fix iframe onLoad to check isActiveRef
content = content.replace(
    `                                onLoad={() => {
                                    ytIframeReadyRef.current = true;
                                    // Force play + unmute via postMessage
                                    sendYTCmd('playVideo');
                                    if (userInteractedRef.current && userWantsSoundRef.current) {
                                        sendYTCmd('unMute');
                                        sendYTCmd('setVolume', [100]);
                                        setMuted(false);
                                    }`,
    `                                onLoad={() => {
                                    ytIframeReadyRef.current = true;
                                    if (isActiveRef.current) {
                                        sendYTCmd('playVideo');
                                        if (userInteractedRef.current && userWantsSoundRef.current) {
                                            sendYTCmd('unMute');
                                            sendYTCmd('setVolume', [100]);
                                            setMuted(false);
                                        }
                                    }`
);

content = content.replace(
    `                                    ytAutoplayTimersRef.current.forEach(t => clearTimeout(t));
                                    ytAutoplayTimersRef.current = [300, 800, 1500].map(delay => setTimeout(() => {
                                        sendYTCmd('playVideo');
                                        if (userInteractedRef.current && userWantsSoundRef.current) {
                                            sendYTCmd('unMute');
                                            sendYTCmd('setVolume', [100]);
                                        }
                                    }, delay));`,
    `                                    if (isActiveRef.current) {
                                        ytAutoplayTimersRef.current.forEach(t => clearTimeout(t));
                                        ytAutoplayTimersRef.current = [300, 800, 1500].map(delay => setTimeout(() => {
                                            sendYTCmd('playVideo');
                                            if (userInteractedRef.current && userWantsSoundRef.current) {
                                                sendYTCmd('unMute');
                                                sendYTCmd('setVolume', [100]);
                                            }
                                        }, delay));
                                    }`
);

// 6. Fix Native video element: remove key={currentReel.id} and set src properly
content = content.replace(
    /<video\n\s+ref=\{videoRef\}\n\s+key=\{currentReel\.id\}\n\s+src=\{!isYouTubeUrl\(currentReel\.video_url\) \? currentReel\.video_url : undefined\}\n\s+autoPlay=\{!isYouTubeUrl\(currentReel\.video_url\)\}/m,
    `<video
                    ref={videoRef}
                    src={!isYouTubeUrl(currentReel.video_url) ? currentReel.video_url : undefined}`
);

// 7. Update ReelsFeedCarousel to always render ReelViewer but hidden
content = content.replace(
    `            {/* Full-screen viewer */}
            {viewerOpen && (
                <ReelViewer
                    reels={reels}
                    startIndex={viewerStartIndex}
                    onClose={() => setViewerOpen(false)}
                />
            )}`,
    `            {/* Full-screen viewer */}
            <div style={{ display: viewerOpen ? 'block' : 'none' }}>
                <ReelViewer
                    ref={viewerRef}
                    reels={reels}
                    startIndex={viewerStartIndex || 0}
                    isActive={viewerOpen}
                    onClose={() => {
                        setViewerOpen(false);
                        if (viewerRef.current) viewerRef.current.pauseSynchronously();
                    }}
                />
            </div>`
);

// Add viewerRef to ReelsFeedCarousel
content = content.replace(
    `    const scrollRef = useRef(null);`,
    `    const scrollRef = useRef(null);
    const viewerRef = useRef(null);`
);

// Update openViewer to play synchronously
content = content.replace(
    `    const openViewer = (index) => {
        setViewerStartIndex(index);
        setViewerOpen(true);
    };`,
    `    const openViewer = (index) => {
        setViewerStartIndex(index);
        setViewerOpen(true);
        if (viewerRef.current) {
            viewerRef.current.playSynchronously(index);
        }
    };`
);

fs.writeFileSync('src/components/social/ReelsFeedCarousel.jsx', content);
