/*
 * NO-UNDEF GATE for the social surface.
 *
 * The repo's own .eslintrc turns no-undef OFF, and neither `tsc --noEmit`
 * (tsconfig only includes .ts/.tsx) nor a parse-only check can see an
 * identifier that is never declared. So a ref declared in one component and
 * read in another parses perfectly and throws at runtime.
 *
 * On 2026-09-08 one pass with this config found six live ReferenceErrors on
 * the social surface, four of them pre-existing:
 *   - ReelsFeedCarousel read notInterestedIdsRef, declared in ReelViewer
 *   - SharePostModal's GroupsTab read closeTimerRef, declared in ShareToFeedTab
 *   - social-media/index.js called setBookmarkCount after its state was removed
 *   - social-pages/[pageId].js "Photo/Video" called imageInputRef, never declared
 *   - SmarterPokerLayout's SPNavBar called setNotifications, setUnreadCount and
 *     authUser, all owned by its parent - both notification handlers threw
 *
 * Pinned at zero by __tests__/no-social-surface-reference-errors.law.test.mjs.
 */
import js from '@eslint/js';
import react from 'eslint-plugin-react';
export default [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window:'readonly', document:'readonly', console:'readonly', navigator:'readonly',
        localStorage:'readonly', sessionStorage:'readonly', fetch:'readonly', setTimeout:'readonly',
        clearTimeout:'readonly', setInterval:'readonly', clearInterval:'readonly', URL:'readonly',
        Blob:'readonly', FormData:'readonly', Image:'readonly', Audio:'readonly', alert:'readonly',
        requestAnimationFrame:'readonly', cancelAnimationFrame:'readonly', CustomEvent:'readonly',
        IntersectionObserver:'readonly', ResizeObserver:'readonly', MutationObserver:'readonly',
        AbortController:'readonly', process:'readonly', Buffer:'readonly', global:'readonly',
        performance:'readonly', crypto:'readonly', structuredClone:'readonly', MediaRecorder:'readonly',
        FileReader:'readonly', Notification:'readonly', speechSynthesis:'readonly', DOMParser:'readonly',
        HTMLElement:'readonly', Element:'readonly', Event:'readonly', location:'readonly', history:'readonly',
        screen:'readonly', matchMedia:'readonly', getComputedStyle:'readonly', btoa:'readonly', atob:'readonly',
        TextEncoder:'readonly', TextDecoder:'readonly', WebSocket:'readonly', RTCPeerConnection:'readonly',
        MediaStream:'readonly', SpeechSynthesisUtterance:'readonly', queueMicrotask:'readonly', confirm:'readonly', prompt:'readonly', XMLHttpRequest:'readonly', createImageBitmap:'readonly', URLSearchParams:'readonly', Headers:'readonly', Request:'readonly', Response:'readonly', File:'readonly', CanvasRenderingContext2D:'readonly', OffscreenCanvas:'readonly', ImageData:'readonly', AudioContext:'readonly', webkitAudioContext:'readonly', SpeechRecognition:'readonly', webkitSpeechRecognition:'readonly', BroadcastChannel:'readonly', indexedDB:'readonly', caches:'readonly', self:'readonly', Worker:'readonly', importScripts:'readonly', __dirname:'readonly', require:'readonly', module:'readonly', exports:'readonly', HTMLVideoElement:'readonly', HTMLImageElement:'readonly', HTMLCanvasElement:'readonly', DataTransfer:'readonly', ClipboardItem:'readonly', navigator:'readonly',
      },
    },
    plugins: { react },
    settings: { react: { version: '18' } },
    rules: {
      'no-undef': 'error', '@next/next/no-html-link-for-pages':'off',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'no-unused-vars': 'off',
      'no-empty': 'off', 'no-prototype-builtins':'off', 'no-useless-escape':'off',
      'no-control-regex':'off', 'no-cond-assign':'off', 'no-fallthrough':'off',
      'no-constant-condition':'off', 'no-async-promise-executor':'off', 'no-case-declarations':'off',
      'no-sparse-arrays':'off', 'no-irregular-whitespace':'off', 'no-misleading-character-class':'off',
      'no-self-assign':'off', 'require-yield':'off', 'no-dupe-keys':'off', 'no-redeclare':'off',
    },
  },
];
