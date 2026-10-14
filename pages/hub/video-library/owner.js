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

const UniversalHeader = dynamic(() => import('../../../src/components/ui/UniversalHeader'), { ssr: false });

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
            <main className={styles.panel} data-video-library-owner-panel>
                <nav className="vl-breadcrumbs" aria-label="Breadcrumb"><Link href="/hub/video-library">Video Library</Link><span aria-hidden="true">/</span><span aria-current="page">Control Panel</span></nav>
                <h1>Control Panel</h1><p>Manage Video Sources, Editorial Review, Rights And Delivery.</p>
                {!ownerId ? <p><Link className={styles.action} href="/auth/login?redirect=%2Fhub%2Fvideo-library%2Fowner">Sign In To Open The Control Panel</Link></p>
                    : current?.status === 'denied' ? <p role="alert">An Owner Or Admin Account Is Required To Open The Control Panel.</p>
                        : current?.status === 'error' ? <><p role="alert">{current.error}</p><button className={styles.action} type="button" onClick={() => setRevision(value => value + 1)}>Reload Control Panel</button></>
                            : current?.status === 'ready' ? <>
                                <div className={styles.toolbar}><p>Current Snapshot. Updated {new Date(current.snapshot.generatedAt).toLocaleString()}.</p><button className={styles.action} type="button" onClick={() => setRevision(value => value + 1)}>Refresh</button></div>
                                <dl className={styles.metrics}>{current.metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value.toLocaleString()}</dd></div>)}</dl>
                                <p className={styles.note}>Qualified Study Sessions Count Verified Learning Events. Individual Learner Identities Remain Private.</p>
                                <nav className={styles.tools} aria-label="Owner Tools">{VIDEO_OWNER_TOOLS.map(tool => <Link key={tool.href} href={tool.href}><h2>{tool.title}</h2><p>{tool.description}</p><span>Open {tool.title}</span></Link>)}</nav>
                                <section><h2>Pipeline Status</h2>{current.snapshot.controls.length ? <ul className={styles.controls}>{current.snapshot.controls.map(control => <li key={control.control_key}><span>{control.control_key.replaceAll('_', ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase())}</span><strong>{control.enabled ? 'Enabled' : 'Paused'}</strong></li>)}</ul> : <p>No Pipeline Controls Were Reported.</p>}<Link className={styles.action} href="/hub/admin/video-operations">Manage Pipeline Controls</Link></section>
                            </> : <p role="status">Loading Control Panel</p>}
            </main>
        </HubPageShell></div></>;
}
