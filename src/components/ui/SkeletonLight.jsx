/**
 * SkeletonLight — shimmer placeholder for light-theme hub pages (Facebook-style)
 *
 * Usage:
 *   import SkeletonLight from '../../src/components/ui/SkeletonLight';
 *
 *   {loading && <SkeletonLight variant="feed" />}
 *   {loading && <SkeletonLight variant="cards" count={3} />}
 *   {loading && <SkeletonLight variant="list" rows={6} />}
 *   {loading && <SkeletonLight variant="profile" />}
 *   {loading && <SkeletonLight variant="table" rows={8} />}
 */

const CSS = `
@keyframes sk-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.sk-light {
  background: linear-gradient(90deg, #F0F2F5 25%, #E4E6EB 50%, #F0F2F5 75%);
  background-size: 200% 100%;
  animation: sk-shimmer 1.4s ease-in-out infinite;
  border-radius: 6px;
}
`;

function Box({ w = '100%', h = 14, r = 6, mb = 0, style = {} }) {
    return (
        <div className="sk-light" style={{
            width: w, height: h, borderRadius: r,
            marginBottom: mb, flexShrink: 0, ...style
        }} />
    );
}

// ── Feed post skeleton (matches PostCard shape)
function FeedItem() {
    return (
        <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, border: '1px solid #E4E6EB' }}>
            {/* Avatar + name + time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Box w={44} h={44} r={22} />
                <div style={{ flex: 1 }}>
                    <Box w="45%" h={14} mb={6} />
                    <Box w="28%" h={11} />
                </div>
            </div>
            {/* Post text */}
            <Box w="100%" h={13} mb={8} />
            <Box w="85%" h={13} mb={8} />
            <Box w="60%" h={13} mb={12} />
            {/* Media placeholder */}
            <Box w="100%" h={180} r={8} mb={12} />
            {/* Action bar */}
            <div style={{ display: 'flex', gap: 8 }}>
                <Box w={72} h={32} r={8} />
                <Box w={72} h={32} r={8} />
                <Box w={72} h={32} r={8} />
            </div>
        </div>
    );
}

// ── Card grid skeleton (venue / club cards)
function CardItem() {
    return (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E4E6EB', overflow: 'hidden' }}>
            <Box w="100%" h={100} r={0} mb={0} />
            <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <Box w={40} h={40} r={20} />
                    <div style={{ flex: 1 }}>
                        <Box w="60%" h={14} mb={6} />
                        <Box w="40%" h={11} />
                    </div>
                </div>
                <Box w="80%" h={12} mb={6} />
                <Box w="55%" h={12} mb={12} />
                <div style={{ display: 'flex', gap: 8 }}>
                    <Box w="50%" h={34} r={8} />
                    <Box w="50%" h={34} r={8} />
                </div>
            </div>
        </div>
    );
}

// ── List row skeleton (tournament / game rows)
function ListRow() {
    return (
        <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 8, border: '1px solid #E4E6EB', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Box w={44} h={44} r={8} />
            <div style={{ flex: 1 }}>
                <Box w="55%" h={14} mb={7} />
                <Box w="35%" h={11} />
            </div>
            <Box w={64} h={28} r={8} />
        </div>
    );
}

// ── Table row skeleton
function TableRow({ cols = [30, 25, 20, 25] }) {
    return (
        <div style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #F0F2F5', alignItems: 'center' }}>
            {cols.map((w, i) => <Box key={i} w={`${w}%`} h={13} />)}
        </div>
    );
}

// ── Profile header skeleton
function Profile() {
    return (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 10, border: '1px solid #E4E6EB' }}>
            <Box w="100%" h={140} r={8} mb={16} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 16 }}>
                <Box w={80} h={80} r={40} style={{ marginTop: -40, border: '3px solid #fff' }} />
                <div style={{ flex: 1 }}>
                    <Box w="45%" h={18} mb={8} />
                    <Box w="30%" h={13} />
                </div>
                <Box w={100} h={36} r={8} />
            </div>
            <Box w="75%" h={13} mb={6} />
            <Box w="55%" h={13} mb={16} />
            <div style={{ display: 'flex', gap: 24 }}>
                <Box w={64} h={36} r={8} />
                <Box w={64} h={36} r={8} />
                <Box w={64} h={36} r={8} />
            </div>
        </div>
    );
}

export default function SkeletonLight({ variant = 'feed', rows = 3, count = 3 }) {
    return (
        <>
            <style>{CSS}</style>

            {variant === 'feed' && Array.from({ length: rows }).map((_, i) => <FeedItem key={i} />)}

            {variant === 'cards' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {Array.from({ length: count }).map((_, i) => <CardItem key={i} />)}
                </div>
            )}

            {variant === 'list' && Array.from({ length: rows }).map((_, i) => <ListRow key={i} />)}

            {variant === 'table' && (
                <div style={{ background: '#fff', borderRadius: 12, padding: '0 14px', border: '1px solid #E4E6EB' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', gap: 12, padding: '14px 0', borderBottom: '2px solid #F0F2F5' }}>
                        {[30, 25, 20, 25].map((w, i) => <Box key={i} w={`${w}%`} h={13} style={{ opacity: 0.6 }} />)}
                    </div>
                    {Array.from({ length: rows }).map((_, i) => <TableRow key={i} />)}
                </div>
            )}

            {variant === 'profile' && <Profile />}
        </>
    );
}
