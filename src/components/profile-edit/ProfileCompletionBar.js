

function ProfileCompletionBar({ profile }) {
    const fields = [
        { key: 'avatar_url', label: 'Profile Photo', weight: 15 },
        { key: 'cover_photo_url', label: 'Cover Photo', weight: 10 },
        { key: 'username', label: 'Username', weight: 15 },
        { key: 'bio', label: 'Bio', weight: 15 },
        { key: 'first_name', label: 'First Name', weight: 10 },
        { key: 'birthday', label: 'Birthday', weight: 5 },
        { key: 'home_casino', label: 'Home Casino', weight: 10 },
        { key: 'favorite_game', label: 'Favorite Game', weight: 5 },
        { key: 'favorite_hand', label: 'Favorite Hand', weight: 5 },
        { key: 'hendon_url', label: 'Poker Resume', weight: 10 },
    ];
    const completed = fields.filter(f => {
        const val = profile[f.key];
        if (!val) return false;
        if (typeof val === 'string' && !val.trim()) return false;
        return true;
    });
    const totalWeight = fields.reduce((s, f) => s + f.weight, 0);
    const earnedWeight = completed.reduce((s, f) => s + f.weight, 0);
    const percent = Math.round((earnedWeight / totalWeight) * 100);
    const missing = fields.filter(f => !completed.includes(f));

    if (percent >= 100) return null; // Don't show if complete

    const barColor = percent >= 80 ? '#42B72A' : percent >= 50 ? '#1877F2' : '#ff6b6b';

    return (
        <div style={{
            background: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16,
            border: '1px solid #DADDE1',
            width: '100%', boxSizing: 'border-box'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#050505' }}>Profile Strength</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: barColor }}>{percent}%</span>
            </div>
            <div style={{ height: 8, background: '#E4E6EB', borderRadius: 4, overflow: 'hidden', width: '100%' }}>
                <div style={{
                    height: '100%', width: `${percent}%`, borderRadius: 4,
                    background: `linear-gradient(90deg, ${barColor}, ${barColor}aa)`,
                    transition: 'width 0.6s ease-out',
                }} />
            </div>
            {missing.length > 0 && missing.length <= 4 && (
                <div style={{ fontSize: 11, color: '#65676B', marginTop: 8 }}>
                    Add: {missing.map(f => f.label).join(', ')}
                </div>
            )}
        </div>
    );
}

export default ProfileCompletionBar;
