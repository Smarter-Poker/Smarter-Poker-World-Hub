import React from 'react';

/**
 * Visual-only skin for /hub/news.
 *
 * All data, state, handlers and article components remain owned by the page.
 * Keeping the skin here makes the approved Live Intelligence Wire treatment
 * easy to audit without introducing a second news implementation.
 */
export default function LiveWireStyles() {
    return (
        <style jsx global>{`
            .news-hub.live-wire {
                --wire-void: #000407;
                --wire-deck: #03090d;
                --wire-panel: #061018;
                --wire-rail: #5f8498;
                --wire-rail-dim: #203f51;
                --wire-blue: #31c2ff;
                --wire-blue-soft: rgba(49, 194, 255, 0.14);
                --wire-alert: #ff4d5b;
                --wire-ice: #e4edf1;
                --wire-muted: #81939e;
                min-height: 100vh;
                padding-bottom: 78px;
                color: var(--wire-ice);
                background:
                    radial-gradient(circle at 69% 8%, rgba(17, 82, 130, 0.28), transparent 27%),
                    repeating-linear-gradient(90deg, transparent 0 119px, rgba(60, 128, 165, 0.025) 120px),
                    var(--wire-void);
                font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            }

            .live-wire .scroll-progress {
                height: 2px;
                background: linear-gradient(90deg, var(--wire-blue), #8ae5ff);
                box-shadow: 0 0 10px rgba(49, 194, 255, 0.65);
            }

            .live-wire .layout {
                width: min(1220px, calc(100% - 32px));
                max-width: 1220px;
                grid-template-columns: minmax(0, 1fr) 306px;
                gap: 16px;
                padding: 20px 0 24px;
            }

            .live-wire .main-content {
                min-width: 0;
            }

            .live-wire .news-desk-masthead {
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-height: 42px;
                margin: 0 0 10px;
                padding: 0 2px;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                text-transform: uppercase;
            }

            .live-wire .news-desk-title-group {
                display: flex;
                align-items: center;
                gap: 10px;
                min-width: 0;
            }

            .live-wire .live-pulse {
                width: 8px;
                height: 8px;
                flex: 0 0 auto;
                border-radius: 50%;
                background: var(--wire-alert);
                box-shadow: 0 0 12px var(--wire-alert);
                animation: wire-pulse 1.9s ease-in-out infinite;
            }

            .live-wire .news-desk-title {
                margin: 0;
                color: var(--wire-ice);
                font-family: "Arial Narrow", "Avenir Next Condensed", Inter, sans-serif;
                font-size: clamp(20px, 2.1vw, 30px);
                font-stretch: condensed;
                font-weight: 300;
                letter-spacing: 0.035em;
                line-height: 1;
                text-transform: none;
            }

            .live-wire .news-desk-kicker {
                color: var(--wire-alert);
                font-size: 9px;
                font-weight: 700;
                letter-spacing: 0.16em;
                white-space: nowrap;
            }

            .live-wire .news-desk-freshness {
                display: flex;
                align-items: center;
                gap: 9px;
                color: var(--wire-muted);
                font-size: 8px;
                letter-spacing: 0.12em;
                white-space: nowrap;
            }

            .live-wire .wire-sr-only {
                position: absolute !important;
                width: 1px !important;
                height: 1px !important;
                padding: 0 !important;
                margin: -1px !important;
                overflow: hidden !important;
                clip: rect(0, 0, 0, 0) !important;
                white-space: nowrap !important;
                border: 0 !important;
            }

            .live-wire .news-desk-freshness button {
                min-height: 30px;
                padding: 0 11px;
                border: 1px solid var(--wire-rail);
                border-radius: 999px;
                background: linear-gradient(180deg, #1b2429, #080d10);
                box-shadow: inset 0 1px rgba(227, 235, 239, 0.7);
                color: #d5dce0;
                font: 700 8px ui-monospace, monospace;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                cursor: pointer;
            }

            .live-wire .section-tabs {
                display: grid;
                grid-template-columns: repeat(5, minmax(0, 1fr));
                gap: 0;
                min-height: 50px;
                margin: 0 0 12px;
                padding: 0;
                border: 1px solid var(--wire-rail);
                border-radius: 0;
                background: var(--wire-deck);
                overflow: hidden;
            }

            .live-wire .section-tab {
                justify-content: center;
                min-width: 0;
                min-height: 50px;
                padding: 0 8px;
                border: 0;
                border-right: 1px solid var(--wire-rail-dim);
                border-radius: 0;
                background: linear-gradient(180deg, #0b151b, #03070a);
                color: #8f9ba2;
                font: 700 9px ui-monospace, SFMono-Regular, Menlo, monospace;
                letter-spacing: 0.11em;
                text-transform: uppercase;
            }

            .live-wire .section-tab:last-child {
                border-right: 0;
            }

            .live-wire .section-tab:hover {
                background: #0a1821;
                color: var(--wire-ice);
            }

            .live-wire .section-tab.active {
                border-color: var(--wire-rail-dim);
                border-bottom: 3px solid var(--wire-blue);
                background: linear-gradient(180deg, #102432, #041018);
                box-shadow: inset 0 0 24px rgba(49, 194, 255, 0.12);
                color: #fff;
            }

            .live-wire .section-tab svg {
                width: 13px;
                height: 13px;
                color: currentColor;
            }

            .live-wire .breaking-ticker {
                min-height: 36px;
                margin: 0 0 11px;
                padding: 0;
                gap: 0;
                border: 1px solid #4b6270;
                border-radius: 0;
                background: #02070a;
            }

            .live-wire .breaking-ticker:hover {
                border-color: var(--wire-alert);
                background: #071016;
            }

            .live-wire .breaking-badge {
                align-self: stretch;
                display: flex;
                align-items: center;
                padding: 0 13px;
                border-radius: 0;
                background: var(--wire-alert);
                font: 800 8px ui-monospace, monospace;
                letter-spacing: 0.14em;
            }

            .live-wire .breaking-text {
                padding: 0 12px;
                color: #b9c6cd;
                font-size: 10px;
            }

            .live-wire .source-filters {
                flex-wrap: nowrap;
                justify-content: flex-start;
                gap: 7px;
                margin: 0 0 10px;
                padding: 10px;
                border: 1px solid #405f72;
                border-radius: 0;
                background: rgba(3, 9, 13, 0.92);
                overflow-x: auto;
                scrollbar-width: thin;
                scrollbar-color: var(--wire-rail-dim) transparent;
            }

            .live-wire .source-chip {
                flex: 0 0 auto;
                min-height: 31px;
                padding: 0 11px;
                border-color: #2d4a5b;
                border-radius: 999px;
                background: #050b0f;
                color: #9aaab3;
                font: 700 9px ui-monospace, monospace;
                letter-spacing: 0.06em;
                text-transform: uppercase;
            }

            .live-wire .source-chip:hover,
            .live-wire .source-chip.active {
                border-color: var(--source-color);
                background: color-mix(in srgb, var(--source-color) 13%, #050b0f);
                color: #fff;
            }

            .live-wire .chip-count {
                border-radius: 999px;
            }

            .live-wire .search-view-row {
                min-height: 46px;
                margin: 0 0 12px;
                padding: 7px;
                border: 1px solid #405f72;
                border-radius: 0;
                background: rgba(3, 9, 13, 0.92);
            }

            .live-wire .news-search-input {
                min-height: 32px;
                padding-left: 34px;
                padding-right: 38px;
                border: 1px solid #29495b;
                border-radius: 0;
                background: #02070a;
                color: var(--wire-ice);
                font: 10px ui-monospace, monospace;
                letter-spacing: 0.04em;
            }

            .live-wire .news-search-input:focus {
                border-color: var(--wire-blue);
                box-shadow: 0 0 0 2px rgba(49, 194, 255, 0.12);
            }

            .live-wire .search-leading-icon {
                position: absolute;
                top: 50%;
                left: 11px;
                z-index: 2;
                transform: translateY(-50%);
                color: #6f8998;
                pointer-events: none;
            }

            .live-wire .search-clear-button {
                position: absolute;
                top: 50%;
                right: 4px;
                z-index: 3;
                display: grid;
                width: 30px;
                height: 30px;
                padding: 0;
                place-items: center;
                transform: translateY(-50%);
                border: 0;
                background: transparent;
                color: #8da2ad;
                cursor: pointer;
            }

            .live-wire .search-clear-button:hover,
            .live-wire .search-clear-button:focus-visible {
                color: var(--wire-blue);
            }

            .live-wire .view-toggle {
                width: auto;
                flex: 0 0 auto;
                border-radius: 0;
                background: #02070a;
            }

            .live-wire .view-toggle button,
            .live-wire .bookmark-counter {
                border-radius: 0;
            }

            .live-wire .story-signal-bar {
                display: flex;
                align-items: stretch;
                justify-content: space-between;
                min-height: 40px;
                margin: -3px 0 12px;
                border: 1px solid #29495b;
                background:
                    linear-gradient(90deg, rgba(49, 194, 255, 0.08), transparent 44%),
                    #02070a;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                text-transform: uppercase;
            }

            .live-wire .story-signal-readout {
                display: flex;
                min-width: 0;
                align-items: center;
                gap: 9px;
                padding: 0 12px;
                color: #8297a3;
                font-size: 8px;
                font-weight: 700;
                letter-spacing: 0.11em;
            }

            .live-wire .story-signal-readout strong {
                color: var(--wire-blue);
                font-size: 12px;
                font-weight: 800;
            }

            .live-wire .story-signal-pulse {
                width: 6px;
                height: 6px;
                flex: 0 0 auto;
                border-radius: 50%;
                background: var(--wire-blue);
                box-shadow: 0 0 9px rgba(49, 194, 255, 0.85);
            }

            .live-wire .story-signal-copy {
                color: #506976;
                white-space: nowrap;
            }

            .live-wire .story-sort-toggle {
                display: flex;
                flex: 0 0 auto;
                border-left: 1px solid #29495b;
            }

            .live-wire .story-sort-toggle button {
                display: inline-flex;
                min-width: 88px;
                min-height: 38px;
                padding: 0 13px;
                align-items: center;
                justify-content: center;
                gap: 5px;
                border: 0;
                border-right: 1px solid #172f3c;
                background: #030b10;
                color: #718994;
                font: 800 8px ui-monospace, monospace;
                letter-spacing: 0.09em;
                text-transform: uppercase;
                cursor: pointer;
            }

            .live-wire .story-sort-toggle button:last-child {
                border-right: 0;
            }

            .live-wire .story-sort-toggle button:hover,
            .live-wire .story-sort-toggle button:focus-visible {
                color: var(--wire-ice);
            }

            .live-wire .story-sort-toggle button.active {
                background: linear-gradient(180deg, #102432, #041018);
                box-shadow: inset 0 -2px var(--wire-blue);
                color: #fff;
            }

            .live-wire .feed-status-alert {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 14px;
                min-height: 52px;
                margin: 0 0 10px;
                padding: 9px 11px;
                border: 1px solid rgba(255, 77, 91, 0.66);
                background: rgba(35, 7, 12, 0.92);
                color: #d9e3e8;
                font: 9px ui-monospace, SFMono-Regular, Menlo, monospace;
                letter-spacing: 0.05em;
            }

            .live-wire .feed-status-alert div,
            .live-wire .feed-status-alert span {
                display: block;
            }

            .live-wire .feed-status-alert strong {
                color: #fff;
                text-transform: uppercase;
            }

            .live-wire .feed-status-alert span {
                margin-top: 3px;
                color: #aebbc2;
            }

            .live-wire .feed-status-alert button {
                flex: 0 0 auto;
                min-width: 88px;
                min-height: 36px;
                border: 1px solid var(--wire-alert);
                background: #120408;
                color: #fff;
                font: 800 8px ui-monospace, monospace;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                cursor: pointer;
            }

            .live-wire .feed-status-alert button:hover,
            .live-wire .feed-status-alert button:focus-visible {
                background: var(--wire-alert);
                color: #080204;
            }

            .live-wire .reading-stats-bar,
            .live-wire .feed-filter-chip,
            .live-wire .bookmark-notice {
                border: 1px solid #2e5266;
                border-radius: 0;
                background: rgba(5, 16, 24, 0.92);
                font-family: ui-monospace, monospace;
                letter-spacing: 0.04em;
            }

            .live-wire .news-grid {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 10px;
                padding: 8px;
                border: 1px solid var(--wire-rail);
                border-radius: 0;
                background: #020609;
                box-shadow: none;
            }

            .live-wire .news-grid::before {
                inset: 5px;
                z-index: 0;
                border: 1px solid #174866;
                border-radius: 0;
                background: transparent;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child {
                grid-column: 1 / -1;
                height: 410px !important;
                min-height: 410px !important;
                max-height: 410px !important;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child),
            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .news-box {
                height: 238px !important;
                min-height: 238px !important;
                max-height: 238px !important;
            }

            .live-wire .news-grid .news-card-wrap {
                z-index: 1;
            }

            .live-wire .news-box {
                border: 1px solid #315b73 !important;
                border-radius: 0 !important;
                background: #03090d !important;
                box-shadow: none !important;
            }

            .live-wire .news-box::after {
                inset: 5px !important;
                border: 1px solid #143c54 !important;
                border-radius: 0 !important;
            }

            .live-wire .news-box:hover {
                transform: translateY(-1px) !important;
                border-color: var(--wire-blue) !important;
                filter: brightness(1.05);
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .news-box {
                height: 410px !important;
                min-height: 410px !important;
                max-height: 410px !important;
                display: grid !important;
                grid-template-columns: 42% 58%;
                grid-template-rows: 1fr;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-image {
                grid-column: 2;
                grid-row: 1;
                width: 100% !important;
                height: 100% !important;
                border-radius: 0 !important;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-image img {
                object-position: center;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-overlay {
                display: block !important;
                background: linear-gradient(90deg, #03090d 0%, rgba(3, 9, 13, 0.65) 32%, transparent 78%), linear-gradient(0deg, #03090d, transparent 43%) !important;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-content {
                grid-column: 1;
                grid-row: 1;
                z-index: 3;
                align-self: center;
                justify-content: center;
                height: auto !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 38px 24px 38px 28px !important;
                border-radius: 0 !important;
                background: transparent !important;
                overflow: visible !important;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-title {
                display: block !important;
                margin: 10px 0 13px !important;
                color: var(--wire-ice) !important;
                font-family: "Arial Narrow", "Avenir Next Condensed", Inter, sans-serif !important;
                font-size: clamp(31px, 3.2vw, 47px) !important;
                font-stretch: condensed;
                font-weight: 300 !important;
                letter-spacing: -0.025em;
                line-height: 0.98 !important;
                white-space: normal !important;
                overflow: visible !important;
                text-overflow: clip !important;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-excerpt {
                display: -webkit-box !important;
                margin: 0 0 17px !important;
                color: #aebbc3 !important;
                font-size: 12px !important;
                line-height: 1.55 !important;
                -webkit-line-clamp: 3;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-meta {
                color: #91a4ae !important;
                font: 8px ui-monospace, monospace !important;
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .box-image {
                height: 148px !important;
                border-radius: 0 !important;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .box-content {
                min-height: 84px !important;
                margin: 0 !important;
                padding: 10px 12px 12px !important;
                border-radius: 0 !important;
                background: #03090d !important;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .box-title {
                font-family: "Arial Narrow", "Avenir Next Condensed", Inter, sans-serif !important;
                font-size: 16px !important;
                line-height: 1.08 !important;
            }

            .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .box-excerpt {
                display: none !important;
            }

            .live-wire .box-actions button,
            .live-wire .readlater-overlay-btn,
            .live-wire .read-time-badge,
            .live-wire .read-indicator {
                border: 1px solid #486779 !important;
                border-radius: 999px !important;
                background: rgba(2, 8, 12, 0.84) !important;
                color: #cbd7dd !important;
            }

            .live-wire .more-stories-section {
                position: relative;
                margin: 18px 0 0 9px;
                padding-left: 21px;
                border-left: 1px solid #296787;
            }

            .live-wire .more-stories-section > .section-title {
                margin: 0 0 12px !important;
                padding: 0 !important;
                color: var(--wire-ice);
                font-family: "Arial Narrow", "Avenir Next Condensed", Inter, sans-serif;
                font-size: 24px !important;
                font-weight: 300;
                letter-spacing: 0;
            }

            .live-wire .more-stories-section > .section-title svg {
                color: var(--wire-blue);
            }

            .live-wire .news-list {
                gap: 10px;
            }

            .live-wire .time-group-header {
                margin: 13px 0 2px;
                padding: 0;
                border: 0;
                color: #7193a5;
                font: 700 9px ui-monospace, monospace;
                letter-spacing: 0.15em;
            }

            .live-wire .news-list-item {
                position: relative;
                min-height: 112px;
                gap: 13px;
                padding: 9px 12px 9px 9px;
                border: 1px solid #31576c;
                border-radius: 0;
                background: #03090d;
            }

            .live-wire .news-list-item::before {
                content: '';
                position: absolute;
                left: -28px;
                top: 46px;
                width: 9px;
                height: 9px;
                border: 2px solid var(--wire-blue);
                border-radius: 50%;
                background: var(--wire-void);
                box-shadow: 0 0 10px var(--wire-blue);
            }

            .live-wire .news-list-item:hover {
                border-color: var(--wire-blue);
                background: #07131a;
            }

            .live-wire .list-thumb {
                width: 104px;
                height: 90px;
                border: 1px solid #285d7a;
                border-radius: 0;
                background: #06131c;
            }

            .live-wire .list-content h4 {
                margin: 0 0 10px;
                color: var(--wire-ice);
                font-family: "Arial Narrow", "Avenir Next Condensed", Inter, sans-serif;
                font-size: 17px;
                font-weight: 500;
                line-height: 1.12;
            }

            .live-wire .list-meta {
                color: #71838e;
                font: 8px ui-monospace, monospace;
                letter-spacing: 0.055em;
                text-transform: uppercase;
            }

            .live-wire .category-pill {
                border: 1px solid currentColor;
                border-radius: 999px;
                background: transparent !important;
            }

            .live-wire .news-list-item .list-actions {
                opacity: 1;
            }

            .live-wire .news-list-item .list-actions button {
                width: 29px;
                height: 29px;
                justify-content: center;
                border: 1px solid #395a6c;
                border-radius: 50%;
                background: #040b0f;
            }

            .live-wire .sidebar {
                gap: 12px;
                padding-top: 52px;
            }

            .live-wire .widget,
            .live-wire .reels-preview-section,
            .live-wire .reels-section,
            .live-wire .videos-section,
            .live-wire .events-section {
                border: 1px solid #476a7d;
                border-radius: 0 !important;
                background: rgba(3, 9, 13, 0.96) !important;
                box-shadow: none !important;
            }

            .live-wire .widget {
                padding: 16px;
            }

            .live-wire .widget::before,
            .live-wire .reels-preview-section::before {
                inset: 5px;
                z-index: 0;
                border: 1px solid #143c54;
                border-radius: 0;
                background: transparent;
            }

            .live-wire .widget > *,
            .live-wire .reels-preview-section > * {
                position: relative;
                z-index: 1;
            }

            .live-wire .widget h4,
            .live-wire .newsletter h4 {
                margin: 0 0 12px;
                padding: 0;
                border-radius: 0;
                background: transparent;
                color: var(--wire-ice);
                font: 700 10px ui-monospace, monospace;
                letter-spacing: 0.095em;
                text-transform: uppercase;
            }

            .live-wire .widget h4 svg {
                color: var(--wire-blue);
            }

            .live-wire .mspt-list li,
            .live-wire .trending-list li,
            .live-wire .leaderboard li,
            .live-wire .events-list li,
            .live-wire .history-list li {
                border-bottom-color: #1e3948;
            }

            .live-wire .trending-list .rank {
                color: var(--wire-blue);
                font-family: ui-monospace, monospace;
            }

            .live-wire .newsletter input,
            .live-wire .newsletter button,
            .live-wire .no-results button,
            .live-wire .see-all-btn,
            .live-wire .reels-empty-state button {
                border: 1px solid #4c778f;
                border-radius: 0;
                background: #07141c;
                color: var(--wire-ice);
            }

            .live-wire .reels-preview-section {
                margin-top: 18px;
                padding: 18px;
            }

            .live-wire .section-title {
                color: var(--wire-ice);
                font-family: "Arial Narrow", "Avenir Next Condensed", Inter, sans-serif;
                font-weight: 300;
            }

            .live-wire .search-dropdown,
            .live-wire .share-modal {
                border: 1px solid var(--wire-rail);
                border-radius: 0;
                background: #030a0f;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.72);
            }

            .live-wire .search-suggestion:hover,
            .live-wire .search-suggestion.active {
                background: var(--wire-blue-soft);
            }

            .live-wire .section-tab:focus-visible,
            .live-wire .source-chip:focus-visible,
            .live-wire .news-desk-freshness button:focus-visible,
            .live-wire .news-search-input:focus-visible,
            .live-wire .news-list-item:focus-visible,
            .live-wire .widget [role="button"]:focus-visible {
                outline: 2px solid #8ee7ff;
                outline-offset: 2px;
            }

            @keyframes wire-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.45; transform: scale(0.78); }
            }

            @media (prefers-reduced-motion: reduce) {
                .live-wire .live-pulse,
                .live-wire .breaking-badge {
                    animation: none !important;
                }

                .live-wire *,
                .live-wire *::before,
                .live-wire *::after {
                    scroll-behavior: auto !important;
                    transition-duration: 0.01ms !important;
                }
            }

            @media (max-width: 1000px) {
                .live-wire .layout {
                    grid-template-columns: 1fr;
                }

                .live-wire .sidebar {
                    display: grid !important;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    order: -1;
                    align-items: stretch;
                }

                .live-wire .sidebar > .widget:not(.leaderboard):not(.events):not(.newsletter) {
                    display: none;
                }
            }

            @media (max-width: 768px) {
                .news-hub.live-wire {
                    width: 100% !important;
                    max-width: 100vw !important;
                    padding: 60px 0 74px !important;
                    overflow-x: hidden !important;
                }

                .live-wire .layout {
                    display: flex !important;
                    flex-direction: column !important;
                    width: calc(100% - 20px) !important;
                    max-width: calc(100% - 20px) !important;
                    margin: 0 auto !important;
                    padding: 12px 0 20px !important;
                }

                .live-wire .sidebar {
                    display: grid !important;
                    grid-template-columns: minmax(0, 1fr) !important;
                    order: -1 !important;
                    width: 100% !important;
                    padding: 0 0 4px !important;
                    gap: 12px !important;
                }

                .live-wire .news-desk-masthead {
                    min-height: 34px;
                    margin-bottom: 8px;
                }

                .live-wire .news-desk-title {
                    font-size: 20px;
                }

                .live-wire .news-desk-kicker,
                .live-wire .news-desk-freshness > span {
                    display: none;
                }

                .live-wire .news-desk-freshness button {
                    min-height: 28px;
                    padding: 0 9px;
                }

                .live-wire .section-tabs {
                    display: flex !important;
                    justify-content: flex-start !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    min-height: 44px;
                    margin: 0 0 10px !important;
                    padding: 0 !important;
                    overflow-x: auto;
                    scrollbar-width: none;
                }

                .live-wire .section-tabs::-webkit-scrollbar {
                    display: none;
                }

                .live-wire .section-tab {
                    flex: 0 0 108px !important;
                    min-height: 44px;
                    padding: 0 8px !important;
                    font-size: 8px;
                }

                .live-wire .breaking-ticker {
                    margin-bottom: 10px;
                }

                .live-wire .source-filters {
                    margin-bottom: 10px;
                    padding: 8px;
                }

                .live-wire .source-chip {
                    min-height: 34px;
                }

                .live-wire .search-view-row {
                    gap: 7px;
                    padding: 6px;
                }

                .live-wire .news-search-input {
                    min-height: 44px;
                }

                .live-wire .source-chip {
                    min-height: 44px;
                }

                .live-wire .search-clear-button {
                    width: 42px;
                    height: 42px;
                    right: 1px;
                }

                .live-wire .view-toggle button {
                    width: 44px;
                    height: 44px;
                }

                .live-wire .story-signal-bar {
                    min-height: 44px;
                }

                .live-wire .story-signal-readout {
                    padding: 0 9px;
                }

                .live-wire .story-signal-copy {
                    display: none;
                }

                .live-wire .story-sort-toggle button {
                    min-width: 82px;
                    min-height: 44px;
                    padding: 0 9px;
                }

                .live-wire .feed-status-alert {
                    align-items: stretch;
                    flex-direction: column;
                }

                .live-wire .feed-status-alert button {
                    width: 100%;
                    min-height: 44px;
                }

                .live-wire .news-section {
                    width: 100% !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }

                .live-wire .news-grid {
                    display: flex !important;
                    flex-direction: column !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    gap: 9px !important;
                    padding: 7px !important;
                    border-radius: 0 !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child,
                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .news-box {
                    display: flex !important;
                    flex-direction: column !important;
                    width: 100% !important;
                    height: auto !important;
                    min-height: 486px !important;
                    max-height: none !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-image {
                    order: 0;
                    width: 100% !important;
                    height: 270px !important;
                    min-height: 270px !important;
                    aspect-ratio: auto !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-image img {
                    position: absolute !important;
                    width: 100% !important;
                    height: 100% !important;
                    border-radius: 0 !important;
                    object-fit: cover !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-overlay {
                    display: block !important;
                    background: linear-gradient(0deg, #03090d 0%, transparent 68%) !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-content {
                    order: 1;
                    width: 100% !important;
                    min-height: 202px !important;
                    padding: 19px 16px 23px !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:first-child .box-title {
                    font-size: clamp(28px, 8.2vw, 35px) !important;
                    line-height: 1 !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child),
                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .news-box {
                    display: grid !important;
                    grid-template-columns: 96px minmax(0, 1fr) !important;
                    grid-template-rows: 112px !important;
                    width: 100% !important;
                    height: 112px !important;
                    min-height: 112px !important;
                    max-height: 112px !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .box-image {
                    grid-column: 1;
                    grid-row: 1;
                    width: 96px !important;
                    height: 112px !important;
                    min-height: 112px !important;
                    aspect-ratio: auto !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .box-image img {
                    position: absolute !important;
                    height: 100% !important;
                    border-radius: 0 !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .box-content {
                    grid-column: 2;
                    grid-row: 1;
                    justify-content: center;
                    min-width: 0;
                    min-height: 112px !important;
                    padding: 11px 10px !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .box-title {
                    display: -webkit-box;
                    font-size: 15px !important;
                    white-space: normal !important;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .box-meta {
                    max-width: 100%;
                    font-size: 8px !important;
                }

                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .box-meta .views,
                .live-wire .news-grid:not(.news-grid-list) > .news-card-wrap:not(:first-child) .box-meta .separator:last-of-type {
                    display: none !important;
                }

                .live-wire .box-actions,
                .live-wire .readlater-overlay-btn {
                    opacity: 1 !important;
                }

                .live-wire .more-stories-section {
                    margin: 16px 0 0 6px;
                    padding-left: 15px;
                }

                .live-wire .more-stories-section > .section-title {
                    font-size: 21px !important;
                }

                .live-wire .news-list-item {
                    min-height: 112px;
                    padding: 8px;
                    gap: 10px;
                }

                .live-wire .news-list-item::before {
                    left: -21px;
                    top: 45px;
                    width: 8px;
                    height: 8px;
                }

                .live-wire .list-thumb {
                    width: 76px;
                    height: 92px;
                }

                .live-wire .list-content h4 {
                    display: -webkit-box;
                    margin-bottom: 8px;
                    font-size: 15px;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .live-wire .list-meta .category-pill,
                .live-wire .list-meta .views,
                .live-wire .list-meta > span:nth-last-child(2),
                .live-wire .news-list-item .list-actions {
                    display: none;
                }

                .live-wire .reels-preview-section {
                    margin-top: 16px;
                    padding: 14px;
                }

                .live-wire .reels-carousel .reel-card {
                    min-width: 168px !important;
                    width: 168px !important;
                    max-width: 168px !important;
                }

                .live-wire .no-results {
                    padding: 44px 18px;
                }
            }

            @media (max-width: 390px) {
                .live-wire .news-desk-title {
                    font-size: 18px;
                }

                .live-wire .news-desk-title-group {
                    gap: 7px;
                }

                .live-wire .view-toggle .bookmark-counter {
                    display: none;
                }

                .live-wire .story-sort-toggle button {
                    min-width: 78px;
                }

                .live-wire .list-thumb {
                    width: 68px;
                }
            }
        `}</style>
    );
}
