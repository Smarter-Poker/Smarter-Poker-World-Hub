import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser } from '../../src/lib/authUtils';
import styles from './horses.module.css';
import shared from '../../src/components/horses/shared.module.css';
import { T, num } from '../../src/lib/horsesAdminTokens';
import {
  TABS, DEFAULT_TAB, DEFAULT_CA_SECTION, visibleTabs,
} from '../../src/components/horses/tabRegistry';
import {
  resolveInitialTab, resolveInitialSection, urlMatchesState, nextUrlQuery, urlNeedsNormalising,
} from '../../src/components/horses/urlState';
import {
  permittedTabs, permissionsFromPayload, operatorIdFromPayload, relocationTarget,
  isOperatorDenial, operatorRoleFromPayload, operatorContextChange,
} from '../../src/components/horses/operatorPermissions';
import { normalizePolicy } from '../../src/components/horses/approvalModel';
import { policyUrl } from '../../src/components/horses/operatorAdmin';
import { panelComponentFor } from '../../src/components/horses/dynamicPanels';
import ErrorBoundary from '../../src/components/horses/ErrorBoundary';
import ExportArtifactCenter from '../../src/components/horses/ExportArtifactCenter';
import useOperatorFetch from '../../src/components/horses/useOperatorFetch';
import useStableAdminStore, {
  selectApplyOperatorContext,
  selectNavigationBadges,
  selectOperatorAloneRule,
  selectOperatorId,
  selectOperatorPermissions,
  selectOperatorPolicy,
  selectOperatorRole,
  selectPatchOperatorContext,
  selectPermissionsDegraded,
  selectResetOperatorContext,
  selectSocialSettings,
} from '../../src/stores/stableAdminStore';

const HORSES_PANEL_ID = 'horses-panel';
const ACCESS_DENIED_MESSAGE = 'Access Denied. This Account Is Not An Operator.';
const VERIFY_FAILED_MESSAGE = 'Operator Access Could Not Be Verified. Try Again.';

export default function HorsesAdmin() {
  const router = useRouter();
  const authFetch = useOperatorFetch();
  const permissions = useStableAdminStore(selectOperatorPermissions);
  const policy = useStableAdminStore(selectOperatorPolicy);
  const operatorId = useStableAdminStore(selectOperatorId);
  const operatorRole = useStableAdminStore(selectOperatorRole);
  const aloneRule = useStableAdminStore(selectOperatorAloneRule);
  const permissionsDegraded = useStableAdminStore(selectPermissionsDegraded);
  const badges = useStableAdminStore(selectNavigationBadges);
  const socialSettings = useStableAdminStore(selectSocialSettings);
  const applyOperatorContext = useStableAdminStore(selectApplyOperatorContext);
  const patchOperatorContext = useStableAdminStore(selectPatchOperatorContext);
  const resetOperatorContext = useStableAdminStore(selectResetOperatorContext);

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [activeTab, setActiveTab] = useState(DEFAULT_TAB);
  const [caSection, setCaSection] = useState(DEFAULT_CA_SECTION);
  const [notification, setNotification] = useState(null);
  const notifyTimer = useRef(null);
  const navRef = useRef(null);
  const urlHydratedRef = useRef(false);
  const urlSyncedRef = useRef(false);
  const pendingUrlStateRef = useRef(null);
  const queuedUrlStateRef = useRef(null);
  const startUrlWriteRef = useRef(null);
  const latestUrlQueryRef = useRef(router.query);

  const showNotification = useCallback((message, type = 'success') => {
    if (notifyTimer.current) clearTimeout(notifyTimer.current);
    setNotification({ message: String(message || ''), type });
    notifyTimer.current = setTimeout(() => setNotification(null), 5000);
  }, []);

  useEffect(() => () => {
    if (notifyTimer.current) clearTimeout(notifyTimer.current);
  }, []);

  const applyPolicyEnvelope = useCallback((body, authUser) => {
    const current = useStableAdminStore.getState();
    applyOperatorContext({
      currentUser: authUser ? { id: authUser.id, email: authUser.email || null } : null,
      operatorId: operatorIdFromPayload(body, authUser?.id),
      operatorRole: operatorRoleFromPayload(body),
      permissions: permissionsFromPayload(body),
      policy: normalizePolicy(body?.policy),
      aloneRule: body?.aloneRule || null,
      permissionsDegraded: body?.operator?.degraded === true,
      navigationBadges: current.navigationBadges,
      socialSettings: current.socialSettings,
    }, authUser?.id);
  }, [applyOperatorContext]);

  const readOperatorContext = useCallback(async (authUser) => {
    try {
      const body = await authFetch(policyUrl());
      applyPolicyEnvelope(body, authUser);
      return { ok: true, body };
    } catch (error) {
      resetOperatorContext(authUser?.id || null);
      return { ok: false, denied: isOperatorDenial(error) };
    }
  }, [applyPolicyEnvelope, authFetch, resetOperatorContext]);

  const checkAuth = useCallback(async () => {
    try {
      const authUser = getAuthUser();
      if (!authUser?.id) return;
      const answer = await readOperatorContext(authUser);
      if (!answer.ok) {
        setLoginError(answer.denied ? ACCESS_DENIED_MESSAGE : VERIFY_FAILED_MESSAGE);
        return;
      }
      setUser(authUser);
    } catch {
      setLoginError('Could Not Reach The Authentication Service.');
    } finally {
      setLoading(false);
    }
  }, [readOperatorContext]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
        resetOperatorContext(null);
      }
    });
    return () => data?.subscription?.unsubscribe();
  }, [resetOperatorContext]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    Promise.allSettled([
      authFetch('/api/horses/club-arena-admin?section=badges'),
      // content_settings is not readable from a browser: the operator route
      // reads it with the service role.
      authFetch('/api/horses/stable-admin?action=read_settings'),
    ]).then(([badgeResult, settingsResult]) => {
      if (cancelled) return;
      if (badgeResult.status === 'fulfilled') {
        patchOperatorContext({ navigationBadges: badgeResult.value?.badges || null });
      }
      if (settingsResult.status === 'fulfilled') {
        patchOperatorContext({ socialSettings: settingsResult.value?.settings || null });
      }
    });
    return () => { cancelled = true; };
  }, [authFetch, patchOperatorContext, user?.id]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError('');
    setSigningIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword(loginForm);
      if (error) {
        setLoginError(error.message);
        return;
      }
      const answer = await readOperatorContext(data.user);
      if (!answer.ok) {
        if (answer.denied) await supabase.auth.signOut();
        setLoginError(answer.denied ? ACCESS_DENIED_MESSAGE : VERIFY_FAILED_MESSAGE);
        return;
      }
      setUser(data.user);
    } catch {
      setLoginError('Connection Failed.');
    } finally {
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    resetOperatorContext(null);
    setUser(null);
    setActiveTab(DEFAULT_TAB);
    setCaSection(DEFAULT_CA_SECTION);
    await supabase.auth.signOut();
  };

  const startUrlWrite = useCallback((state, method = 'push') => {
    queuedUrlStateRef.current = null;
    pendingUrlStateRef.current = state;
    const finishWrite = (reconcile = false) => {
      if (pendingUrlStateRef.current !== state) return;
      pendingUrlStateRef.current = null;
      const queued = queuedUrlStateRef.current;
      queuedUrlStateRef.current = null;
      if (queued) {
        startUrlWriteRef.current?.(queued, 'push');
        return;
      }
      if (reconcile && !urlMatchesState(state, latestUrlQueryRef.current)) {
        setActiveTab(resolveInitialTab(latestUrlQueryRef.current));
        setCaSection(resolveInitialSection(latestUrlQueryRef.current));
      }
    };
    let navigation;
    try {
      const target = { pathname: router.pathname, query: nextUrlQuery(state, router.query) };
      navigation = method === 'replace'
        ? router.replace(target, undefined, { shallow: true, scroll: false })
        : router.push(target, undefined, { shallow: true, scroll: false });
    } catch {
      finishWrite();
      return;
    }
    Promise.resolve(navigation)
      .then((completed) => finishWrite(completed === false))
      .catch(() => finishWrite(true));
  }, [router]);

  useEffect(() => {
    startUrlWriteRef.current = startUrlWrite;
  }, [startUrlWrite]);

  useEffect(() => {
    if (!router.isReady) return;
    latestUrlQueryRef.current = router.query;
    const pending = pendingUrlStateRef.current;
    if (pending) {
      if (urlMatchesState(pending, router.query)) {
        pendingUrlStateRef.current = null;
        const queued = queuedUrlStateRef.current;
        queuedUrlStateRef.current = null;
        if (queued) startUrlWriteRef.current?.(queued, 'push');
        return;
      }
      pendingUrlStateRef.current = null;
      queuedUrlStateRef.current = null;
    }
    setActiveTab(resolveInitialTab(router.query));
    setCaSection(resolveInitialSection(router.query));
    urlHydratedRef.current = true;
  }, [router.isReady, router.query.tab, router.query.section]);

  useEffect(() => {
    if (!router.isReady || !urlHydratedRef.current) return;
    const state = { activeTab, caSection };
    const pending = pendingUrlStateRef.current;
    if (pending) {
      queuedUrlStateRef.current = pending.activeTab === state.activeTab && pending.caSection === state.caSection
        ? null
        : state;
      return;
    }
    if (urlMatchesState(state, router.query)) {
      urlSyncedRef.current = true;
      if (urlNeedsNormalising(state, router.query)) {
        startUrlWrite(state, 'replace');
      }
      return;
    }
    if (!urlSyncedRef.current) return;
    startUrlWrite(state, 'push');
  }, [activeTab, caSection, router.isReady, startUrlWrite]);

  const navTabs = useMemo(
    () => permittedTabs(visibleTabs(TABS), permissions),
    [permissions],
  );

  useEffect(() => {
    const target = relocationTarget({ activeTab, tabs: visibleTabs(TABS), permissions });
    if (target) setActiveTab(target);
  }, [activeTab, permissions]);

  useEffect(() => {
    const element = navRef.current?.querySelector(`[data-tabid="${activeTab}"]`);
    if (!element?.scrollIntoView) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [activeTab, badges]);

  const onTabKeyDown = useCallback((event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentId = event.currentTarget.dataset.tabid;
    const current = navTabs.findIndex((tab) => tab.id === currentId);
    if (current < 0) return;
    let next = current;
    if (event.key === 'ArrowLeft') next = (current - 1 + navTabs.length) % navTabs.length;
    if (event.key === 'ArrowRight') next = (current + 1) % navTabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = navTabs.length - 1;
    const tab = navTabs[next];
    if (!tab) return;
    setActiveTab(tab.id);
    navRef.current?.querySelector(`[data-tabid="${tab.id}"]`)?.focus({ preventScroll: true });
  }, [navTabs]);

  const handlePolicyChange = useCallback((payload) => {
    const change = operatorContextChange(payload);
    const patch = { policy: normalizePolicy(change.policy) };
    if (change.aloneRule !== undefined) patch.aloneRule = change.aloneRule;
    if (change.permissions !== undefined) patch.permissions = change.permissions;
    patchOperatorContext(patch);
  }, [patchOperatorContext]);

  const handleScraperHealth = useCallback((health) => {
    const dead = Number(health?.summary?.deadCount || 0);
    patchOperatorContext({
      navigationBadges: { ...(useStableAdminStore.getState().navigationBadges || {}), deadScrapers: dead },
    });
  }, [patchOperatorContext]);

  if (loading) {
    return <div className={styles.loading}><span className={styles.logo}>SP</span><p>Loading Stable</p></div>;
  }

  if (!user) {
    return (
      <>
        <SEOHead title="Stable Admin" description="Smarter.Poker Staff Console." canonical="/horses">
          <meta name="robots" content="noindex, nofollow" />
        </SEOHead>
        <div className={styles.loginContainer}>
          <div className={styles.loginCard}>
            <div className={styles.loginHeader}><h1>STABLE</h1><p>Smarter.Poker Staff Console</p></div>
            <form onSubmit={handleLogin}>
              <div className={styles.inputGroup}>
                <label htmlFor="admin-email">Email</label>
                <input id="admin-email" type="email" autoComplete="username" required
                  value={loginForm.email}
                  onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} />
              </div>
              <div className={styles.inputGroup}>
                <label htmlFor="admin-password">Password</label>
                <input id="admin-password" type="password" autoComplete="current-password" required
                  value={loginForm.password}
                  onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
              </div>
              {loginError ? <div className={styles.error}>{loginError}</div> : null}
              <button type="submit" className={styles.loginBtn} disabled={signingIn}>
                {signingIn ? 'Signing In' : 'Enter The Stable'}
              </button>
            </form>
          </div>
        </div>
      </>
    );
  }

  const activeTabEntry = navTabs.find((tab) => tab.id === activeTab) || null;
  const Panel = activeTabEntry ? panelComponentFor(activeTabEntry.id) : null;
  const deadScrapers = Number(badges?.deadScrapers ?? badges?.scrapersDead ?? 0);
  const clubArenaBadge = Number(badges?.pendingCashouts || 0) + Number(badges?.ledgerCritical || 0);
  const bugReportBadge = Number(badges?.openTickets || 0);

  return (
    <>
      <Head><title>Stable Admin | Smarter.Poker</title><meta name="robots" content="noindex, nofollow" /></Head>
      <div className={styles.dashboard}>
        <div role="status" aria-live="polite" className={styles.srOnly}>{notification?.message || ''}</div>
        {notification ? (
          <div className={`${styles.notification} ${styles[notification.type] || ''}`}
            role={notification.type === 'error' ? 'alert' : 'status'}>
            {notification.message}
          </div>
        ) : null}
        <header className={styles.header}>
          <div className={styles.headerLeft}><h1>STABLE ADMIN</h1><span className={styles.subtitle}>Smarter.Poker Staff Console</span></div>
          <div className={styles.headerRight}>
            <div className={styles.engineStatus}>
              <span className={`${styles.statusDot} ${socialSettings?.engine_enabled ? styles.active : ''}`} />
              <span>{!socialSettings ? 'Content Engine Unknown' : socialSettings.engine_enabled ? 'Content Engine Running' : 'Content Engine Stopped'}</span>
            </div>
            <span className={styles.userInfo}>{user.email}{operatorRole ? <span style={{ color: T.accent, marginLeft: 6 }}>{operatorRole}</span> : null}</span>
            <button type="button" onClick={handleLogout} className={styles.logoutBtn}>Logout</button>
          </div>
        </header>
        <nav className={styles.nav} ref={navRef} aria-label="Console Sections">
          <div role="tablist" aria-label="Stable Admin Tabs" className={shared.tablist}>
            {navTabs.map((tab) => {
              const badge = tab.id === 'scrapers' ? deadScrapers
                : tab.id === 'clubarena' ? clubArenaBadge
                  : tab.id === 'bugreports' ? bugReportBadge : 0;
              return (
                <button key={tab.id} id={`horses-tab-${tab.id}`} data-tabid={tab.id}
                  role="tab" type="button" aria-selected={activeTab === tab.id}
                  aria-controls={HORSES_PANEL_ID} tabIndex={activeTab === tab.id ? 0 : -1}
                  className={activeTab === tab.id ? styles.active : ''}
                  onClick={() => setActiveTab(tab.id)} onKeyDown={onTabKeyDown}
                  style={badge > 0 ? { color: T.danger, fontWeight: 700 } : undefined}>
                  {tab.label}{badge > 0 ? ` (${num(badge)})` : ''}
                </button>
              );
            })}
          </div>
        </nav>
        <main className={styles.content} id={HORSES_PANEL_ID} role="tabpanel"
          aria-labelledby={`horses-tab-${activeTab}`} tabIndex={0}>
          <ErrorBoundary resetKey={`${activeTab}:${activeTab === 'clubarena' ? caSection : ''}`}
            label={activeTabEntry?.label || 'This Tab'}>
            {Panel ? (
              <Panel authFetch={authFetch} showNotification={showNotification}
                permissions={permissions} operatorId={operatorId} policy={policy}
                aloneRule={aloneRule} approvalsAvailable={navTabs.some((tab) => tab.id === 'approvals')}
                onNavigate={setActiveTab} permissionsDegraded={permissionsDegraded}
                onPolicyChange={handlePolicyChange} postsPerDay={socialSettings?.posts_per_day}
                onHealthChange={handleScraperHealth} section={caSection}
                onSectionChange={setCaSection} />
            ) : <div className={shared.boundary} role="alert"><h2>Tab Could Not Be Loaded</h2></div>}
          </ErrorBoundary>
          <ExportArtifactCenter key={operatorId} authFetch={authFetch} />
        </main>
      </div>
    </>
  );
}
