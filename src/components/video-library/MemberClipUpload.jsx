import Link from 'next/link';

// The canonical Reels upload route owns authentication, Storage, durable
// recovery and atomic publication. Keep one uploader and one publication path.
export const MEMBER_CLIP_UPLOAD_PATH = '/hub/reels?category=poker&upload=1';

export default function MemberClipUpload() {
    return <section className="vl-member-clips" aria-label="Member Poker Clips">
        <Link href={MEMBER_CLIP_UPLOAD_PATH}>Upload Poker Clip</Link>
        <p>Share Your Own Poker Clip In Poker Reels. Sign In And Confirm Your Sharing Rights Before Publishing.</p>
    </section>;
}
