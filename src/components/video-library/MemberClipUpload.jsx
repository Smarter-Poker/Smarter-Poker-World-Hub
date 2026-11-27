import Link from 'next/link';

// The canonical Reels upload route owns authentication, Storage, durable
// recovery and atomic publication. Keep one uploader and one publication path.
export const MEMBER_CLIP_UPLOAD_PATH = '/hub/reels?category=poker&upload=1';

export default function MemberClipUpload() {
    // The sharing-rights explanation lives behind the library's "?" help
    // (VIDEO_LIBRARY_HELP_STEPS, step "upload"), Dan 2026-11-27.
    return <section className="vl-member-clips" aria-label="Member Poker Clips" data-tutorial="upload">
        <Link href={MEMBER_CLIP_UPLOAD_PATH}>Upload Poker Clip</Link>
    </section>;
}
