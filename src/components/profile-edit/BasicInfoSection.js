import React from 'react';
import dynamic from 'next/dynamic';
import { C } from './constants';
import { supabase } from '../../lib/supabase';
import { getProfileJwt } from './utils';
import { ProfilePictureHistory } from '../social/ProfilePictureHistory';
const CollapsibleSection = dynamic(() => import('./CollapsibleSection'), { ssr: false });
const ProfileField = dynamic(() => import('./ProfileField'), { ssr: false });
const PokerResumeBadge = dynamic(() => import('./PokerResumeBadge'), { ssr: false });

// usernameStatus, user, setLibraryOpen, setOriginalProfile and setMessage all
// exist in pages/hub/profile-edit.js and were referenced here after the split
// without ever being passed or destructured. The username availability hint
// and the whole avatar block threw ReferenceError on render.
export default function BasicInfoSection({
    profile,
    updateField,
    setProfile,
    usernameStatus,
    user,
    setLibraryOpen,
    setOriginalProfile,
    setMessage,
}) {
    return (
<CollapsibleSection id="sec-basic" title="Basic Information" icon="👤">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            <ProfileField label="First Name" value={profile.first_name} onChange={updateField('first_name')} placeholder="John" icon="📛" maxLength={50} />
                            <ProfileField label="Last Name" value={profile.last_name} onChange={updateField('last_name')} placeholder="Doe" icon="📛" maxLength={50} />
                            <div>
                                <ProfileField
                                    label="Username"
                                    value={profile.username}
                                    onChange={updateField('username')}
                                    placeholder="@JohnDoe"
                                    icon="@"
                                    maxLength={30}
                                    suffix={usernameStatus === 'checking' ? '⟳' : usernameStatus === 'available' ? '✅' : usernameStatus === 'taken' ? '❌' : null}
                                />
                                {/* Username validation label */}
                                {usernameStatus !== 'idle' && (
                                    <div style={{
                                        fontSize: 11, fontWeight: 600, marginTop: -12, marginBottom: 8, paddingLeft: 2,
                                        color: usernameStatus === 'available' ? '#42B72A'
                                            : usernameStatus === 'taken' ? '#FA383E'
                                            : '#888'
                                    }}>
                                        {usernameStatus === 'checking' && 'Checking availability...'}
                                        {usernameStatus === 'available' && 'Username is available'}
                                        {usernameStatus === 'taken' && 'Username is already taken'}
                                    </div>
                                )}
                            </div>
                        </div>
                        <ProfileField label="Bio" value={profile.bio} onChange={updateField('bio')} type="textarea" placeholder="Tell Us About Yourself And Your Poker Journey..." icon="" maxLength={500} showCount />

                        {/* Profile Picture History */}
                        <ProfilePictureHistory
                            userId={user?.id}
                            supabase={supabase}
                            onViewAll={() => setLibraryOpen(true)}
                            limit={6}
                            onPictureRestored={async (item) => {
                                const newUrl = item.thumbnail_url || item.public_url;
                                try {
                                    // 1. Sync Auth Metadata
                                    const _avatarToken = getProfileJwt();
                                    await fetch('/api/auth/update-metadata', {
                                        method: 'POST',
                                        headers: { 'Authorization': `Bearer ${_avatarToken}`, 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ metadata: { avatar_url: newUrl } })
                                    });

                                    // 2. Update local state
                                    setProfile(prev => ({ ...prev, avatar_url: newUrl }));
                                    setOriginalProfile(prev => ({ ...prev, avatar_url: newUrl }));
                                    
                                    // 3. Dispatch event for header/identity update
                                    window.dispatchEvent(new CustomEvent('profile-updated', {
                                        detail: { avatar_url: newUrl }
                                    }));
                                    
                                    setMessage('Profile picture restored!');
                                } catch (err) {
                                    setMessage('Error syncing restored picture: ' + err.message);
                                }
                            }}
                        />
                    </CollapsibleSection>
    );
}
