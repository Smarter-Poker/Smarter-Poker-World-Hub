import React, { useEffect, useRef, useState } from 'react';

const TrackVideo = ({ track, style }) => {
    const videoRef = useRef(null);
    
    useEffect(() => {
        if (!videoRef.current || !track) return;
        track.attach(videoRef.current);
        return () => {
            try { track.detach(videoRef.current); } catch(e){}
        };
    }, [track]);

    // BUG-FIX-DEEP-AUDIT-R4 VG-1: remote participants must NOT be
    // mirrored. The mirror-flip is a self-preview convention (so the user
    // sees themselves the way they're used to in a mirror). Applied to
    // remote video, it shows everyone else's video reversed — text on
    // shirts, hand gestures, anything they put on camera ends up
    // left-right swapped. Only the local self-preview gets scaleX(-1).
    return (
        <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline 
            disablePictureInPicture 
            controls={false} 
            style={{ width: '100%', height: '100%', objectFit: 'cover', ...style }} 
        />
    );
};

export const LiveStreamVideoGrid = ({ localStream, participants }) => {
    const localVideoRef = useRef(null);

    // Extract all remote video tracks from participants
    const remoteTracks = participants.map(p => {
        const pubs = Array.from(p.videoTrackPublications.values());
        const subbed = pubs.find(pub => pub.track);
        return subbed ? subbed.track : null;
    }).filter(Boolean);

    // Attach local stream
    useEffect(() => {
        if (localStream && localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    const totalVideos = (localStream ? 1 : 0) + remoteTracks.length;

    // Layout configuration
    const gridStyle = {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: totalVideos > 1 ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        background: '#000'
    };

    const itemStyle = {
        flex: 1,
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
    };

    return (
        <div style={gridStyle}>
            {localStream && (
                <div style={itemStyle}>
                    <video 
                        ref={localVideoRef} 
                        autoPlay 
                        muted 
                        playsInline 
                        disablePictureInPicture 
                        controls={false} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} 
                    />
                </div>
            )}
            {remoteTracks.map((track, i) => (
                <div key={track.sid || i} style={itemStyle}>
                    <TrackVideo track={track} />
                </div>
            ))}
        </div>
    );
};
