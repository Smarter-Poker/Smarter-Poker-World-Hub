import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cleanRecentSearch, readRecentSearches, rememberSearch, writeRecentSearches } from '../../lib/videoLibraryRecentSearches.mjs';

export default function BrowseSearch({ value, onChange, onSearch, inputRef, suggestions = [], placeholder = 'Search Videos...' }) {
    const [recent, setRecent] = useState([]);
    const [open, setOpen] = useState(false);
    const [focused, setFocused] = useState(false);
    const [active, setActive] = useState(-1);
    const [hidden, setHidden] = useState(false);
    const [storageFailed, setStorageFailed] = useState(false);
    const rootRef = useRef(null);
    const id = useId().replace(/:/g, '');
    const query = cleanRecentSearch(value).toLocaleLowerCase();
    const options = useMemo(() => {
        const history = recent.filter(text => !query || text.toLocaleLowerCase().includes(query)).map(text => ({ text, recent: true }));
        const seen = new Set(history.map(item => item.text.toLocaleLowerCase()));
        const matches = [];
        if (query) for (const value of suggestions) {
            const text = cleanRecentSearch(value);
            const key = text.toLocaleLowerCase();
            if (text && key.includes(query) && !seen.has(key)) {
                matches.push({ text, recent: false });
                seen.add(key);
                if (matches.length === 5) break;
            }
        }
        return [...history, ...matches];
    }, [recent, suggestions, query]);

    useEffect(() => {
        try { setRecent(readRecentSearches(window.localStorage)); } catch { setRecent([]); }
        const outside = event => { if (!rootRef.current?.contains(event.target)) { setOpen(false); setActive(-1); } };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, []);
    useEffect(() => { setActive(-1); }, [value]);
    useEffect(() => {
        let previous = window.scrollY;
        const scroll = () => {
            const current = window.scrollY;
            if (focused || current < 80 || current < previous - 3) setHidden(false);
            else if (current > previous + 3) { setHidden(true); setOpen(false); }
            previous = current;
        };
        window.addEventListener('scroll', scroll, { passive: true });
        if (focused) setHidden(false);
        return () => window.removeEventListener('scroll', scroll);
    }, [focused]);

    const persist = next => {
        setRecent(next);
        try { setStorageFailed(!writeRecentSearches(window.localStorage, next)); } catch { setStorageFailed(true); }
    };
    const submit = text => {
        const clean = cleanRecentSearch(text);
        if (clean) persist(rememberSearch(recent, clean));
        onChange(clean);
        onSearch?.(clean);
        setOpen(false);
        setActive(-1);
        inputRef.current?.focus();
    };
    return <form ref={rootRef} className={`vl-search-wrap vl-browse-search${hidden ? ' is-scroll-hidden' : ''}`} data-tutorial="search" role="search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setOpen(false); setActive(-1); } }} onSubmit={event => { event.preventDefault(); submit(value); }}>
        <input ref={inputRef} type="search" role="combobox" aria-label="Search The Poker Video Library" aria-keyshortcuts="/" aria-autocomplete="list" aria-expanded={open && options.length > 0} aria-controls={`${id}-options`} aria-activedescendant={open && active >= 0 && active < options.length ? `${id}-option-${active}` : undefined} placeholder={placeholder} value={value} maxLength={80}
            onChange={event => { onChange(event.target.value); setOpen(true); }}
            onFocus={() => { setFocused(true); setHidden(false); setOpen(true); }}
            onBlur={event => { if (!event.currentTarget.form?.contains(event.relatedTarget)) { setFocused(false); setOpen(false); setActive(-1); } }}
            onKeyDown={event => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    if (!options.length) return;
                    event.preventDefault(); setOpen(true);
                    setActive(previous => event.key === 'ArrowDown' ? (previous + 1) % options.length : (previous <= 0 ? options.length - 1 : previous - 1));
                } else if (event.key === 'Enter' && open && active >= 0 && active < options.length) { event.preventDefault(); submit(options[active].text); }
                else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); }
            }} />
        {value ? <button type="button" className="vl-search-clear" aria-label="Clear Video Search" onClick={() => { onChange(''); setOpen(true); inputRef.current?.focus(); }}>Clear</button> : <kbd className="vl-search-shortcut" aria-hidden="true">/</kbd>}
        <button type="submit" className="vl-search-submit" aria-label="Submit Video Search">Search</button>
        {open && options.length > 0 && <div className="vl-search-options">
            {recent.length > 0 && <div className="vl-search-option-heading"><span>Recent Searches</span><button type="button" className="vl-search-history-clear" onPointerDown={event => event.preventDefault()} onClick={() => persist([])}>Clear Recent Searches</button></div>}
            <ul id={`${id}-options`} role="listbox" aria-label="Video Search Suggestions">
                {options.map((option, index) => <li key={option.text.toLocaleLowerCase()} className="vl-search-option-row" role="presentation">
                    <button type="button" id={`${id}-option-${index}`} role="option" aria-selected={active === index} className="vl-search-option" onPointerDown={event => event.preventDefault()} onClick={() => submit(option.text)}>{option.text}<small>{option.recent ? 'Recent Search' : 'From The Library'}</small></button>
                    {option.recent && <button type="button" className="vl-search-remove" aria-label={`Remove Recent Search ${option.text}`} onPointerDown={event => event.preventDefault()} onClick={() => persist(recent.filter(text => text !== option.text))}>Remove</button>}
                </li>)}
            </ul>
        </div>}
        {storageFailed && <span className="vl-search-storage-note" role="status">Recent Searches Are Available For This Visit Only.</span>}
    </form>;
}
