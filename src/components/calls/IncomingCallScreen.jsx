/**
 * INCOMING CALL (2026-10-31). Full screen on a phone, a centred card on a
 * desktop. Decline and Accept are 72px targets above the home indicator.
 */
import { Phone, PhoneOff, Video } from 'lucide-react';

export default function IncomingCallScreen({ call, onAccept, onDecline }) {
    const isVideo = call.callType === 'video';
    const name = call.peer?.name || 'Someone';
    return (
        <div role="alertdialog" aria-modal="true" aria-label={`Incoming ${isVideo ? 'Video' : 'Voice'} Call From ${name}`} style={{
            position: 'fixed', inset: 0, zIndex: 10060, height: '100dvh',
            background: 'radial-gradient(circle at 50% 30%, #17305c 0%, #0b0d12 70%)', color: 'white',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 24px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 72px)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif',
        }}>
            <style>{`@keyframes sp-ring { 0%,100% { box-shadow: 0 0 0 6px rgba(24,119,242,0.35), 0 0 40px rgba(24,119,242,0.4); } 50% { box-shadow: 0 0 0 14px rgba(24,119,242,0.15), 0 0 60px rgba(24,119,242,0.6); } }`}</style>
            <div style={{ textAlign: 'center', width: '100%', maxWidth: 420 }}>
                <div style={{
                    width: 132, height: 132, borderRadius: '50%', margin: '0 auto 24px',
                    background: call.peer?.avatar ? `url(${JSON.stringify(call.peer.avatar)}) center/cover` : 'linear-gradient(135deg, #1877F2 0%, #0a3d8f 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, fontWeight: 700,
                    animation: 'sp-ring 1.6s ease-in-out infinite',
                }} aria-hidden="true">
                    {!call.peer?.avatar && name.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                <div style={{ fontSize: 16, opacity: 0.8, marginTop: 8 }}>Incoming {isVideo ? 'Video' : 'Voice'} Call</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 72, width: '100%', maxWidth: 420 }}>
                <div style={{ textAlign: 'center' }}>
                    <button type="button" aria-label="Decline Call" onClick={onDecline} style={{
                        width: 72, height: 72, borderRadius: '50%', border: 'none', background: '#E53935', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                    }}><PhoneOff size={30} /></button>
                    <div style={{ fontSize: 13, marginTop: 8, opacity: 0.85 }}>Decline</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <button type="button" aria-label="Accept Call" onClick={onAccept} style={{
                        width: 72, height: 72, borderRadius: '50%', border: 'none', background: '#22B35E', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                    }}>{isVideo ? <Video size={30} /> : <Phone size={30} />}</button>
                    <div style={{ fontSize: 13, marginTop: 8, opacity: 0.85 }}>Accept</div>
                </div>
            </div>
        </div>
    );
}
