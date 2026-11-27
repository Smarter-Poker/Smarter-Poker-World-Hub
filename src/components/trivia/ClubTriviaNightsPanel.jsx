import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { TriviaGlassAction } from './console/TriviaConsole';
import TriviaAnswerOption from './TriviaAnswerOption';
import {
    aggregateClubAllTimeStandings,
    buildNextWeekFreerollDraft,
} from './tournaments/tournamentModel.mjs';
import { authedFetch } from '../../lib/authUtils';
import { toTitleCase } from '../../lib/trivia/titleCase';

const MAX_PLAYER_OPTIONS = [16, 32, 64, 128, 256];
const QUESTION_COUNT_OPTIONS = [10, 20];

function dateToLocalInputValue(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultStartLocalValue() {
    const now = new Date();
    const target = new Date(now.getTime() + 60 * 60 * 1000);
    target.setMinutes(0, 0, 0);
    if (target.getTime() <= now.getTime() + 15 * 60 * 1000) {
        target.setHours(target.getHours() + 1);
    }
    return dateToLocalInputValue(target);
}

function formatClubNightStart(isoValue) {
    const date = new Date(isoValue || '');
    if (Number.isNaN(date.getTime())) return 'Awaiting Schedule';
    return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
    });
}

function formatElapsedSeconds(elapsedMs) {
    const ms = Number(elapsedMs);
    if (!Number.isFinite(ms) || ms < 0) return '0.0s';
    return `${(ms / 1000).toFixed(1)}s`;
}

function statusLabel(status) {
    switch (status) {
        case 'registration':
            return 'Registration Open';
        case 'live':
            return 'Live Now';
        case 'settled':
            return 'Settled';
        case 'cancelled':
            return 'Cancelled';
        default:
            return 'Scheduled';
    }
}

function statusInk(status) {
    if (status === 'registration' || status === 'live') return 'green';
    if (status === 'cancelled') return 'red';
    return 'blue';
}

function friendlyClubNightError(code, fallback) {
    const map = {
        authentication_required: 'Sign In To Access Private Club Trivia Nights.',
        club_host_forbidden: 'Only Club Owners And Admins Can Manage Club Trivia Nights.',
        club_membership_required: 'Active Membership In This Club Is Required.',
        not_registered_for_tournament: 'Register For This Club Trivia Night Before Playing.',
        club_not_found: 'Selected Club Is Not Active Or Could Not Be Found.',
        club_tournament_not_found: 'That Club Trivia Night Could Not Be Found.',
        club_active_limit_reached: 'This Club Already Has The Maximum Active Trivia Nights Scheduled.',
        invalid_title: 'Event Title Must Be Between 3 And 80 Characters.',
        scheduled_start_must_be_future: 'Start Time Must Be At Least 2 Minutes In The Future.',
        scheduled_start_too_far: 'Start Time Must Be Within The Next 30 Days.',
        paid_club_escrow_not_enabled: 'Club Trivia Nights V1 Runs Free-Roll Bragging-Rights Events Only (0 Diamonds).',
        tournament_full: 'This Private Club Trivia Night Is Full.',
        tournament_not_in_registration: 'Registration Is Closed For This Event.',
        tournament_not_live: 'This Club Trivia Night Is Not Currently Live.',
        minimum_entrants_required: 'At Least 2 Registered Club Members Are Required To Start.',
        insufficient_eligible_questions: 'Not Enough Verified Trivia Questions Are Available Right Now.',
        registration_closed: 'Start Time Has Passed For This Event.',
        cannot_cancel_started_tournament: 'Only Events In Registration Can Be Cancelled.',
        invalid_answers: 'Select Answers Before Submitting Your Club Night Run.',
    };
    return map[code] || fallback || 'Could Not Complete That Club Trivia Action Right Now.';
}

const INPUT_STYLE = {
    width: '100%',
    minHeight: '44px',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    background: 'rgba(10, 18, 32, 0.78)',
    color: '#F8FAFC',
    fontSize: '14px',
};

const LABEL_STYLE = {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: 'var(--sd-silver, #bdd0e2)',
};

const PANEL_BOX_STYLE = {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid rgba(69, 173, 255, 0.4)',
    background: 'rgba(5, 10, 20, 0.85)',
};

export default function ClubTriviaNightsPanel({
    signedIn = false,
    onSignIn,
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [clubs, setClubs] = useState([]);
    const [items, setItems] = useState([]);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busyKey, setBusyKey] = useState('');
    const [showCreateForm, setShowCreateForm] = useState(false);

    const [clubId, setClubId] = useState('');
    const [title, setTitle] = useState('');
    const [scheduledStartLocal, setScheduledStartLocal] = useState(() => defaultStartLocalValue());
    const [maxPlayers, setMaxPlayers] = useState(64);
    const [questionCount, setQuestionCount] = useState(10);

    // Active in-panel server-graded question runner state
    const [activeRun, setActiveRun] = useState(null);
    const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState([]);
    const runStartedAtRef = useRef(0);

    // Active standings / winner / post-settlement review drawer state
    const [resultsView, setResultsView] = useState(null);
    const [settledResultsById, setSettledResultsById] = useState({});
    const [subTab, setSubTab] = useState('events');
    const [lastSubmission, setLastSubmission] = useState(null);
    const loadRequestIdRef = useRef(0);

    const invitedClubCode = useMemo(() => {
        const raw = typeof router.query?.clubCode === 'string'
            ? router.query.clubCode.trim().toUpperCase()
            : '';
        return /^[A-Z0-9_-]{2,32}$/.test(raw) ? raw : '';
    }, [router.query?.clubCode]);

    const hostableClubs = useMemo(
        () => clubs.filter((club) => club && club.canHost === true),
        [clubs],
    );

    const isItemInvitedMatch = useCallback((item) => {
        if (!invitedClubCode || !item) return false;
        const itemInvite = String(item.inviteCode || '').trim().toUpperCase();
        const itemClubCode = String(item.clubCode || '').trim().toUpperCase();
        return itemInvite === invitedClubCode || itemClubCode === invitedClubCode;
    }, [invitedClubCode]);

    const matchedInvitedItems = useMemo(
        () => (invitedClubCode ? items.filter((item) => isItemInvitedMatch(item)) : []),
        [invitedClubCode, isItemInvitedMatch, items],
    );

    const orderedItems = useMemo(() => {
        if (!invitedClubCode || matchedInvitedItems.length === 0) return items;
        const matchedIds = new Set(matchedInvitedItems.map((item) => item.id));
        return [
            ...matchedInvitedItems,
            ...items.filter((item) => !matchedIds.has(item.id)),
        ];
    }, [invitedClubCode, items, matchedInvitedItems]);

    const viewerHasInvitedClub = useMemo(
        () => Boolean(
            invitedClubCode
            && clubs.some((club) => String(club?.clubCode || '').trim().toUpperCase() === invitedClubCode),
        ),
        [clubs, invitedClubCode],
    );

    const allTimeStandings = useMemo(() => {
        const enriched = items.map((item) => {
            const cached = settledResultsById[item.id];
            if (!cached) return item;
            return {
                ...item,
                standings: Array.isArray(cached.standings) ? cached.standings : item.standings,
                champion: cached.champion || item.champion,
            };
        });
        return aggregateClubAllTimeStandings(enriched);
    }, [items, settledResultsById]);

    const handleScheduleNextWeek = useCallback((night) => {
        if (!night) return;
        const draft = buildNextWeekFreerollDraft(night);
        if (night.clubId && hostableClubs.some((c) => c.id === night.clubId)) {
            setClubId(night.clubId);
        }
        setTitle(draft.title);
        const draftDate = new Date(draft.scheduledStartIso);
        if (!Number.isNaN(draftDate.getTime())) {
            setScheduledStartLocal(dateToLocalInputValue(draftDate));
        }
        setQuestionCount(QUESTION_COUNT_OPTIONS.includes(draft.questionCount) ? draft.questionCount : 10);
        if (MAX_PLAYER_OPTIONS.includes(Number(night.maxPlayers))) {
            setMaxPlayers(Number(night.maxPlayers));
        }
        setSubTab('events');
        setShowCreateForm(true);
        setError('');
        setNotice('Pre-Filled Next Week Freeroll Draft (0 Diamonds). Review And Submit To Schedule.');
    }, [hostableClubs]);

    const loadClubNights = useCallback(async (signal) => {
        const requestId = ++loadRequestIdRef.current;
        if (!signedIn) {
            setClubs([]);
            setItems([]);
            setActiveRun(null);
            setResultsView(null);
            setLoading(false);
            setError('');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const response = await authedFetch('/api/trivia/club-nights?limit=20', {
                method: 'GET',
                cache: 'no-store',
                signal,
            });
            const payload = await response.json().catch(() => ({}));
            if (signal?.aborted || loadRequestIdRef.current !== requestId) return;
            if (!response.ok || payload?.success !== true) {
                throw new Error(friendlyClubNightError(payload?.error, 'Could Not Load Private Club Trivia Nights.'));
            }
            const nextClubs = Array.isArray(payload.clubs) ? payload.clubs : [];
            const nextItems = Array.isArray(payload.items) ? payload.items : [];
            setClubs(nextClubs);
            setItems(nextItems);
            const firstHostClub = nextClubs.find((c) => c?.canHost === true);
            if (firstHostClub) {
                setClubId((prev) => (prev && nextClubs.some((c) => c.id === prev && c.canHost) ? prev : firstHostClub.id));
            }
        } catch (err) {
            if (err?.name === 'AbortError' || signal?.aborted || loadRequestIdRef.current !== requestId) return;
            setError(err?.message || 'Could Not Load Private Club Trivia Nights.');
        } finally {
            if (!signal?.aborted && loadRequestIdRef.current === requestId) {
                setLoading(false);
            }
        }
    }, [signedIn]);

    useEffect(() => {
        const controller = new AbortController();
        void loadClubNights(controller.signal);
        return () => controller.abort();
    }, [loadClubNights]);

    const handleCopyInvite = async (item) => {
        const origin = typeof window !== 'undefined' && window.location?.origin
            ? window.location.origin
            : 'https://smarter.poker';
        const inviteUrl = `${origin}/hub/trivia/tournaments?tab=club-nights&clubCode=${encodeURIComponent(item.inviteCode)}`;
        const sharePayload = `${item.clubName} Private Trivia Night | Code: ${item.inviteCode} | ${inviteUrl}`;
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(sharePayload);
                setNotice(`Invite Code Copied: ${item.inviteCode}`);
                return;
            } catch {
                // Fall through to inline confirmation
            }
        }
        setNotice(`Invite Code Ready: ${item.inviteCode}`);
    };

    const handleToggleRegistration = async (item) => {
        if (!signedIn) {
            onSignIn?.();
            return;
        }
        const action = item.viewerRegistered ? 'leave' : 'join';
        setBusyKey(`${action}:${item.id}`);
        setError('');
        setNotice('');
        try {
            const response = await authedFetch('/api/trivia/club-nights', {
                method: 'POST',
                body: JSON.stringify({
                    action,
                    clubTournamentId: item.id,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(friendlyClubNightError(payload?.error));
            }
            setNotice(action === 'join' ? `Registered For ${item.title}.` : `Withdrew From ${item.title}.`);
            await loadClubNights();
        } catch (err) {
            setError(err?.message || 'Could Not Update Club Trivia Registration.');
        } finally {
            setBusyKey('');
        }
    };

    const handleCancelNight = async (item) => {
        if (!signedIn) {
            onSignIn?.();
            return;
        }
        setBusyKey(`cancel:${item.id}`);
        setError('');
        setNotice('');
        try {
            const response = await authedFetch('/api/trivia/club-nights', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'cancel',
                    clubTournamentId: item.id,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(friendlyClubNightError(payload?.error));
            }
            setNotice(`Cancelled ${item.title}.`);
            await loadClubNights();
        } catch (err) {
            setError(err?.message || 'Could Not Cancel Club Trivia Night.');
        } finally {
            setBusyKey('');
        }
    };

    const handleStartNight = async (item) => {
        if (!signedIn) {
            onSignIn?.();
            return;
        }
        setBusyKey(`start:${item.id}`);
        setError('');
        setNotice('');
        try {
            const response = await authedFetch('/api/trivia/club-nights', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'start',
                    clubTournamentId: item.id,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(friendlyClubNightError(payload?.error));
            }
            setNotice(`${item.title} Is Live Now With ${payload.questionCount || item.questionCount} Verified Questions.`);
            await loadClubNights();
        } catch (err) {
            setError(err?.message || 'Could Not Start Club Trivia Night.');
        } finally {
            setBusyKey('');
        }
    };

    const loadResultsView = useCallback(async (tournamentId) => {
        if (!signedIn || !tournamentId) return;
        setBusyKey(`results:${tournamentId}`);
        setError('');
        try {
            const response = await authedFetch(
                `/api/trivia/club-nights?tournamentId=${encodeURIComponent(tournamentId)}&view=results`,
                { method: 'GET', cache: 'no-store' },
            );
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(friendlyClubNightError(payload?.error, 'Could Not Load Club Standings.'));
            }
            setResultsView(payload);
            if (payload?.status === 'settled' && Array.isArray(payload?.standings)) {
                setSettledResultsById((prev) => ({
                    ...prev,
                    [tournamentId]: {
                        standings: payload.standings,
                        champion: payload.champion || null,
                    },
                }));
            }
        } catch (err) {
            setError(err?.message || 'Could Not Load Club Standings.');
        } finally {
            setBusyKey('');
        }
    }, [signedIn]);

    const handleCompleteNight = async (item) => {
        if (!signedIn) {
            onSignIn?.();
            return;
        }
        setBusyKey(`complete:${item.id}`);
        setError('');
        setNotice('');
        try {
            const response = await authedFetch('/api/trivia/club-nights', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'complete',
                    clubTournamentId: item.id,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(friendlyClubNightError(payload?.error));
            }
            const champName = payload?.champion?.displayName;
            setNotice(
                champName
                    ? `Finalized ${item.title}. Club Champion: ${champName}.`
                    : `Finalized ${item.title}. Official Standings Posted.`,
            );
            await loadClubNights();
            await loadResultsView(item.id);
        } catch (err) {
            setError(err?.message || 'Could Not Finalize Club Trivia Night.');
        } finally {
            setBusyKey('');
        }
    };

    const handleOpenPlayRunner = async (item) => {
        if (!signedIn) {
            onSignIn?.();
            return;
        }
        setBusyKey(`play:${item.id}`);
        setError('');
        setNotice('');
        setLastSubmission(null);
        try {
            const response = await authedFetch(
                `/api/trivia/club-nights?tournamentId=${encodeURIComponent(item.id)}&view=questions`,
                { method: 'GET', cache: 'no-store' },
            );
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(friendlyClubNightError(payload?.error, 'Could Not Load Club Night Questions.'));
            }
            if (payload.alreadySubmitted) {
                setNotice(`You Already Submitted Answers For ${item.title}. Showing Current Standings.`);
                await loadResultsView(item.id);
                return;
            }
            const questions = Array.isArray(payload.questions) ? payload.questions : [];
            if (questions.length === 0) {
                throw new Error('No Questions Were Loaded For This Club Night.');
            }
            setResultsView(null);
            setActiveRun({
                clubTournamentId: payload.clubTournamentId || item.id,
                title: payload.title || item.title,
                questions,
            });
            setSelectedAnswers(new Array(questions.length).fill(-1));
            setCurrentQuestionIdx(0);
            runStartedAtRef.current = Date.now();
        } catch (err) {
            setError(err?.message || 'Could Not Open Club Night Play Runner.');
        } finally {
            setBusyKey('');
        }
    };

    const handleSelectOption = (optionIndex) => {
        setSelectedAnswers((prev) => {
            const next = [...prev];
            next[currentQuestionIdx] = optionIndex;
            return next;
        });
    };

    const handleSubmitAnswers = async () => {
        if (!activeRun || !signedIn) return;
        const elapsedMs = Math.max(0, Date.now() - (runStartedAtRef.current || Date.now()));
        setBusyKey(`submit:${activeRun.clubTournamentId}`);
        setError('');
        setNotice('');
        try {
            const response = await authedFetch('/api/trivia/club-nights', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'submit',
                    clubTournamentId: activeRun.clubTournamentId,
                    answers: selectedAnswers,
                    elapsedMs,
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(friendlyClubNightError(payload?.error, 'Could Not Submit Your Club Night Answers.'));
            }
            const finishedId = activeRun.clubTournamentId;
            setLastSubmission(payload);
            setActiveRun(null);
            setNotice(
                payload.autoCompleted
                    ? `Submitted ${payload.correctCount} Of ${payload.totalQuestions} Correct (${payload.score} Pts). All Entrants Finished And Official Results Are Settled.`
                    : `Submitted ${payload.correctCount} Of ${payload.totalQuestions} Correct (${payload.score} Pts, Current Rank #${payload.rank}).`,
            );
            await loadClubNights();
            await loadResultsView(finishedId);
        } catch (err) {
            setError(err?.message || 'Could Not Submit Your Club Night Answers.');
        } finally {
            setBusyKey('');
        }
    };

    const handleCreateSubmit = async (event) => {
        event.preventDefault();
        if (!signedIn) {
            onSignIn?.();
            return;
        }
        const trimmedTitle = title.trim();
        if (trimmedTitle.length < 3) {
            setError('Event Title Must Be At Least 3 Characters.');
            return;
        }
        const parsedMs = Date.parse(scheduledStartLocal);
        if (!Number.isFinite(parsedMs)) {
            setError('Choose A Valid Start Date And Time.');
            return;
        }
        setBusyKey('create');
        setError('');
        setNotice('');
        try {
            const response = await authedFetch('/api/trivia/club-nights', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'create',
                    clubId,
                    title: trimmedTitle,
                    scheduledStartAt: new Date(parsedMs).toISOString(),
                    entryFee: 0,
                    maxPlayers: Number(maxPlayers),
                    questionCount: Number(questionCount),
                }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload?.success !== true) {
                throw new Error(friendlyClubNightError(payload?.error, payload?.message));
            }
            const createdCode = payload?.tournament?.inviteCode || '';
            setTitle('');
            setScheduledStartLocal(defaultStartLocalValue());
            setShowCreateForm(false);
            setNotice(
                createdCode
                    ? `Private Club Trivia Night Scheduled. Invite Code: ${createdCode}`
                    : 'Private Club Trivia Night Scheduled.',
            );
            await loadClubNights();
        } catch (err) {
            setError(err?.message || 'Could Not Schedule Club Trivia Night.');
        } finally {
            setBusyKey('');
        }
    };

    const activeQuestion = activeRun?.questions?.[currentQuestionIdx] || null;
    const answeredCount = selectedAnswers.filter((choice) => Number.isInteger(choice) && choice >= 0).length;

    return (
        <section
            className="tt-section"
            aria-labelledby="tt-club-nights-title"
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
        >
            <div className="tt-section-head">
                <h2 id="tt-club-nights-title" className="tc-label">Club-Hosted Private Trivia Nights</h2>
                <span className="tc-ink--blue">Club Arena X Trivia</span>
            </div>

            <p className="trivia-console-copy tc-ink--muted" style={{ margin: 0 }}>
                Play Private Free-Roll Trivia Nights With Your Club Arena Roster. V1 Events Are Zero-Diamond Bragging-Rights Tournaments Exclusive To Active Club Members.
            </p>

            {!signedIn ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                    <p className="trivia-console-copy tc-ink--silver" style={{ margin: 0 }}>
                        {invitedClubCode
                            ? `Invite Code ${invitedClubCode} Ready. Sign In To View Your Club Arena Clubs And Join This Private Trivia Night.`
                            : 'Sign In To View Your Club Arena Clubs, Register For Private Trivia Nights, Or Host One For Your Club.'}
                    </p>
                    <TriviaGlassAction label="Sign In To View Club Nights" ink="blue" onClick={() => onSignIn?.()} />
                </div>
            ) : null}

            {signedIn && !loading && invitedClubCode && matchedInvitedItems.length === 0 ? (
                <div
                    role="status"
                    data-club-invite-notice={invitedClubCode}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        padding: '14px',
                        borderRadius: '10px',
                        border: '1px solid rgba(134, 218, 255, 0.5)',
                        background: 'rgba(10, 18, 32, 0.72)',
                    }}
                >
                    <strong className="tc-ink--blue">Club Night Invite: {invitedClubCode}</strong>
                    <p className="trivia-console-copy tc-ink--silver" style={{ margin: 0 }}>
                        {viewerHasInvitedClub
                            ? `Invite Code ${invitedClubCode} Matches Your Club, But No Active Private Trivia Night Is Currently Listed.`
                            : `Invite Code ${invitedClubCode} Belongs To A Club You Have Not Joined Yet Or Is No Longer Active. Join The Club In Club Arena To Access Its Private Trivia Nights.`}
                    </p>
                    {!viewerHasInvitedClub ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                            <TriviaGlassAction
                                label="Open Club Arena"
                                ink="blue"
                                onClick={() => router.push('/hub/club-arena')}
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}

            {signedIn && notice ? (
                <p className="trivia-console-copy tc-ink--green" role="status" style={{ margin: 0 }}>
                    {notice}
                </p>
            ) : null}

            {signedIn && error ? (
                <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                    <p className="trivia-console-copy tc-ink--red" style={{ margin: 0 }}>{error}</p>
                    <TriviaGlassAction label="Retry Club Nights" ink="red" onClick={() => loadClubNights()} />
                </div>
            ) : null}

            {signedIn && activeRun && activeQuestion ? (
                <div style={PANEL_BOX_STYLE} role="region" aria-label="Club Trivia Night Play Runner">
                    <div className="tt-section-head">
                        <strong className="tc-ink--blue">{activeRun.title}</strong>
                        <span className="tc-ink--blue">
                            Question {currentQuestionIdx + 1} Of {activeRun.questions.length} | Answered: {answeredCount}/{activeRun.questions.length}
                        </span>
                    </div>

                    <p className="trivia-console-copy tc-ink--silver" style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>
                        {toTitleCase(activeQuestion.questionText)}
                    </p>

                    <div className="tt-options" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {(activeQuestion.options || []).map((option, idx) => (
                            <TriviaAnswerOption
                                key={`${activeQuestion.position}-${idx}`}
                                index={idx}
                                option={toTitleCase(String(option))}
                                selectedAnswer={selectedAnswers[currentQuestionIdx] >= 0 ? selectedAnswers[currentQuestionIdx] : null}
                                showResult={false}
                                disabled={busyKey === `submit:${activeRun.clubTournamentId}`}
                                onSelect={handleSelectOption}
                            />
                        ))}
                    </div>

                    <p className="trivia-console-copy tc-ink--muted" style={{ margin: 0, fontSize: '12px' }}>
                        All Answers Are Graded Strictly On The Server. Correct Answers And Explanations Unlock Only After Settlement.
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <TriviaGlassAction
                                label="Previous"
                                ink="blue"
                                disabled={currentQuestionIdx === 0}
                                onClick={() => setCurrentQuestionIdx((idx) => Math.max(0, idx - 1))}
                            />
                            {currentQuestionIdx < activeRun.questions.length - 1 ? (
                                <TriviaGlassAction
                                    label="Next Question"
                                    ink="blue"
                                    onClick={() => setCurrentQuestionIdx((idx) => Math.min(activeRun.questions.length - 1, idx + 1))}
                                />
                            ) : null}
                            <TriviaGlassAction
                                label="Exit Runner"
                                ink="red"
                                disabled={busyKey === `submit:${activeRun.clubTournamentId}`}
                                onClick={() => setActiveRun(null)}
                            />
                        </div>

                        <TriviaGlassAction
                            label={busyKey === `submit:${activeRun.clubTournamentId}` ? 'Submitting...' : 'Submit Club Night Answers'}
                            ink="green"
                            disabled={busyKey === `submit:${activeRun.clubTournamentId}`}
                            onClick={handleSubmitAnswers}
                        />
                    </div>
                </div>
            ) : null}

            {signedIn && resultsView ? (
                <div style={PANEL_BOX_STYLE} role="region" aria-label="Club Trivia Night Standings">
                    <div className="tt-section-head">
                        <strong className="tc-ink--blue">
                            {resultsView.title} | {resultsView.status === 'settled' ? 'Final Standings' : 'Live Standings'}
                        </strong>
                        <span className="tc-ink--blue">
                            Submissions: {resultsView.submissionCount || 0} / {resultsView.entrantCount || 0}
                        </span>
                    </div>

                    {resultsView.status === 'settled' && resultsView.champion ? (
                        <div
                            style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(134, 218, 255, 0.5)',
                                background: 'rgba(12, 85, 192, 0.14)',
                            }}
                        >
                            <strong className="tc-ink--blue">
                                Club Champion: {resultsView.champion.displayName} | {resultsView.champion.score} Pts ({resultsView.champion.correctCount}/{resultsView.champion.totalQuestions} In {formatElapsedSeconds(resultsView.champion.elapsedMs)})
                            </strong>
                        </div>
                    ) : null}

                    {lastSubmission && lastSubmission.clubTournamentId === resultsView.clubTournamentId ? (
                        <p className="trivia-console-copy tc-ink--green" style={{ margin: 0, fontSize: '13px' }}>
                            Your Recorded Score: {lastSubmission.score} Pts ({lastSubmission.correctCount}/{lastSubmission.totalQuestions} Correct In {formatElapsedSeconds(lastSubmission.elapsedMs)})
                        </p>
                    ) : null}

                    {Array.isArray(resultsView.standings) && resultsView.standings.length > 0 ? (
                        <ol className="tc-rows" aria-label="Club Standings Leaderboard" style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: 0, padding: 0, listStyle: 'none' }}>
                            {resultsView.standings.map((row) => (
                                <li
                                    key={`${row.rank}-${row.userId}`}
                                    className="tc-row"
                                    style={{
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        border: row.isChampion
                                            ? '1px solid rgba(134, 218, 255, 0.55)'
                                            : '1px solid rgba(148, 163, 184, 0.2)',
                                        background: row.isViewer ? 'rgba(69, 173, 255, 0.12)' : 'rgba(10, 18, 32, 0.5)',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        justifyContent: 'space-between',
                                        gap: '8px',
                                    }}
                                >
                                    <span className={row.isChampion ? 'tc-ink--blue' : 'tc-ink--silver'} style={{ fontWeight: 700 }}>
                                        #{row.rank} {row.displayName}{row.isViewer ? ' (You)' : ''}{row.isChampion ? ' | Champion' : ''}
                                    </span>
                                    <span className="tc-ink--green" style={{ fontSize: '13px', fontWeight: 700 }}>
                                        {row.score} Pts | {row.correctCount}/{row.totalQuestions} | {formatElapsedSeconds(row.elapsedMs)}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="trivia-console-copy tc-ink--muted" style={{ margin: 0 }}>
                            No Club Members Have Submitted Answers Yet. Standings Update As Entrants Finish.
                        </p>
                    )}

                    {resultsView.status === 'settled' && Array.isArray(resultsView.review) && resultsView.review.length > 0 ? (
                        <details style={{ marginTop: '4px' }}>
                            <summary className="tc-ink--blue" style={{ cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}>
                                Settled Question Review ({resultsView.review.length} Questions)
                            </summary>
                            <ol style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '18px', marginTop: '8px' }}>
                                {resultsView.review.map((q) => (
                                    <li key={q.position} style={{ fontSize: '13px', color: '#E2E8F0' }}>
                                        <div><strong>{toTitleCase(q.questionText)}</strong></div>
                                        <div className="tc-ink--green">
                                            Official Answer: {toTitleCase(String(q.options?.[q.correctIndex] || ''))}
                                        </div>
                                        {q.explanation ? (
                                            <div className="tc-ink--muted">{q.explanation}</div>
                                        ) : null}
                                    </li>
                                ))}
                            </ol>
                        </details>
                    ) : null}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <TriviaGlassAction
                            label="Refresh Standings"
                            ink="blue"
                            onClick={() => loadResultsView(resultsView.clubTournamentId)}
                        />
                        <TriviaGlassAction
                            label="Close Standings"
                            ink="red"
                            onClick={() => setResultsView(null)}
                        />
                    </div>
                </div>
            ) : null}

            {signedIn && loading ? (
                <p className="trivia-console-copy tc-ink--muted" style={{ margin: 0 }}>
                    Loading Your Club Arena Roster And Private Trivia Nights...
                </p>
            ) : null}

            {signedIn && !loading ? (
                <div
                    role="tablist"
                    aria-label="Club Trivia Sections"
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                    }}
                >
                    <button
                        type="button"
                        role="tab"
                        aria-selected={subTab === 'events'}
                        className={`sd-button${subTab === 'events' ? ' sd-primary' : ''}`}
                        onClick={() => setSubTab('events')}
                        style={{
                            minHeight: '44px',
                            minWidth: '44px',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: subTab === 'events'
                                ? '1px solid #86daff'
                                : '1px solid rgba(148, 163, 184, 0.35)',
                            background: subTab === 'events'
                                ? 'rgba(12, 85, 192, 0.32)'
                                : 'rgba(10, 18, 32, 0.72)',
                            color: subTab === 'events' ? '#86daff' : '#e2e8f0',
                        }}
                    >
                        Club Events
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={subTab === 'standings'}
                        data-club-standings-tab="true"
                        className={`sd-button${subTab === 'standings' ? ' sd-primary' : ''}`}
                        onClick={() => setSubTab('standings')}
                        style={{
                            minHeight: '44px',
                            minWidth: '44px',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            border: subTab === 'standings'
                                ? '1px solid #86daff'
                                : '1px solid rgba(148, 163, 184, 0.35)',
                            background: subTab === 'standings'
                                ? 'rgba(12, 85, 192, 0.32)'
                                : 'rgba(10, 18, 32, 0.72)',
                            color: subTab === 'standings' ? '#86daff' : '#e2e8f0',
                        }}
                    >
                        Club Standings
                    </button>
                </div>
            ) : null}

            {signedIn && !loading && subTab === 'standings' ? (
                <div
                    role="tabpanel"
                    aria-label="All-Time Club Trivia Standings"
                    data-club-standings-board="true"
                    style={PANEL_BOX_STYLE}
                >
                    <div className="tt-section-head">
                        <strong className="tc-ink--blue">All-Time Club Trivia Standings</strong>
                        <span className="tc-ink--silver" style={{ fontSize: '13px' }}>
                            Ranked By Wins, Podiums, Events, And Best Score
                        </span>
                    </div>

                    {allTimeStandings.length === 0 ? (
                        <p className="trivia-console-copy tc-ink--muted" style={{ margin: 0 }}>
                            No Settled Club Nights Yet - Complete A Freeroll Club Night To Start Club Standings.
                        </p>
                    ) : (
                        <ol
                            className="tc-rows"
                            aria-label="All-Time Club Standings Table"
                            style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: 0, padding: 0, listStyle: 'none' }}
                        >
                            {allTimeStandings.map((entry, idx) => (
                                <li
                                    key={entry.playerId}
                                    className="tc-row"
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '8px',
                                        border: idx === 0
                                            ? '1px solid rgba(134, 218, 255, 0.6)'
                                            : '1px solid rgba(148, 163, 184, 0.22)',
                                        background: idx === 0
                                            ? 'rgba(12, 85, 192, 0.16)'
                                            : 'rgba(10, 18, 32, 0.55)',
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '8px',
                                    }}
                                >
                                    <span className={idx === 0 ? 'tc-ink--blue' : 'tc-ink--silver'} style={{ fontWeight: 700, fontSize: '14px' }}>
                                        #{idx + 1} {entry.displayName}
                                    </span>
                                    <span className="tc-ink--green" style={{ fontSize: '13px', fontWeight: 700 }}>
                                        {entry.wins} {entry.wins === 1 ? 'Win' : 'Wins'} | {entry.podiums} {entry.podiums === 1 ? 'Podium' : 'Podiums'} | {entry.eventsPlayed} {entry.eventsPlayed === 1 ? 'Event' : 'Events'} | Best {entry.bestScore} Pts
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            ) : null}

            {signedIn && !loading && subTab === 'events' && clubs.length === 0 ? (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        padding: '14px',
                        borderRadius: '10px',
                        border: '1px solid rgba(148, 163, 184, 0.25)',
                        background: 'rgba(10, 18, 32, 0.55)',
                    }}
                >
                    <p className="trivia-console-copy tc-ink--silver" style={{ margin: 0 }}>
                        You Are Not In An Active Club Arena Club Yet. Join Or Create A Club In Club Arena To Unlock Private Club Trivia Nights.
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        <TriviaGlassAction
                            label="Open Club Arena"
                            ink="blue"
                            onClick={() => router.push('/hub/club-arena')}
                        />
                    </div>
                </div>
            ) : null}

            {signedIn && !loading && subTab === 'events' && clubs.length > 0 ? (
                <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="tc-ink--silver">
                            Active Clubs: {clubs.length} | Upcoming Nights: {items.filter((i) => i.status === 'registration' || i.status === 'live').length}
                        </span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                            {hostableClubs.length > 0 ? (
                                <TriviaGlassAction
                                    label={showCreateForm ? 'Close Host Form' : 'Host Club Trivia Night'}
                                    ink={showCreateForm ? 'red' : 'blue'}
                                    onClick={() => setShowCreateForm((prev) => !prev)}
                                />
                            ) : (
                                <span className="tc-ink--muted" style={{ fontSize: '13px' }}>
                                    Club Owners And Admins Can Host New Private Nights
                                </span>
                            )}
                            <TriviaGlassAction
                                label="Refresh"
                                ink="blue"
                                onClick={() => loadClubNights()}
                            />
                        </div>
                    </div>

                    {hostableClubs.length > 0 && showCreateForm ? (
                        <form
                            onSubmit={handleCreateSubmit}
                            aria-label="Host Club Trivia Night Form"
                            style={{
                                display: 'grid',
                                gap: '12px',
                                padding: '14px',
                                borderRadius: '10px',
                                border: '1px solid rgba(134, 218, 255, 0.45)',
                                background: 'rgba(10, 18, 32, 0.72)',
                            }}
                        >
                            <div className="tt-section-head">
                                <h3 className="tc-label" style={{ margin: 0 }}>Host Club Trivia Night</h3>
                                <span className="tc-ink--green">Free-Roll (0 Diamonds)</span>
                            </div>

                            <label style={LABEL_STYLE}>
                                Club
                                <select
                                    value={clubId}
                                    onChange={(e) => setClubId(e.target.value)}
                                    style={INPUT_STYLE}
                                    required
                                >
                                    {hostableClubs.map((club) => (
                                        <option key={club.id} value={club.id}>
                                            {club.name}{club.clubCode ? ` (#${club.clubCode})` : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label style={LABEL_STYLE}>
                                Event Title
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    minLength={3}
                                    maxLength={80}
                                    placeholder="Friday Night Holdem Trivia"
                                    style={INPUT_STYLE}
                                    required
                                />
                            </label>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
                                <label style={LABEL_STYLE}>
                                    Scheduled Start
                                    <input
                                        type="datetime-local"
                                        value={scheduledStartLocal}
                                        onChange={(e) => setScheduledStartLocal(e.target.value)}
                                        style={INPUT_STYLE}
                                        required
                                    />
                                </label>

                                <label style={LABEL_STYLE}>
                                    Questions
                                    <select
                                        value={questionCount}
                                        onChange={(e) => setQuestionCount(Number(e.target.value))}
                                        style={INPUT_STYLE}
                                    >
                                        {QUESTION_COUNT_OPTIONS.map((count) => (
                                            <option key={count} value={count}>
                                                {count} Questions
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label style={LABEL_STYLE}>
                                    Max Players
                                    <select
                                        value={maxPlayers}
                                        onChange={(e) => setMaxPlayers(Number(e.target.value))}
                                        style={INPUT_STYLE}
                                    >
                                        {MAX_PLAYER_OPTIONS.map((cap) => (
                                            <option key={cap} value={cap}>
                                                {cap} Players
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span className="tc-ink--muted" style={{ fontSize: '13px' }}>
                                    Entry Fee: 0 Diamonds (Bragging-Rights Club Night)
                                </span>
                                <TriviaGlassAction
                                    type="submit"
                                    label={busyKey === 'create' ? 'Scheduling...' : 'Create Private Club Night'}
                                    ink="blue"
                                    disabled={busyKey === 'create'}
                                />
                            </div>
                        </form>
                    ) : null}

                    {items.length === 0 ? (
                        <p className="trivia-console-copy tc-ink--muted" style={{ margin: 0 }}>
                            No Private Club Trivia Nights Scheduled For Your Clubs Yet.{hostableClubs.length > 0 ? ' Use Host Club Trivia Night Above To Schedule One For Your Roster.' : ''}
                        </p>
                    ) : (
                        <ul className="tc-rows" aria-label="Private Club Trivia Nights" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {orderedItems.map((item) => {
                                const isReg = item.status === 'registration';
                                const isLive = item.status === 'live';
                                const isSettled = item.status === 'settled';
                                const canCreate = Boolean(item.viewerCanManage || hostableClubs.some((c) => c.id === item.clubId));
                                const isInvitedMatch = isItemInvitedMatch(item);
                                const entrants = Number(item.entrantCount || 0);
                                const isFull = entrants >= Number(item.maxPlayers || 64);
                                const actionPending = busyKey === `join:${item.id}` || busyKey === `leave:${item.id}`;
                                const cancelPending = busyKey === `cancel:${item.id}`;
                                const startPending = busyKey === `start:${item.id}`;
                                const completePending = busyKey === `complete:${item.id}`;
                                const playPending = busyKey === `play:${item.id}`;
                                const resultsPending = busyKey === `results:${item.id}`;

                                return (
                                    <li
                                        key={item.id}
                                        className="tc-row tt-row--wrap"
                                        data-invited-match={isInvitedMatch ? 'true' : undefined}
                                        style={{
                                            padding: '12px',
                                            borderRadius: '10px',
                                            border: isInvitedMatch
                                                ? '1px solid rgba(134, 218, 255, 0.7)'
                                                : '1px solid rgba(148, 163, 184, 0.22)',
                                            background: isInvitedMatch
                                                ? 'rgba(12, 85, 192, 0.14)'
                                                : 'rgba(10, 18, 32, 0.5)',
                                            gap: '8px',
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                                            <strong className="tc-ink--blue" style={{ fontSize: '16px' }}>
                                                {item.title}{isInvitedMatch ? ' | Invited Night' : ''}
                                            </strong>
                                            <span className={`tc-ink--${statusInk(item.status)}`} style={{ fontSize: '13px', fontWeight: 700 }}>
                                                {statusLabel(item.status)}
                                            </span>
                                        </div>

                                        <div className="tc-ink--silver" style={{ fontSize: '13px' }}>
                                            {item.clubName}{item.clubCode ? ` (#${item.clubCode})` : ''} | Host: {item.hostDisplayName || 'Club Host'}
                                        </div>

                                        <div className="tc-ink--muted" style={{ fontSize: '13px' }}>
                                            Starts: {formatClubNightStart(item.scheduledStartAt)} | {item.questionCount} Questions | Free-Roll (0 Diamonds)
                                            {isSettled && item.championDisplayName ? ` | Champion: ${item.championDisplayName}` : ''}
                                        </div>

                                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                            <span className="tc-ink--blue" style={{ fontSize: '13px', fontWeight: 700 }}>
                                                Entrants: {entrants} / {item.maxPlayers}
                                                {isLive || isSettled ? ` | Submitted: ${Number(item.submissionCount || 0)}` : ''}
                                                {` | Code: ${item.inviteCode}`}
                                            </span>

                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                <TriviaGlassAction
                                                    label="Copy Invite Code"
                                                    ink="blue"
                                                    onClick={() => handleCopyInvite(item)}
                                                />
                                                {isReg ? (
                                                    <TriviaGlassAction
                                                        label={
                                                            actionPending
                                                                ? 'Updating...'
                                                                : item.viewerRegistered
                                                                    ? 'Leave Night'
                                                                    : isFull
                                                                        ? 'Event Full'
                                                                        : 'Register'
                                                        }
                                                        ink={item.viewerRegistered ? 'red' : 'green'}
                                                        disabled={actionPending || (!item.viewerRegistered && isFull)}
                                                        onClick={() => handleToggleRegistration(item)}
                                                    />
                                                ) : null}
                                                {isReg && item.viewerCanManage ? (
                                                    <TriviaGlassAction
                                                        label={startPending ? 'Starting...' : 'Start Club Night'}
                                                        ink="blue"
                                                        disabled={startPending || entrants < 2}
                                                        onClick={() => handleStartNight(item)}
                                                    />
                                                ) : null}
                                                {isLive && item.viewerRegistered && !item.viewerSubmitted ? (
                                                    <TriviaGlassAction
                                                        label={playPending ? 'Loading...' : 'Play Now'}
                                                        ink="green"
                                                        disabled={playPending}
                                                        onClick={() => handleOpenPlayRunner(item)}
                                                    />
                                                ) : null}
                                                {isLive && item.viewerCanManage ? (
                                                    <TriviaGlassAction
                                                        label={completePending ? 'Finalizing...' : 'Finalize Results'}
                                                        ink="blue"
                                                        disabled={completePending}
                                                        onClick={() => handleCompleteNight(item)}
                                                    />
                                                ) : null}
                                                {isLive || isSettled ? (
                                                    <TriviaGlassAction
                                                        label={resultsPending ? 'Loading...' : isSettled ? 'View Results' : 'View Standings'}
                                                        ink="blue"
                                                        disabled={resultsPending}
                                                        onClick={() => loadResultsView(item.id)}
                                                    />
                                                ) : null}
                                                {isReg && item.viewerCanManage ? (
                                                    <TriviaGlassAction
                                                        label={cancelPending ? 'Cancelling...' : 'Cancel Night'}
                                                        ink="red"
                                                        disabled={cancelPending}
                                                        onClick={() => handleCancelNight(item)}
                                                    />
                                                ) : null}
                                                {canCreate ? (
                                                    <TriviaGlassAction
                                                        label="Schedule Next Week (Freeroll)"
                                                        ink="blue"
                                                        data-schedule-next-week="true"
                                                        onClick={() => handleScheduleNextWeek(item)}
                                                    />
                                                ) : null}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            ) : null}
        </section>
    );
}
