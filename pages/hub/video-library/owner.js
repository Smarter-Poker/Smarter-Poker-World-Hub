// World stylesheets load with the pages that use them, not from _app
// (__tests__/site-wide-payload-budget.test.mjs). First, so they keep the
// cascade position they had at the end of the global sheet.
import '../../../src/styles/worlds/video-library.css';
import '../../../src/styles/worlds/video-library-pages.css';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import HubPageShell from '../../../src/components/ui/HubPageShell';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { getAccessToken, getAuthUserId } from '../../../src/lib/authUtils';
import { createVideoLibraryOwnerScope } from '../../../src/lib/videoLibraryOwnerScope.mjs';
import { VIDEO_OWNER_TOOLS, summarizeVideoOwnerSnapshot } from '../../../src/lib/videoLibraryOwnerPanel.mjs';
import styles from '../../../src/components/video-library/OwnerPanel.module.css';
import VideoLibraryWorkspaceHeader from '../../../src/components/video-library/VideoLibraryWorkspaceHeader';
import { VIDEO_LIBRARY_HELP_STEPS } from '../../../src/lib/videoLibraryHelpSteps.mjs';

const UniversalHeader = dynamic(() => import('../../../src/components/ui/UniversalHeader'), { ssr: false });

// Help steps live in the shared Video Library help standard (src/lib/videoLibraryHelpSteps.mjs).
const OWNER_HELP_STEPS = VIDEO_LIBRARY_HELP_STEPS.owner;

export default function VideoLibraryOwnerPanel() {
    const { user } = useAvatar();
    const ownerId = user?.id || null;
    const scope = useRef(null);
    if (!scope.current) scope.current = createVideoLibraryOwnerScope(ownerId);
    scope.current.activate(ownerId);
    const [state, setState] = useState(null);
    const [revision, setRevision] = useState(0);
    const current = state && scope.current.isCurrent(state.owner) ? state : null;
    useEffect(() => {
        const owner = scope.current.capture(ownerId);
        const controller = new AbortController();
        let active = true;
        if (!ownerId) { setState(null); return () => controller.abort(); }
        setState({ owner, status: 'loading' });
        const deadline = setTimeout(() => controller.abort(), 15000);
        void (async () => {
            try {
                const token = getAccessToken();
                if (!token || getAuthUserId() !== ownerId) throw new Error('Sign In Again To Open The Control Panel.');
                const response = await fetch('/api/admin/video-operations?windowHours=24', { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
                const payload = await response.json();
                if (!response.ok) {
                    if ([401, 403].includes(response.status)) {
                        if (active && scope.current.isCurrent(owner)) setState({ owner, status: 'denied' });
                        return;
                    }
                    throw new Error('The Control Panel Could Not Be Loaded.');
                }
                const metrics = summarizeVideoOwnerSnapshot(payload.snapshot);
                if (getAuthUserId() !== ownerId) return;
                if (active && scope.current.isCurrent(owner)) setState({ owner, status: 'ready', snapshot: payload.snapshot, metrics });
            } catch (error) {
                if (active && scope.current.isCurrent(owner)) setState({ owner, status: 'error', error: controller.signal.aborted ? 'The Control Panel Took Too Long To Load.' : error.message });
            } finally { clearTimeout(deadline); }
        })();
        return () => { active = false; clearTimeout(deadline); controller.abort(); };
    }, [ownerId, revision]);
    return <><Head><title>Control Panel | Video Library</title><meta name="robots" content="noindex,nofollow" /></Head>
        <div className="video-library-page"><HubPageShell className="video-library" maxWidth={1200} header={<div className="vl-header-area"><div className="vl-global-header"><UniversalHeader pageDepth={2} /></div></div>}>
            <main className={`${styles.panel} vl-console-page`} data-video-library-owner-panel>
                <nav className="vl-breadcrumbs" aria-label="Breadcrumb"><Link href="/hub/video-library">Video Library</Link><span aria-hidden="true">/</span><span aria-current="page">Control Panel</span></nav>
                <VideoLibraryWorkspaceHeader title="Control Panel" eyebrow="Video Library" emblem="owner" helpId="owner" helpSteps={OWNER_HELP_STEPS} />
                {!ownerId ? <section className="vl-console-frame"><Link className="vl-pill-button is-primary" href="/auth/login?redirect=%2Fhub%2Fvideo-library%2Fowner" rel="nofollow" prefetch={false}>Sign In To Open The Control Panel</Link></section>
                    : current?.status === 'denied' ? <section className="vl-console-frame"><p role="alert">An Owner Or Admin Account Is Required To Open The Control Panel.</p></section>
                        : current?.status === 'error' ? <section className="vl-console-frame"><p role="alert">{current.error}</p><div className="vl-console-actions"><button className="vl-pill-button" type="button" onClick={() => setRevision(value => value + 1)}>Reload Control Panel</button></div></section>
                            : current?.status === 'ready' ? <>
                                <section className="vl-console-frame" data-tutorial="owner-metrics" aria-labelledby="vl-owner-snapshot"><h2 id="vl-owner-snapshot" className="vl-console-frame-title">Last 24 Hours</h2><p className="vl-console-updated">Updated {new Date(current.snapshot.generatedAt).toLocaleString()}</p>
                                <dl className="vl-console-stats">{current.metrics.map(metric => <div key={metric.label} className="vl-console-stat"><dt>{metric.label}</dt><dd>{metric.value.toLocaleString()}</dd></div>)}</dl>
                                <div className="vl-console-actions"><button className="vl-pill-button" type="button" onClick={() => setRevision(value => value + 1)}>Refresh</button></div></section>
                                <section className="vl-console-frame" data-tutorial="owner-tools" aria-labelledby="vl-owner-tools"><h2 id="vl-owner-tools" className="vl-console-frame-title">Owner Tools</h2><nav className="vl-console-tools" aria-label="Owner Tools">{VIDEO_OWNER_TOOLS.map(tool => <Link key={tool.href} className="vl-console-tool" href={tool.href}>Open {tool.title}</Link>)}</nav></section>
                                <section className="vl-console-frame" data-tutorial="owner-pipeline" aria-labelledby="vl-owner-pipeline"><h2 id="vl-owner-pipeline" className="vl-console-frame-title">Pipeline Status</h2>{current.snapshot.controls.length ? <ul className="vl-console-controls">{current.snapshot.controls.map(control => <li key={control.control_key}><span>{control.control_key.replaceAll('_', ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase())}</span><strong data-enabled={control.enabled ? 'true' : 'false'}>{control.enabled ? 'Enabled' : 'Paused'}</strong></li>)}</ul> : <p className="vl-console-copy">No Pipeline Controls Were Reported.</p>}<div className="vl-console-actions"><Link className="vl-pill-button is-primary" href="/hub/admin/video-operations">Manage Pipeline Controls</Link></div></section>
                            </> : <section className="vl-console-frame"><p role="status">Loading Control Panel</p></section>}
            </main>
        </HubPageShell></div></>;
}
