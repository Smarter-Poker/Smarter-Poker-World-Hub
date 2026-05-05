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

    return (
        <video 
            ref={videoRef} 
            autoPlay 
            muted 
            playsInline 
            disablePictureInPicture 
            controls={false} 
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', ...style }} 
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
