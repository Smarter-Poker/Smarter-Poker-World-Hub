/**
 * Shared GIF and sticker browser powered by the authenticated GIPHY proxy.
 *
 * The picker is deliberately unframed. Reel comment composers print it onto
 * the surrounding painted console glass, while the actual GIFs remain the
 * only imagery inside the picker.
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import styles from './GiphyPicker.module.css';

const RESULT_LIMIT = 20;

function getTabLabel(tab) {
    return tab === 'sticker' ? 'Stickers' : 'GIFs';
}

function PickerStatus({ title, detail, actionLabel, onAction, alert = false }) {
    return (
        <div
            className={styles.status}
            role={alert ? 'alert' : 'status'}
            aria-live={alert ? 'assertive' : 'polite'}
        >
            <strong className={styles.statusTitle}>{title}</strong>
            {detail ? <span className={styles.statusDetail}>{detail}</span> : null}
            {actionLabel && onAction ? (
                <button className={styles.textAction} type="button" onClick={onAction}>
                    {actionLabel}
                </button>
            ) : null}
        </div>
    );
}

const GiphyPicker = ({ onSelect, onClose, compact = false, onPaste }) => {
    const [query, setQuery] = useState('');
    const [gifs, setGifs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [tab, setTab] = useState('gif');
    const [hasMore, setHasMore] = useState(true);
    const searchTimerRef = useRef(null);
    const focusTimerRef = useRef(null);
    const inputRef = useRef(null);
    const gridRef = useRef(null);
    const offsetRef = useRef(0);
    const requestSequenceRef = useRef(0);
    const loadingMoreRef = useRef(false);
    const mountedRef = useRef(true);
    const searchInputId = useId();
    const resultsId = `${searchInputId}-results`;

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            requestSequenceRef.current += 1;
            loadingMoreRef.current = false;
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        };
    }, []);

    const loadTrending = useCallback(async () => {
        const requestSequence = requestSequenceRef.current + 1;
        requestSequenceRef.current = requestSequence;
        loadingMoreRef.current = false;
        setLoading(true);
        setLoadingMore(false);
        setError('');
        setGifs([]);
        offsetRef.current = 0;

        try {
            const response = await fetch(
                `/api/messenger/gif-search?limit=${RESULT_LIMIT}&type=${tab}`
            );
            const data = await response.json();
            if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;

            if (data.success && Array.isArray(data.gifs)) {
                setGifs(data.gifs);
                setHasMore(data.gifs.length >= RESULT_LIMIT);
                offsetRef.current = data.gifs.length;
            } else {
                setHasMore(false);
                setError('GIF Service Is Unavailable');
            }
        } catch (loadError) {
            console.warn('[GiphyPicker] Load error:', loadError);
            if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;
            setHasMore(false);
            setError('GIF Service Is Unavailable');
        } finally {
            if (mountedRef.current && requestSequence === requestSequenceRef.current) {
                setLoading(false);
            }
        }
    }, [tab]);

    useEffect(() => {
        void loadTrending();
        if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        focusTimerRef.current = setTimeout(() => inputRef.current?.focus(), 100);
    }, [loadTrending]);

    const handleSearch = (nextQuery) => {
        setQuery(nextQuery);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        requestSequenceRef.current += 1;
        loadingMoreRef.current = false;
        setLoadingMore(false);

        if (!nextQuery || nextQuery.length < 2) {
            void loadTrending();
            return;
        }

        searchTimerRef.current = setTimeout(async () => {
            const requestSequence = requestSequenceRef.current + 1;
            requestSequenceRef.current = requestSequence;
            setLoading(true);
            setError('');
            setGifs([]);
            offsetRef.current = 0;

            try {
                const response = await fetch(
                    `/api/messenger/gif-search?q=${encodeURIComponent(nextQuery)}`
                    + `&limit=${RESULT_LIMIT}&type=${tab}`
                );
                const data = await response.json();
                if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;

                if (data.success && Array.isArray(data.gifs)) {
                    setGifs(data.gifs);
                    setHasMore(data.gifs.length >= RESULT_LIMIT);
                    offsetRef.current = data.gifs.length;
                } else {
                    setHasMore(false);
                    setError('GIF Search Is Unavailable');
                }
            } catch (searchError) {
                console.warn('[GiphyPicker] Search error:', searchError);
                if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;
                setHasMore(false);
                setError('GIF Search Is Unavailable');
            } finally {
                if (mountedRef.current && requestSequence === requestSequenceRef.current) {
                    setLoading(false);
                }
            }
        }, 300);
    };

    const loadMore = useCallback(async () => {
        if (loading || loadingMore || loadingMoreRef.current || !hasMore) return;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        const requestSequence = requestSequenceRef.current;

        try {
            const queryParameter = query && query.length >= 2
                ? `&q=${encodeURIComponent(query)}`
                : '';
            const response = await fetch(
                `/api/messenger/gif-search?limit=${RESULT_LIMIT}`
                + `&offset=${offsetRef.current}&type=${tab}${queryParameter}`
            );
            const data = await response.json();
            if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;

            if (data.success && Array.isArray(data.gifs) && data.gifs.length > 0) {
                setGifs(previous => [...previous, ...data.gifs]);
                offsetRef.current += data.gifs.length;
                setHasMore(data.gifs.length >= RESULT_LIMIT);
            } else {
                setHasMore(false);
            }
        } catch (loadMoreError) {
            console.warn('[GiphyPicker] Load more error:', loadMoreError);
            if (mountedRef.current && requestSequence === requestSequenceRef.current) {
                setHasMore(false);
            }
        } finally {
            if (mountedRef.current && requestSequence === requestSequenceRef.current) {
                loadingMoreRef.current = false;
                setLoadingMore(false);
            } else if (!mountedRef.current) {
                loadingMoreRef.current = false;
            }
        }
    }, [hasMore, loading, loadingMore, query, tab]);

    useEffect(() => {
        const grid = gridRef.current;
        if (!grid) return undefined;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = grid;
            if (scrollHeight - scrollTop - clientHeight < 100) {
                void loadMore();
            }
        };

        grid.addEventListener('scroll', handleScroll, { passive: true });
        return () => grid.removeEventListener('scroll', handleScroll);
    }, [loadMore]);

    const handlePaste = (event) => {
        if (!onPaste) return;
        const imageItem = Array.from(event.clipboardData?.items || []).find(item => (
            item.kind === 'file' && item.type.startsWith('image/')
        ));
        const imageFile = imageItem?.getAsFile();
        if (!imageFile) return;
        event.preventDefault();
        onPaste(imageFile);
    };

    const selectTab = (nextTab) => {
        if (nextTab === tab) return;
        if (searchTimerRef.current) {
            clearTimeout(searchTimerRef.current);
            searchTimerRef.current = null;
        }
        requestSequenceRef.current += 1;
        loadingMoreRef.current = false;
        setLoadingMore(false);
        setTab(nextTab);
        setQuery('');
    };

    const tabLabel = getTabLabel(tab);

    return (
        <section
            className={`${styles.picker} ${compact ? styles.compact : ''}`}
            aria-label="GIF And Sticker Archive"
            onPaste={handlePaste}
        >
            <header className={styles.header}>
                <span className={styles.eyebrow}>Poker Media Command</span>
                <span className={styles.title}>{tabLabel} Archive</span>
                {onClose ? (
                    <button
                        className={styles.closeAction}
                        type="button"
                        onClick={onClose}
                        aria-label="Close GIF And Sticker Archive"
                    >
                        Close
                    </button>
                ) : null}
            </header>

            <div className={styles.commandRail} role="tablist" aria-label="Media Type">
                <button
                    className={styles.command}
                    type="button"
                    role="tab"
                    aria-selected={tab === 'gif'}
                    aria-controls={resultsId}
                    tabIndex={tab === 'gif' ? 0 : -1}
                    data-active={tab === 'gif'}
                    onClick={() => selectTab('gif')}
                >
                    GIFs
                </button>
                <button
                    className={styles.command}
                    type="button"
                    role="tab"
                    aria-selected={tab === 'sticker'}
                    aria-controls={resultsId}
                    tabIndex={tab === 'sticker' ? 0 : -1}
                    data-active={tab === 'sticker'}
                    onClick={() => selectTab('sticker')}
                >
                    Stickers
                </button>
            </div>

            <div className={styles.searchRow}>
                <label className={styles.searchLabel} htmlFor={searchInputId}>
                    Search Archive
                </label>
                <input
                    ref={inputRef}
                    id={searchInputId}
                    className={styles.searchInput}
                    type="search"
                    value={query}
                    onChange={event => handleSearch(event.target.value)}
                    placeholder={`Search ${tabLabel}`}
                    autoComplete="off"
                />
            </div>

            <div
                ref={gridRef}
                id={resultsId}
                className={styles.results}
                aria-label={`${tabLabel} Results`}
                role="tabpanel"
            >
                {loading ? (
                    <PickerStatus
                        title={`Loading ${tabLabel}`}
                        detail="Scanning The Poker Media Archive"
                    />
                ) : error ? (
                    <PickerStatus
                        title={error}
                        detail="The Media Service Did Not Respond"
                        actionLabel="Retry"
                        onAction={() => void loadTrending()}
                        alert
                    />
                ) : gifs.length === 0 ? (
                    <PickerStatus
                        title={`No ${tabLabel} Found`}
                        detail="Try Another Search"
                    />
                ) : (
                    <ul className={styles.mediaGrid}>
                        {gifs.map((gif, index) => {
                            const mediaTitle = String(gif.title || `${tabLabel} Result ${index + 1}`);
                            return (
                                <li className={styles.mediaItem} key={gif.id || `${gif.url}-${index}`}>
                                    <button
                                        className={styles.mediaAction}
                                        type="button"
                                        onClick={() => onSelect?.(gif.url)}
                                        aria-label={`Select ${mediaTitle}`}
                                    >
                                        <img
                                            className={styles.media}
                                            src={gif.preview || gif.url}
                                            alt=""
                                            loading="lazy"
                                            draggable="false"
                                        />
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}

                {loadingMore ? (
                    <span className={styles.loadingMore} role="status" aria-live="polite">
                        Loading More
                    </span>
                ) : null}
            </div>

            <footer className={styles.footer}>Powered By GIPHY</footer>
        </section>
    );
};

export default GiphyPicker;
