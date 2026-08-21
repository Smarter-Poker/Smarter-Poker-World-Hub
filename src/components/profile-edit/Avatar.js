/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  PROFILE AVATAR — display only
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Dan 2026-08-21: "they can now only use avatars."
 *
 * This used to be the Hub's profile-picture uploader: the whole circle was a
 * click target, it held a hidden `<input type="file" accept="image/*">`, and a
 * 📷 badge advertised it. Picking a file ran `handleAvatarUpload` in
 * profileHandlers.js, which pushed the photo to `social-media/avatars/<uid>/`,
 * PATCHed `profiles.avatar_url`, and — notably — set `user_avatars.is_active`
 * to false so the photo would beat any avatar the player had chosen.
 *
 * All of that is gone. The avatar is now a picture, not a button.
 *
 * The player changes it at /hub/avatars, which is the library + AI generator.
 * `onChangeHref` is what points there, so this component does not need to know
 * the route.
 *
 * The rule is NOT enforced here. Club Arena's AvatarService.isLibraryAvatarUrl
 * refuses a non-library URL at the write point, because an affordance that has
 * simply been removed from a component is not a rule — a cached bundle still
 * has the old one.
 */
import { C } from './constants';

function Avatar({ src, size = 120, onChangeHref = '/hub/avatars' }) {
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <img
        src={src || '/default-avatar.png'}
        alt="Profile"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '4px solid white',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      />
      {/* Replaces the camera badge. It is a link rather than a file picker:
          the only way to change an avatar now is to choose one. */}
      <a
        href={onChangeHref}
        title="Choose a new avatar"
        aria-label="Choose a new avatar"
        style={{
          position: 'absolute',
          bottom: 4,
          right: 4,
          minWidth: 32,
          height: 32,
          padding: '0 10px',
          borderRadius: 16,
          background: C.card,
          color: C.text,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          textDecoration: 'none',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          border: `1px solid ${C.border}`,
        }}
      >
        Change
      </a>
    </div>
  );
}

export default Avatar;
