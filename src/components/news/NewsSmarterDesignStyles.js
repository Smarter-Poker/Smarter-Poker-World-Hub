import React from 'react';

/**
 * #SMARTERDESIGN for /hub/news (Dan, 2026-11-27): "POKER NEWS ... NEEDS THE
 * SAME #SMARTERDESIGN UPGRADE TO EVERY SINGLE PAGE, SUBPAGE, BUTTON AND
 * EVERYTHING ELSE, EXACTLY LIKE WE'VE DONE FOR EVERY OTHER WORLD HUB PAGE".
 *
 * Visual layer only, rendered after LiveWireStyles so it wins on equal terms.
 * The page keeps every state, handler, feed and route. The rules follow
 * docs/SMARTERDESIGN.md:
 *   - one continuous steel rim per surface, never a framed card inside a
 *     framed section (the old grid frame, the inset ::before/::after second
 *     rims and the framed section shells are removed);
 *   - chrome-row controls that light cobalt when selected (tabs, source
 *     chips, sort, view toggle) with a 44px touch target;
 *   - white titles, silver supporting text, ice blue emphasis; red only for
 *     Breaking and errors; no yellow, gold, amber, purple or pink text;
 *   - condensed live type for titles and tabular figures for counts.
 * The `!important` flags here answer the `!important` flags in
 * LiveWireStyles; nothing else needs them.
 */
export default function NewsSmarterDesignStyles() {
    return (
        <style jsx global>{`
            .news-hub.live-wire.smarterdesign {
                --nsd-rim: url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch;
                --nsd-row: url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch;
                --nsd-stat: url('/images/smarterdesign/chrome-stat.webp') 11 / 4px stretch;
                --nsd-active: url('/images/smarterdesign/chrome-active-v2.webp') 11 / 4px stretch;
                --nsd-ink: #040d18;
                --nsd-navy: linear-gradient(155deg, #182d43 0%, #0b1c2c 43%, #050e18 87%);
                --nsd-control: linear-gradient(180deg, #263f58, #112338 39%, #071420 77%, #12283c);
                --nsd-cobalt: linear-gradient(180deg, #1981ec, #0c55c0 26%, #07377e 76%, #125bba);
                --nsd-type: var(--font-rajdhani, 'Arial Narrow'), 'Arial Narrow', sans-serif;
                --wire-ice: #f2f7ff;
                --wire-muted: #bdd0e2;
                --wire-blue: #86daff;
                background:
                    radial-gradient(ellipse at 70% 0%, rgba(21, 59, 100, 0.34), transparent 46%),
                    #040d18;
                color: #f2f7ff;
            }

            /* ---------- Image header: directly under the global header ----------
               Dan, 2026-11-27: "THE HEADER IMAGE NEEDS TO BE MOVED UP TO THE TOP OF
               THE PAGE, (JUST BELOW THE GLOBAL HEADER)". The global header's own
               clearance block already reserves its height; the page's old 60px
               "room for the fixed header" padding and the layout's top padding
               stacked a second gap on top of it. */
            .news-hub.live-wire.smarterdesign {
                padding-top: env(safe-area-inset-top, 0px) !important;
            }
            .news-hub.live-wire.smarterdesign .layout {
                padding-top: 8px !important;
            }
            .news-hub.smarterdesign .news-image-header {
                margin: 0 0 12px;
            }
            .news-hub.smarterdesign .news-desk-kicker {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                margin: 0;
                color: #bdd0e2;
                font: 700 clamp(0.74rem, 1.1vw, 0.88rem)/1.25 var(--nsd-type);
                letter-spacing: 0.03em;
                text-transform: none;
                font-variant-numeric: tabular-nums;
            }
            /* ---------- Shared chrome controls ---------- */
            .news-hub.smarterdesign :is(
                .section-tab,
                .source-chip,
                .story-sort-toggle button,
                .view-toggle button,
                .feed-status-alert button,
                .feed-filter-chip button,
                .no-results button,
                .see-all-btn,
                .view-all,
                .event-register,
                .location-enable,
                .reels-empty-state button,
                .news-reels-console__text-action,
                .share-buttons button,
                .newsletter button
            ) {
                box-sizing: border-box;
                min-height: 44px;
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: var(--nsd-control) !important;
                color: #f2f7ff !important;
                font-family: var(--nsd-type) !important;
                font-weight: 700 !important;
                letter-spacing: 0.02em;
                text-transform: none !important;
                box-shadow: none !important;
                cursor: pointer;
                touch-action: manipulation;
            }
            .news-hub.smarterdesign :is(
                .section-tab.active,
                .section-tab[aria-selected="true"],
                .source-chip.active,
                .story-sort-toggle button.active,
                .view-toggle button.active,
                .event-register,
                .feed-status-alert button
            ) {
                border-image: var(--nsd-active) !important;
                background: var(--nsd-cobalt) !important;
                background-clip: padding-box !important;
                color: #fff !important;
            }
            .news-hub.smarterdesign :is(
                .section-tab,
                .source-chip,
                .story-sort-toggle button,
                .view-toggle button,
                .no-results button,
                .event-register,
                .share-buttons button
            ):active {
                filter: brightness(0.89);
            }
            .news-hub.smarterdesign :is(button, a, input, [role="button"], [role="tab"]):focus-visible {
                outline: 2px solid #9ee3ff !important;
                outline-offset: 2px;
            }

            /* ---------- Section tabs ---------- */
            .news-hub.smarterdesign .section-tabs {
                display: grid;
                grid-template-columns: repeat(5, minmax(0, 1fr));
                gap: 6px;
                margin: 0 0 12px;
                padding: 0;
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            .news-hub.smarterdesign .section-tab {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                min-width: 0;
                padding: 4px 6px !important;
                font-size: clamp(0.82rem, 2.6vw, 1.02rem) !important;
                line-height: 1.1;
                text-align: center;
                white-space: normal;
                overflow-wrap: anywhere;
            }
            .news-hub.smarterdesign .section-tab svg {
                flex: none;
                color: #86daff;
            }
            .news-hub.smarterdesign .section-tab.active svg {
                color: #fff;
            }

            /* ---------- Breaking ticker ---------- */
            .news-hub.smarterdesign .breaking-ticker {
                min-height: 44px;
                margin: 0 0 12px;
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: var(--nsd-navy) !important;
                color: #f2f7ff;
            }
            .news-hub.smarterdesign .breaking-badge {
                border-radius: 0;
                background: #c4222f;
                color: #fff;
                font-family: var(--nsd-type);
                font-weight: 700;
                letter-spacing: 0.04em;
            }

            /* ---------- Source chips ---------- */
            .news-hub.smarterdesign .source-filters {
                gap: 6px;
                margin: 0 0 12px;
                padding: 0 0 2px;
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            .news-hub.smarterdesign .source-chip {
                display: inline-flex;
                align-items: center;
                gap: 7px;
                flex: none;
                padding: 4px 13px !important;
                font-size: 0.95rem !important;
            }
            .news-hub.smarterdesign .source-chip .chip-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #86daff !important;
                box-shadow: 0 0 6px rgba(134, 218, 255, 0.7);
            }
            .news-hub.smarterdesign .source-chip.active .chip-dot {
                background: #fff !important;
            }
            .news-hub.smarterdesign .source-chip .chip-count {
                min-width: 1.4em;
                padding: 1px 6px;
                border-radius: 9px;
                background: rgba(4, 13, 24, 0.7);
                color: #bdd0e2;
                font: 700 0.78rem/1.3 var(--font-inter, Inter), sans-serif;
                font-variant-numeric: tabular-nums;
                text-align: center;
            }
            .news-hub.smarterdesign .source-chip.active .chip-count {
                color: #fff;
            }

            /* ---------- Search and view ---------- */
            .news-hub.smarterdesign .search-view-row {
                gap: 8px;
                margin: 0 0 12px;
                padding: 0 !important;
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            .news-hub.smarterdesign .news-search-input {
                box-sizing: border-box;
                min-height: 44px;
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: #040d18 !important;
                color: #f2f7ff !important;
                font: 500 1rem/1.2 var(--font-inter, Inter), sans-serif !important;
                box-shadow: none !important;
            }
            .news-hub.smarterdesign .news-search-input::placeholder {
                color: #9fb4c8;
                opacity: 1;
                font-family: var(--font-inter, Inter), sans-serif;
                letter-spacing: 0;
            }
            .news-hub.smarterdesign .search-leading-icon,
            .news-hub.smarterdesign .search-clear-button {
                color: #86daff !important;
            }
            .news-hub.smarterdesign .search-clear-button {
                min-width: 44px;
                min-height: 44px;
            }
            .news-hub.smarterdesign .search-dropdown {
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: var(--nsd-navy) !important;
            }
            .news-hub.smarterdesign .search-suggestion {
                min-height: 44px;
                color: #f2f7ff;
            }
            .news-hub.smarterdesign .search-suggestion.active,
            .news-hub.smarterdesign .search-suggestion:focus-visible {
                background: rgba(25, 129, 236, 0.28) !important;
            }
            .news-hub.smarterdesign .suggestion-source {
                color: #86daff !important;
                font-family: var(--nsd-type);
                font-weight: 700;
            }
            .news-hub.smarterdesign .view-toggle {
                gap: 6px;
                padding: 0 !important;
                border: 0 !important;
                background: transparent !important;
            }
            .news-hub.smarterdesign .view-toggle button {
                display: grid;
                place-items: center;
                width: 44px;
                min-width: 44px;
                height: 44px;
                padding: 0 !important;
            }
            .news-hub.smarterdesign .bookmark-counter {
                color: #86daff;
                font: 700 0.9rem/1 var(--nsd-type);
                font-variant-numeric: tabular-nums;
            }

            /* ---------- Story signal and sort ---------- */
            .news-hub.smarterdesign .story-signal-bar {
                gap: 8px;
                margin: 0 0 12px;
                padding: 6px 6px 6px 12px !important;
                border: 5px solid transparent !important;
                border-image: var(--nsd-rim) !important;
                border-radius: 0 !important;
                background: var(--nsd-navy) !important;
                box-shadow: none !important;
            }
            .news-hub.smarterdesign .story-signal-readout {
                gap: 7px;
                color: #bdd0e2;
                font: 700 0.86rem/1.2 var(--nsd-type);
                letter-spacing: 0.03em;
                text-transform: none;
            }
            .news-hub.smarterdesign .story-signal-readout strong {
                color: #fff;
                font: 700 1.25rem/1 var(--nsd-type);
                font-variant-numeric: tabular-nums;
            }
            .news-hub.smarterdesign .story-signal-pulse {
                background: #86daff;
                box-shadow: 0 0 8px rgba(134, 218, 255, 0.8);
            }
            .news-hub.smarterdesign .story-signal-copy {
                color: #9fb4c8;
                font-family: var(--font-inter, Inter), sans-serif;
                font-weight: 500;
                text-transform: none;
            }
            .news-hub.smarterdesign .story-sort-toggle {
                gap: 6px;
                border: 0 !important;
                background: transparent !important;
            }
            .news-hub.smarterdesign .story-sort-toggle button {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 4px 14px !important;
                font-size: 1rem !important;
            }

            /* ---------- Status, notices, stats ---------- */
            .news-hub.smarterdesign .feed-status-alert,
            .news-hub.smarterdesign .feed-filter-chip,
            .news-hub.smarterdesign .bookmark-notice,
            .news-hub.smarterdesign .reading-stats-bar {
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: var(--nsd-navy) !important;
                box-shadow: none !important;
                color: #f2f7ff;
            }
            .news-hub.smarterdesign .feed-status-alert strong {
                color: #ff8a93;
            }
            .news-hub.smarterdesign .feed-status-alert span,
            .news-hub.smarterdesign .bookmark-notice {
                color: #bdd0e2;
            }
            .news-hub.smarterdesign .feed-filter-chip {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 3px 3px 3px 12px;
                color: #86daff;
                font: 700 0.9rem/1.2 var(--nsd-type);
            }
            .news-hub.smarterdesign .feed-filter-chip button {
                padding: 2px 12px;
            }
            .news-hub.smarterdesign .reading-stats-bar {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 4px 14px;
                margin: 0 0 12px;
                padding: 8px 12px;
                color: #bdd0e2;
                font: 700 0.86rem/1.2 var(--nsd-type);
                font-variant-numeric: tabular-nums;
            }
            .news-hub.smarterdesign .reading-stats-bar span {
                border: 0 !important;
                background: transparent !important;
                color: #bdd0e2 !important;
            }

            /* ---------- Story grid: the cards carry the rims, the grid does not ---------- */
            .news-hub.smarterdesign .news-grid {
                gap: 10px;
                padding: 0 !important;
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            .news-hub.smarterdesign .news-grid::before,
            .news-hub.smarterdesign .news-box::after,
            .news-hub.smarterdesign .widget::before,
            .news-hub.smarterdesign .reels-preview-section::before {
                display: none !important;
                content: none !important;
            }
            .news-hub.smarterdesign .news-box {
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: var(--nsd-ink) !important;
                box-shadow: none !important;
            }
            .news-hub.smarterdesign .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .news-box {
                border-width: 5px !important;
                border-image: var(--nsd-rim) !important;
                background: var(--nsd-navy) !important;
            }
            .news-hub.smarterdesign .news-box:hover {
                transform: none !important;
                filter: brightness(1.06);
            }
            .news-hub.smarterdesign .news-box .box-title {
                color: #f2f7ff !important;
                font-family: var(--nsd-type) !important;
                font-weight: 700 !important;
                letter-spacing: 0 !important;
                text-transform: none !important;
            }
            .news-hub.smarterdesign .news-box .box-excerpt {
                color: #bdd0e2 !important;
            }
            .news-hub.smarterdesign .news-box :is(.box-meta, .time, .views, .separator) {
                color: #9fb4c8 !important;
                font-variant-numeric: tabular-nums;
            }
            .news-hub.smarterdesign .news-box .source {
                color: #86daff !important;
                font-family: var(--nsd-type);
                font-weight: 700;
            }
            .news-hub.smarterdesign .news-box :is(.box-actions button, .card-open) {
                min-width: 44px;
                min-height: 44px;
            }
            .news-hub.smarterdesign .news-box .box-actions button {
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: rgba(4, 13, 24, 0.86) !important;
                color: #f2f7ff !important;
            }
            .news-hub.smarterdesign :is(.read-indicator, .read-time-badge) {
                border-radius: 0 !important;
                background: rgba(4, 13, 24, 0.86) !important;
                color: #86daff !important;
                font-family: var(--nsd-type);
                font-weight: 700;
            }
            .news-hub.smarterdesign .readlater-overlay-btn {
                min-width: 44px;
                min-height: 44px;
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: rgba(4, 13, 24, 0.86) !important;
                color: #f2f7ff !important;
            }
            .news-hub.smarterdesign .readlater-overlay-btn.saved {
                border-image: var(--nsd-active) !important;
                background: var(--nsd-cobalt) !important;
                background-clip: padding-box !important;
            }
            .news-hub.smarterdesign .news-card-wrap.keyboard-focused .news-box,
            .news-hub.smarterdesign .news-list-item.keyboard-focused {
                outline: 2px solid #9ee3ff;
                outline-offset: 2px;
            }

            /* ---------- More stories list ---------- */
            .news-hub.smarterdesign .section-title,
            .news-hub.smarterdesign .more-stories-section > .section-title,
            .news-hub.smarterdesign .widget h4,
            .news-hub.smarterdesign .newsletter h4 {
                display: flex;
                align-items: center;
                gap: 8px;
                color: #f2f7ff !important;
                font: 700 clamp(1.05rem, 2.4vw, 1.4rem)/1.15 var(--nsd-type) !important;
                letter-spacing: 0.015em !important;
                text-transform: none !important;
            }
            .news-hub.smarterdesign :is(.section-title, .widget h4) svg {
                color: #86daff !important;
            }
            .news-hub.smarterdesign .section-desc {
                color: #bdd0e2;
            }
            .news-hub.smarterdesign .time-group-header {
                color: #86daff;
                font: 700 0.92rem/1.2 var(--nsd-type);
                letter-spacing: 0.03em;
                text-transform: none;
                border: 0;
            }
            .news-hub.smarterdesign .news-list {
                gap: 6px;
            }
            .news-hub.smarterdesign .news-list-item {
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: var(--nsd-navy) !important;
                box-shadow: none !important;
            }
            .news-hub.smarterdesign .news-list-item::before {
                display: none !important;
            }
            .news-hub.smarterdesign .news-list-item.read {
                opacity: 0.78;
            }
            .news-hub.smarterdesign .list-content h4,
            .news-hub.smarterdesign .list-title-btn {
                color: #f2f7ff !important;
                font-family: var(--nsd-type) !important;
                font-weight: 700 !important;
            }
            .news-hub.smarterdesign .list-meta {
                color: #9fb4c8 !important;
                font-variant-numeric: tabular-nums;
            }
            .news-hub.smarterdesign .category-pill {
                border-radius: 0 !important;
                background: rgba(134, 218, 255, 0.12) !important;
                color: #86daff !important;
            }
            .news-hub.smarterdesign .news-list-item .list-actions button {
                min-width: 44px;
                min-height: 44px;
                border: 0 !important;
                background: transparent !important;
                color: #bdd0e2 !important;
            }
            .news-hub.smarterdesign .new-badge {
                border-radius: 0 !important;
                background: #0c55c0 !important;
                color: #fff !important;
                font-family: var(--nsd-type);
            }
            .news-hub.smarterdesign .trending-badge {
                background: rgba(134, 218, 255, 0.18) !important;
                color: #86daff !important;
            }

            /* ---------- Sidebar widgets: one rim each, hairlines inside ---------- */
            .news-hub.smarterdesign .widget,
            .news-hub.smarterdesign .reels-preview-section {
                border: 5px solid transparent !important;
                border-image: var(--nsd-rim) !important;
                border-radius: 0 !important;
                background: var(--nsd-navy) !important;
                box-shadow: none !important;
            }
            .news-hub.smarterdesign :is(.mspt-list, .trending-list, .leaderboard, .events-list, .history-list) li {
                border-bottom: 1px solid rgba(134, 218, 255, 0.14) !important;
            }
            .news-hub.smarterdesign .trending-list .rank {
                color: #86daff !important;
                font-family: var(--nsd-type) !important;
                font-weight: 700;
                font-variant-numeric: tabular-nums;
            }
            .news-hub.smarterdesign :is(.widget-source, .mspt-time, .event-meta, .location-note, .widget-empty) {
                color: #9fb4c8 !important;
            }
            .news-hub.smarterdesign :is(.mspt-prize, .guarantee, .buy-in, .points) {
                color: #86daff !important;
                font-variant-numeric: tabular-nums;
            }
            .news-hub.smarterdesign .newsletter input {
                min-height: 44px;
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: #040d18 !important;
                color: #f2f7ff !important;
            }

            /* ---------- Videos and events: the section is open, rows carry the rim ---------- */
            .news-hub.smarterdesign .videos-section,
            .news-hub.smarterdesign .events-section,
            .news-hub.smarterdesign .reels-section {
                border: 0 !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            .news-hub.smarterdesign .video-card,
            .news-hub.smarterdesign .event-row {
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: var(--nsd-navy) !important;
                box-shadow: none !important;
            }
            .news-hub.smarterdesign .event-date {
                border: 3px solid transparent !important;
                border-image: var(--nsd-stat) !important;
                border-radius: 0 !important;
                background: var(--nsd-ink) !important;
            }
            .news-hub.smarterdesign .event-date :is(.month, .day) {
                color: #f2f7ff !important;
                font-family: var(--nsd-type);
            }
            .news-hub.smarterdesign .event-date .month {
                color: #86daff !important;
            }
            .news-hub.smarterdesign .event-details :is(h3, h4, .name) {
                color: #f2f7ff !important;
                font-family: var(--nsd-type);
                font-weight: 700;
            }
            .news-hub.smarterdesign .event-register {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 4px 14px !important;
            }

            /* ---------- Empty and loading ---------- */
            .news-hub.smarterdesign .no-results {
                color: #bdd0e2;
            }
            .news-hub.smarterdesign .no-results svg {
                color: #86daff;
            }
            .news-hub.smarterdesign .no-results p {
                color: #f2f7ff;
                font: 700 1.1rem/1.25 var(--nsd-type);
            }
            .news-hub.smarterdesign .no-results button {
                padding: 4px 18px;
            }
            .news-hub.smarterdesign .skeleton-card {
                border: 3px solid transparent;
                border-image: var(--nsd-row);
                border-radius: 0;
                background: var(--nsd-ink);
            }

            /* ---------- Share dialog ---------- */
            .news-hub.smarterdesign .share-modal {
                border: 5px solid transparent !important;
                border-image: var(--nsd-rim) !important;
                border-radius: 0 !important;
                background: var(--nsd-navy) !important;
            }
            .news-hub.smarterdesign .share-modal h3 {
                color: #f2f7ff;
                font: 700 1.35rem/1.15 var(--nsd-type);
            }
            .news-hub.smarterdesign .share-modal p {
                color: #bdd0e2;
            }
            .news-hub.smarterdesign .share-buttons {
                gap: 8px;
            }
            .news-hub.smarterdesign .share-buttons button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 4px 12px;
            }
            .news-hub.smarterdesign .share-modal .close-modal,
            .news-hub.smarterdesign .news-reels-viewer__close {
                display: grid;
                place-items: center;
                width: 44px;
                min-width: 44px;
                height: 44px;
                padding: 0;
                border: 3px solid transparent !important;
                border-image: var(--nsd-row) !important;
                border-radius: 0 !important;
                background: var(--nsd-control) !important;
                color: #f2f7ff !important;
                font-size: 1.4rem;
                line-height: 1;
            }

            /* ---------- Scroll aids ---------- */
            .news-hub.smarterdesign .scroll-progress {
                background: linear-gradient(90deg, #1981ec, #86daff) !important;
            }
            .news-hub.smarterdesign .scroll-to-top-fab {
                width: 48px;
                height: 48px;
                border: 3px solid transparent !important;
                border-image: var(--nsd-active) !important;
                border-radius: 0 !important;
                background: var(--nsd-cobalt) !important;
                background-clip: padding-box !important;
                color: #fff !important;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6) !important;
            }

            @media (max-width: 520px) {
                .news-hub.smarterdesign .section-tabs {
                    gap: 4px;
                }
                .news-hub.smarterdesign .section-tab {
                    flex-direction: column;
                    gap: 2px;
                    padding: 3px 2px !important;
                    font-size: 0.8rem !important;
                }
                .news-hub.smarterdesign .story-signal-bar {
                    padding-left: 8px !important;
                }
                .news-hub.smarterdesign .story-signal-copy {
                    display: none;
                }
            }
        `}</style>
    );
}
