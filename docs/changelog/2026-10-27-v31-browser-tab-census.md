# V31 browser tab census

The authenticated V31 input panel adds the twenty-ninth Stable Admin tab. The production-build browser smoke still expected twenty-eight tabs, so its navigation, keyboard and mobile checks stopped before exercising the panels. Update only that census, explicitly require the new input tab, and bind the existing architecture guard to the browser census so future registry additions cannot silently leave it stale. All runtime, navigation, overflow and reduced-motion assertions remain unchanged.

The original V31 input approval is already merged and served by Vercel deployment `dpl_2bBPiX4tpHkYieR5TLb9HbYm9YdT`, revision `458b016bf6812fe1a98d26eb6263c794841be049`. This follow-up changes verification only.
