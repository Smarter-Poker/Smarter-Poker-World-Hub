const fs = require('fs');
const path = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/src/components/social/GoLiveModal.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = `    // Unmount cleanup — ensure camera/mic are released and stream ends
    // if modal is forcefully closed (e.g., navigating away).
    useEffect(() => {
        return () => {
            if (mediaAccessMountedRef.current) {
                mediaAccessMountedRef.current = false;
                if (stage === 'live' && !isCameraFlipping) {
                    liveStreamService.endBroadcast().catch(() => {});
                    // BUG FIX: Unmount is a forced teardown, so we must emit directly
                    busEmit.dataMutated?.('live_streams');
                } else if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                }
            }
        };
    }, [stage, isCameraFlipping]); // Re-bind when stage changes to ensure we have latest stage on unmount`;

const replacement = `    // Unmount cleanup — ensure camera/mic are released and stream ends
    // if modal is forcefully closed (e.g., navigating away).
    // Use a ref to store state so we don't trigger cleanup on state changes
    const unmountStateRef = useRef({ stage, isCameraFlipping });
    useEffect(() => {
        unmountStateRef.current = { stage, isCameraFlipping };
    }, [stage, isCameraFlipping]);

    useEffect(() => {
        return () => {
            if (mediaAccessMountedRef.current) {
                mediaAccessMountedRef.current = false;
                const { stage: currentStage, isCameraFlipping: currentFlipping } = unmountStateRef.current;
                
                if (currentStage === 'live' && !currentFlipping) {
                    liveStreamService.endBroadcast().catch(() => {});
                    // BUG FIX: Unmount is a forced teardown, so we must emit directly
                    busEmit.dataMutated?.('live_streams');
                } else if (streamRef.current) {
                    streamRef.current.getTracks().forEach(t => t.stop());
                }
            }
        };
    }, []); // Run ONLY on mount/unmount`;

if(content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log("Success");
} else {
    console.log("Target not found");
}
