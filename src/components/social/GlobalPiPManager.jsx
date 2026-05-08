import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { Maximize2, X, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { liveStreamService } from '../../services/LiveStreamService';

export default function GlobalPiPManager() {
    const router = useRouter();
    const [isActive, setIsActive] = useState(false);
    const [streamContext, setStreamContext] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoMuted, setIsVideoMuted] = useState(false);
    const videoRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 20, y: 80 });
    const dragRef = useRef({ startX: 0, startY: 0, initialX: 0, initialY: 0 });

    useEffect(() => {
        const checkStream = () => {
            const hasStream = liveStreamService.room !== null && liveStreamService.currentStreamId !== null;
            const isLiveRoute = router.pathname.includes('/social-media') || router.pathname.includes('/hub/live');
            
            // Activate PiP if there's a stream and we are NOT on the social/live page
            if (hasStream && !isLiveRoute) {
                setIsActive(true);
                setStreamContext({
                    isBroadcaster: liveStreamService.isBroadcaster,
                    streamId: liveStreamService.currentStreamId
                });
            } else {
                setIsActive(false);
            }
        };

        checkStream();
        const interval = setInterval(checkStream, 1000); // Poll for state changes
        return () => clearInterval(interval);
    }, [router.pathname]);

    useEffect(() => {
        if (isActive && videoRef.current) {
            if (liveStreamService.isBroadcaster) {
                videoRef.current.srcObject = liveStreamService.localStream;
            } else {
                if (liveStreamService._remoteMediaStream) {
                    videoRef.current.srcObject = liveStreamService._remoteMediaStream;
                }
            }
        }
    }, [isActive]);

    if (!isActive) return null;

    const handlePointerDown = (e) => {
        setIsDragging(true);
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            initialX: position.x,
            initialY: position.y
        };
        e.target.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setPosition({
            x: dragRef.current.initialX + dx,
            y: dragRef.current.initialY + dy
        });
    };

    const handlePointerUp = (e) => {
        setIsDragging(false);
        e.target.releasePointerCapture(e.pointerId);
    };

    const handleReturn = () => {
        router.push(`/hub/social-media?stream=${streamContext?.streamId}`);
    };

    const handleEndOrLeave = async () => {
        if (streamContext?.isBroadcaster) {
            if (!confirm('End your live stream?')) return;
            try {
                await liveStreamService.endBroadcast();
            } catch (err) {
                console.warn('[GlobalPiP] Failed to end cleanly:', err);
            } finally {
                setIsActive(false);
            }
        } else {
            try {
                await liveStreamService.leaveStream();
            } catch (err) {
                console.warn('[GlobalPiP] Failed to leave cleanly:', err);
            } finally {
                setIsActive(false);
            }
        }
    };

    return (
        <div 
            className="fixed z-[9999] bg-black rounded-xl overflow-hidden shadow-2xl border border-white/20 touch-none"
            style={{ 
                left: `${position.x}px`, 
                top: `${position.y}px`,
                width: '320px',
                aspectRatio: '9/16'
            }}
        >
            <div 
                className="absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-black/80 to-transparent cursor-move flex items-center justify-between px-3 z-10"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
            >
                <div className="flex gap-2">
                    <button onClick={handleReturn} className="p-1 hover:bg-white/20 rounded transition-colors text-white" title="Return to Stream">
                        <Maximize2 size={16} />
                    </button>
                </div>
                <button onClick={handleEndOrLeave} className="p-1 hover:bg-red-500/80 rounded transition-colors text-white" title={streamContext?.isBroadcaster ? "End Stream" : "Leave Stream"}>
                    <X size={16} />
                </button>
            </div>
            
            <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted={streamContext?.isBroadcaster} // Broadcaster shouldn't hear themselves
                className="w-full h-full object-cover"
            />
            
            {streamContext?.isBroadcaster && (
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 z-10">
                    <button 
                        onClick={async () => {
                            const muted = await liveStreamService.toggleMute();
                            setIsMuted(muted);
                        }}
                        className={`p-3 rounded-full backdrop-blur-md transition-all ${isMuted ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}
                    >
                        {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>
                    <button 
                        onClick={async () => {
                            const muted = await liveStreamService.toggleVideo();
                            setIsVideoMuted(muted);
                        }}
                        className={`p-3 rounded-full backdrop-blur-md transition-all ${isVideoMuted ? 'bg-red-500/80 text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}
                    >
                        {isVideoMuted ? <VideoOff size={20} /> : <Video size={20} />}
                    </button>
                </div>
            )}
            
            {/* Live indicator */}
            <div className="absolute top-12 left-3 z-10">
                <div className="bg-red-600 px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider animate-pulse shadow-lg">
                    {streamContext?.isBroadcaster ? 'LIVE' : 'WATCHING'}
                </div>
            </div>
        </div>
    );
}
