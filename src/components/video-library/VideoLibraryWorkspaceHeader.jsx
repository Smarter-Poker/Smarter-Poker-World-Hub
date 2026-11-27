/**
 * VideoLibraryWorkspaceHeader: the premium image mast for every Video Library
 * page (index, channels, players, playlists, watch, owner).
 *
 * Dan, 2026-11-27: "DO THE VIDEO LIBRARY PAGES THE SAME WAY AND SAME STYLE" as
 * the Club Arena Player Stats page. That page's mast (ArenaWorkspaceHeader in
 * the Club Arena repo) is a bevelled chrome readout frame with a medallion on
 * the left, a small eyebrow, a chrome italic title and scene art on the right,
 * and the chrome "?" tucked into the upper-right corner. This is the same mast
 * for the World Hub.
 *
 * #SmarterDesign (Dan, 2026-11-27): the "?" is the same dynamic chrome icon as
 * the Club Arena Cashier header (copied byte for byte from Club Arena's
 * public/images/header-help-v4.png), sits in the upper-right corner as close to
 * the edges as possible without touching the frame, and a Back button never
 * goes inside the mast (the global header above it carries Back).
 *
 * Explanations that used to sit on the page as grey sentences live behind the
 * "?" as `helpSteps`, each `{ id, title, body, target }` where `target` names a
 * `data-tutorial="..."` element on the page (or null). Copy is Title Case, no
 * em dashes (the popup rule).
 *
 * API (stable; lane C's sub pages build on it):
 *   title       string, required. The page's h1.
 *   eyebrow     string. Small uppercase line above the title.
 *   context     string. Alias of eyebrow (Player Stats calls it context).
 *   helpSteps   array of tutorial steps. With none, the "?" is not rendered.
 *   helpTitle   string. Title of the help tour (defaults to `title`).
 *   helpId      string. Stable tour id (defaults to a slug of the title).
 *   art         string. Scene image URL (defaults to the Video Library art).
 *   emblem      'play' | 'channel' | 'player' | 'playlist' | 'owner'.
 *   id          string. id for the h1 (aria-labelledby targets).
 *   children    optional live controls rendered under the lettering.
 */
import { useCallback, useState } from 'react';
import PageTutorial from '../tutorial/PageTutorial';
import styles from './VideoLibraryWorkspaceHeader.module.css';

export const VIDEO_LIBRARY_MAST_ART = '/assets/video-library/mast/video-library-mast-v1.webp';
export const VIDEO_LIBRARY_HELP_ICON = '/assets/video-library/mast/header-help-chrome-v1.png';

const slug = (value) => String(value || 'video-library')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'video-library';

function MastEmblem({ kind }) {
    if (kind === 'player') return <span className={styles.emblemPlayer}><i /></span>;
    if (kind === 'playlist') return <span className={styles.emblemPlaylist}><i /><i /><i /></span>;
    if (kind === 'channel') return <span className={styles.emblemChannel}><i /></span>;
    if (kind === 'owner') return <span className={styles.emblemOwner}><i /></span>;
    return <span className={styles.emblemPlay}><i /></span>;
}

export default function VideoLibraryWorkspaceHeader({
    title,
    eyebrow,
    context,
    helpSteps,
    helpTitle,
    helpId,
    art = VIDEO_LIBRARY_MAST_ART,
    emblem = 'play',
    id,
    children,
}) {
    const [helpOpen, setHelpOpen] = useState(false);
    const closeHelp = useCallback(() => setHelpOpen(false), []);
    const steps = Array.isArray(helpSteps) ? helpSteps.filter(Boolean) : [];
    const tourId = `video-library-${helpId || slug(title)}`;
    const tutorial = steps.length ? {
        id: tourId,
        title: helpTitle || title,
        storageKey: `${tourId}-help-seen-v1`,
        steps,
    } : null;
    const kicker = eyebrow || context || 'Smarter.Poker';

    return (
        <>
            <header className={styles.mast} data-video-library-mast={emblem} data-tutorial="mast">
                <div className={styles.panorama} aria-hidden="true" style={art ? { backgroundImage: `url(${art})` } : undefined} />
                <div className={styles.medallion} aria-hidden="true">
                    <MastEmblem kind={emblem} />
                </div>
                <div className={styles.lettering}>
                    <span className={styles.eyebrow}>{kicker}</span>
                    <h1 id={id} className={styles.title}>{title}</h1>
                    {children ? <div className={styles.extra}>{children}</div> : null}
                </div>
                {tutorial && (
                    <button
                        type="button"
                        className={styles.help}
                        aria-label="Page Help"
                        aria-expanded={helpOpen}
                        onClick={() => setHelpOpen(open => !open)}
                        data-page-help=""
                    >
                        <img className={styles.helpIcon} src={VIDEO_LIBRARY_HELP_ICON} alt="" width={36} height={37} draggable={false} />
                    </button>
                )}
            </header>
            {tutorial && <PageTutorial tutorial={tutorial} open={helpOpen} onClose={closeHelp} />}
        </>
    );
}
