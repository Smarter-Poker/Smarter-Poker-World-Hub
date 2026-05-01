/**
 * EditPostScreen — screen 2 of the FB-style compose flow.
 *
 * Top: media preview tile with "Edit" overlay (opens cover picker for the
 * primary video; image-only posts hide the Edit affordance).
 * Middle: visibility + AI label dropdowns, description textarea.
 * Below: rows for location, tag people, share to groups, add topics.
 * Bottom: share-to-story toggle + sticky "Post now" CTA.
 *
 * Sub-modals (location picker, tag people, share to groups, add topics)
 * are rendered inline as full-screen sheets when their row is tapped —
 * keeps the URL stable so back-button works consistently.
 */
import React, { useState } from 'react';
import { useComposeStore } from '../../../stores/composeStore';
import LocationPickerSheet from './sheets/LocationPickerSheet';
import VisibilityPickerSheet from './sheets/VisibilityPickerSheet';
import TagPeopleSheet from './sheets/TagPeopleSheet';
import ShareToGroupsSheet from './sheets/ShareToGroupsSheet';
import AddTopicsSheet from './sheets/AddTopicsSheet';

const HEADER_H = 56;

const visibilityLabel = {
    public: 'Public',
    friends: 'Friends',
    friends_except: 'Friends except…',
    specific: 'Specific friends',
    only_me: 'Only me',
    custom: 'Custom',
};

function Row({ icon, label, value, onClick, chevron = true }) {
    return (
        <button
            onClick={onClick}
            style={{
                width: '100%', display: 'flex', alignItems: 'center',
                gap: 12, padding: '14px 16px',
                background: 'none', border: 'none', borderTop: '1px solid #e4e6eb',
                fontSize: 15, color: '#050505', cursor: 'pointer', textAlign: 'left',
            }}
        >
            <span aria-hidden="true" style={{ fontSize: 18, width: 24, textAlign: 'center', color: '#65676B' }}>{icon}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{label}</span>
            {value && (
                <span style={{ color: '#1877F2', fontWeight: 600, fontSize: 14, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
            )}
            {chevron && <span aria-hidden="true" style={{ color: '#bcc0c4', fontSize: 16 }}>&#x276F;</span>}
        </button>
    );
}

export default function EditPostScreen({ onBack, onEditCover, onPostNow }) {
    const media = useComposeStore(s => s.media);
    const draft = useComposeStore(s => s.draft);
    const setDraft = useComposeStore(s => s.setDraft);
    const audienceMode = useComposeStore(s => s.audienceMode);
    const aiLabel = useComposeStore(s => s.aiLabel);
    const setAiLabel = useComposeStore(s => s.setAiLabel);
    const location = useComposeStore(s => s.location);
    const coAuthors = useComposeStore(s => s.coAuthors);
    const shareToGroups = useComposeStore(s => s.shareToGroups);
    const topics = useComposeStore(s => s.topics);
    const shareToStory = useComposeStore(s => s.shareToStory);
    const setShareToStory = useComposeStore(s => s.setShareToStory);
    const inFlight = useComposeStore(s => s.inFlight);
    const error = useComposeStore(s => s.error);

    const [openSheet, setOpenSheet] = useState(null);  // 'visibility' | 'location' | 'people' | 'groups' | 'topics' | null

    const primary = media[0];
    const isVideo = primary?.type === 'video';
    const isReel = isVideo && (primary?.durationSec || 0) > 0 && (primary?.height || 0) > (primary?.width || 0);
    const headerLabel = isReel ? 'New reel' : (isVideo ? 'New video' : 'New post');

    return (
        <div style={{
            position: 'fixed', inset: 0, background: '#fff', color: '#050505',
            display: 'flex', flexDirection: 'column', zIndex: 9999,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        }}>
            {/* ── Header ────────────────────────────────────── */}
            <div style={{
                height: HEADER_H, paddingTop: 'env(safe-area-inset-top, 0px)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 16px', borderBottom: '1px solid #e4e6eb',
                flexShrink: 0,
            }}>
                <button
                    onClick={onBack}
                    aria-label="Back"
                    style={{
                        background: 'none', border: 'none', color: '#050505',
                        fontSize: 22, padding: 8, cursor: 'pointer',
                    }}
                >&#x2190;</button>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{headerLabel}</div>
                <div style={{ width: 40 }} />
            </div>

            {/* ── Scrollable body ───────────────────────────── */}
            <div style={{
                flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
                paddingBottom: 24,
            }}>
                {/* Preview row: tile + visibility + AI label + description */}
                <div style={{ display: 'flex', gap: 12, padding: 16, alignItems: 'flex-start' }}>
                    <div style={{
                        position: 'relative', width: 96, height: 130,
                        borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                        background: '#1c1c1e',
                    }}>
                        {primary?.type === 'photo' ? (
                            <img src={primary.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : primary?.type === 'video' ? (
                            <video
                                src={primary.url}
                                muted
                                playsInline
                                preload="metadata"
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                        ) : (
                            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg,#1a1a2e,#16213e)' }} />
                        )}
                        {isVideo && (
                            <button
                                onClick={onEditCover}
                                aria-label="Edit cover"
                                style={{
                                    position: 'absolute', top: 6, left: 6,
                                    background: 'rgba(0,0,0,0.7)', color: '#fff',
                                    border: 'none', borderRadius: 6,
                                    padding: '4px 8px', fontSize: 12, fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >Edit</button>
                        )}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <button
                            onClick={() => setOpenSheet('visibility')}
                            style={{
                                background: 'none', border: '1px solid #e4e6eb', borderRadius: 999,
                                padding: '4px 10px', fontSize: 13, fontWeight: 600,
                                color: '#050505', cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                            }}
                        >
                            <span aria-hidden="true">&#x1F310;</span>
                            {visibilityLabel[audienceMode] || 'Public'}
                            <span aria-hidden="true" style={{ fontSize: 10 }}>&#x25BE;</span>
                        </button>
                        <button
                            onClick={() => setAiLabel(!aiLabel)}
                            style={{
                                background: aiLabel ? '#1877F2' : 'none',
                                color: aiLabel ? '#fff' : '#050505',
                                border: aiLabel ? '1px solid #1877F2' : '1px solid #e4e6eb',
                                borderRadius: 999,
                                padding: '4px 10px', fontSize: 13, fontWeight: 600,
                                cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
                            }}
                        >
                            <span aria-hidden="true">&#x2795;</span>
                            AI label {aiLabel ? 'on' : 'off'}
                            <span aria-hidden="true" style={{ fontSize: 10 }}>&#x25BE;</span>
                        </button>
                        <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder={isReel ? 'Describe your reel. You can also add hashtags or tag @ people…' : "What's on your mind?"}
                            rows={3}
                            style={{
                                width: '100%', resize: 'none', border: 'none', outline: 'none',
                                background: 'transparent', fontSize: 15, lineHeight: 1.4,
                                fontFamily: 'inherit', color: '#050505',
                                padding: 0,
                            }}
                        />
                    </div>
                </div>

                {/* Rows */}
                <Row
                    icon="&#x1F4CD;"
                    label="Location"
                    value={location?.name}
                    onClick={() => setOpenSheet('location')}
                />
                <Row
                    icon="&#x1F465;"
                    label="Tag people"
                    value={coAuthors.length > 0 ? `${coAuthors.length} tagged` : ''}
                    onClick={() => setOpenSheet('people')}
                />
                <Row
                    icon="&#x1F4DA;"
                    label="Share to groups"
                    value={shareToGroups.length > 0 ? `${shareToGroups.length} group${shareToGroups.length > 1 ? 's' : ''}` : ''}
                    onClick={() => setOpenSheet('groups')}
                />
                <Row
                    icon="&#x1F516;"
                    label="Add topics"
                    value={topics.length > 0 ? topics.slice(0, 2).join(', ') + (topics.length > 2 ? '…' : '') : ''}
                    onClick={() => setOpenSheet('topics')}
                />

                {/* Share to story toggle */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderTop: '1px solid #e4e6eb',
                }}>
                    <span aria-hidden="true" style={{ fontSize: 18, width: 24, textAlign: 'center', color: '#65676B' }}>&#x1F4D6;</span>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>Share to your story</span>
                    <label style={{ position: 'relative', display: 'inline-block', width: 48, height: 28 }}>
                        <input
                            type="checkbox"
                            checked={shareToStory}
                            onChange={(e) => setShareToStory(e.target.checked)}
                            style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                            position: 'absolute', cursor: 'pointer',
                            inset: 0, background: shareToStory ? '#1877F2' : '#bcc0c4',
                            borderRadius: 14, transition: 'background 0.2s',
                        }} />
                        <span style={{
                            position: 'absolute',
                            top: 2, left: shareToStory ? 22 : 2,
                            width: 24, height: 24, borderRadius: 12,
                            background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            transition: 'left 0.2s',
                        }} />
                    </label>
                </div>

                {error && (
                    <div style={{
                        margin: '12px 16px',
                        padding: '10px 12px', borderRadius: 8,
                        background: '#fdecea', color: '#a02622',
                        fontSize: 13, lineHeight: 1.4,
                    }}>{error}</div>
                )}
            </div>

            {/* ── Sticky Post-now CTA ───────────────────────── */}
            <div style={{
                flexShrink: 0, padding: '12px 16px',
                paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                borderTop: '1px solid #e4e6eb', background: '#fff',
            }}>
                <button
                    onClick={inFlight ? undefined : onPostNow}
                    disabled={inFlight}
                    style={{
                        width: '100%', height: 48, borderRadius: 8,
                        background: inFlight ? '#bcc0c4' : '#1877F2',
                        color: '#fff', border: 'none',
                        fontSize: 16, fontWeight: 600,
                        cursor: inFlight ? 'wait' : 'pointer',
                    }}
                >{inFlight ? 'Posting…' : 'Post now'}</button>
            </div>

            {/* ── Sheets ────────────────────────────────────── */}
            {openSheet === 'visibility' && (
                <VisibilityPickerSheet onClose={() => setOpenSheet(null)} />
            )}
            {openSheet === 'location' && (
                <LocationPickerSheet onClose={() => setOpenSheet(null)} />
            )}
            {openSheet === 'people' && (
                <TagPeopleSheet onClose={() => setOpenSheet(null)} />
            )}
            {openSheet === 'groups' && (
                <ShareToGroupsSheet onClose={() => setOpenSheet(null)} />
            )}
            {openSheet === 'topics' && (
                <AddTopicsSheet onClose={() => setOpenSheet(null)} />
            )}
        </div>
    );
}
