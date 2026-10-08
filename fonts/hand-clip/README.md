# Hand clip fonts

The hand clip renderer (`/api/cron/render-hand-clips`) photographs the Club Arena share page in the packed
Chromium, which ships Open Sans and nothing else. The share page draws its transport buttons with text symbols
(U+23EE, U+25C0, U+25B6, U+275A, U+23ED) that the viewer's system font supplies, so the first share-page clip
(2026-10-07) rendered five empty buttons. `NotoSansSymbols2-HandClip.ttf` is Noto Sans Symbols 2 (SIL Open Font
License 1.1, `OFL.txt`) cut down to the blocks those symbols live in:

    pyftsubset NotoSansSymbols2-Regular.ttf --unicodes="U+00B7,U+2300-23FF,U+25A0-25FF,U+2700-27BF" \
      --output-file=NotoSansSymbols2-HandClip.ttf --name-IDs='*' --notdef-outline

The route copies every `.ttf` here into the fontconfig directory before the browser starts (see
`provisionClipFonts` in `pages/api/cron/render-hand-clips.js`); `next.config.js` traces the folder into the
route's bundle. Source: https://github.com/notofonts/symbols (NotoSansSymbols2, full, 2022).
