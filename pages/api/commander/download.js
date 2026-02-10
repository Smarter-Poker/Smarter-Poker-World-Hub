// API route to serve Club Commander desktop downloads
// Redirects to GitHub release assets so users download from smarter.poker

const GITHUB_BASE = 'https://github.com/Smarter-Poker/club-commander-desktop/releases/download';
const TAG = 'v1.0.6';
const VERSION = '1.0.5';

const DOWNLOADS = {
    // Windows
    'win-setup': `${GITHUB_BASE}/${TAG}/Club.Commander.Setup.${VERSION}.exe`,
    'win-portable': `${GITHUB_BASE}/${TAG}/Club.Commander.${VERSION}.exe`,
    // macOS
    'mac-dmg': `${GITHUB_BASE}/${TAG}/Club.Commander-${VERSION}-arm64.dmg`,
    'mac-zip': `${GITHUB_BASE}/${TAG}/Club.Commander-${VERSION}-arm64-mac.zip`,
    // Linux
    'linux-appimage': `${GITHUB_BASE}/${TAG}/Club.Commander-${VERSION}.AppImage`,
    'linux-deb': `${GITHUB_BASE}/${TAG}/club-commander_${VERSION}_amd64.deb`,
};

export default function handler(req, res) {
    const { platform } = req.query;

    if (!platform || !DOWNLOADS[platform]) {
        return res.status(400).json({
            error: 'Invalid platform',
            valid: Object.keys(DOWNLOADS)
        });
    }

    // Redirect to GitHub release asset
    res.redirect(302, DOWNLOADS[platform]);
}
