/**
 * Universal links (iOS) and App Links (Android) for the Club Arena app.
 *
 * Both platforms verify that smarter.poker really does want the app to open
 * /hub/club-arena/* by fetching a well-known file from this origin:
 *
 *   /.well-known/apple-app-site-association   (no extension, JSON body)
 *   /.well-known/assetlinks.json
 *
 * The values inside are Dan's: the Apple Team ID and the SHA-256 of the
 * Android release signing certificate (Club Arena CLAUDE.md 10.84 - an agent
 * never sets a credential, it says where one lives). They are read from the
 * environment at request time, so until they exist both files are a 404 -
 * which the OS treats as "no app links here", exactly as today - and the day
 * they are set on Vercel the links go live with no deploy.
 *
 * Kept as plain functions with no imports so __tests__ can require them.
 */

const BUNDLE_ID = 'poker.smarter.clubarena';
const PATHS = ['/hub/club-arena', '/hub/club-arena/*'];

function cleanTeamId(raw) {
  const v = String(raw || '').trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(v) ? v : null;
}

function cleanFingerprints(raw) {
  return String(raw || '')
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
}

function buildAasa(teamId) {
  const appID = `${teamId}.${BUNDLE_ID}`;
  return {
    applinks: {
      apps: [],
      details: [
        {
          appIDs: [appID],
          components: PATHS.map((p) => ({ '/': p, comment: 'Club Arena' })),
          // Legacy key for iOS 13 and earlier.
          paths: PATHS,
        },
      ],
    },
    webcredentials: { apps: [appID] },
  };
}

function buildAssetLinks(fingerprints) {
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: BUNDLE_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

/** { status, body } for one of the two files, from the environment. */
function appLinksResponse(kind, env) {
  if (kind === 'aasa') {
    const teamId = cleanTeamId(env.APPLE_TEAM_ID);
    if (!teamId) return { status: 404, body: { error: 'APPLE_TEAM_ID is not configured' } };
    return { status: 200, body: buildAasa(teamId) };
  }
  if (kind === 'assetlinks') {
    const prints = cleanFingerprints(env.ANDROID_RELEASE_CERT_SHA256);
    if (prints.length === 0) {
      return { status: 404, body: { error: 'ANDROID_RELEASE_CERT_SHA256 is not configured' } };
    }
    return { status: 200, body: buildAssetLinks(prints) };
  }
  return { status: 404, body: { error: 'unknown' } };
}

module.exports = { BUNDLE_ID, PATHS, cleanTeamId, cleanFingerprints, buildAasa, buildAssetLinks, appLinksResponse };
