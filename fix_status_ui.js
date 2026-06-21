const fs = require('fs');
const path = '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/pages/hub/MLB-ANALYTICS/status.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. timeAgo timezone fix
content = content.replace(
    /const timeAgo = \(dateString: string \| null \| undefined\): string => {\s+if \(!dateString\) return '';\s+const past = new Date\(dateString\);/g,
    `const timeAgo = (dateString: string | null | undefined): string => {
        if (!dateString) return '';
        const safeDate = dateString.endsWith('Z') || dateString.includes('+') ? dateString : dateString + 'Z';
        const past = new Date(safeDate);`
);

// 2. formatDate timezone fix
content = content.replace(
    /const formatDate = \(dateString: string \| null \| undefined\): string => {\s+if \(!dateString\) return '';\s+const d = new Date\(dateString\);/g,
    `const formatDate = (dateString: string | null | undefined): string => {
        if (!dateString) return '';
        const safeDate = dateString.endsWith('Z') || dateString.includes('+') ? dateString : dateString + 'Z';
        const d = new Date(safeDate);`
);

// 3. brierColor and fmtBrier
content = content.replace(
    /const brierColor = \(b: number \| null \| undefined\): string => {\s+if \(typeof b !== 'number' \|\| isNaN\(b\)\) return 'text-slate-400';\s+if \(b < 0.20\) return 'text-\[#00D4FF\]';\s+if \(b <= 0.25\) return 'text-\[#FFB020\]';\s+return 'text-\[#FF4444\]';\s+};\s+const fmtBrier = \(b: number \| null \| undefined\): string => \(typeof b === 'number' && !isNaN\(b\)\) \? b.toFixed\(3\) : '-';/g,
    `const brierColor = (val: number | string | null | undefined): string => {
        const b = Number(val);
        if (isNaN(b) || val == null || val === '') return 'text-slate-400';
        if (b < 0.20) return 'text-[#00D4FF]';
        if (b <= 0.25) return 'text-[#FFB020]';
        return 'text-[#FF4444]';
    };
    const fmtBrier = (val: number | string | null | undefined): string => {
        const b = Number(val);
        return (!isNaN(b) && val != null && val !== '') ? b.toFixed(3) : '-';
    };`
);

// 4. sectionHeader typography
content = content.replace(
    /<h2 className="text-\[13px\] font-bold text-\[#00D4FF\] tracking-\[0\.15em\] m-0 drop-shadow-\[0_0_8px_rgba\(0,212,255,0\.3\)\]">\{label\}<\/h2>/g,
    `<h2 className="text-[14px] font-extrabold text-[#00D4FF] tracking-[0.15em] m-0 drop-shadow-[0_0_8px_rgba(0,212,255,0.3)] font-['Rajdhani'] uppercase">{label}</h2>`
);

// 5. HUD Flicker
content = content.replace(
    /<div className="px-0 md:px-4 py-6 max-w-4xl mx-auto w-full">/g,
    `<div className={\`px-0 md:px-4 py-6 max-w-4xl mx-auto w-full transition-opacity duration-300 \${isValidating && !isLoading ? 'opacity-70' : ''}\`}>`
);

// 6. Refresh Button
content = content.replace(
    /className={`bg-transparent border border-\[#3d4f5f\] text-\[#00D4FF\] px-3 py-1\.5 rounded flex items-center gap-2 cursor-pointer text-xs font-bold tracking-widest uppercase transition-colors hover:bg-white\/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-\[#00D4FF\] \${manualRefreshing && isValidating \? 'opacity-50' : ''}`}/g,
    'className={`bg-gradient-to-b from-[#1a2332] to-[#0d1117] border-[2px] border-[#3d4f5f] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.3),0_4px_10px_rgba(0,0,0,0.4)] text-[#00D4FF] px-3 py-1.5 rounded flex items-center gap-2 cursor-pointer text-[10px] font-extrabold tracking-widest uppercase transition-all hover:bg-[#1a2332] hover:shadow-[0_0_10px_rgba(0,212,255,0.2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] ${manualRefreshing && isValidating ? \'opacity-50\' : \'\'}`}'
);

// 7. Grid wrappers padding
content = content.replace(
    /<div className="grid grid-cols-2 md:grid-cols-3 gap-4">/g,
    `<div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-4 md:px-0">`
);
content = content.replace(
    /<div className="grid grid-cols-1 md:grid-cols-3 gap-4">/g,
    `<div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-4 md:px-0">`
);
content = content.replace(
    /<div className="grid grid-cols-2 md:grid-cols-4 gap-4">/g,
    `<div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 md:px-0">`
);
content = content.replace(
    /<div className="text-\[10px\] text-slate-500 tracking-wider mt-2 px-1">/g,
    `<div className="text-[10px] text-slate-500 tracking-wider mt-2 px-4 md:px-0">`
);

// 8. Missing loading skeletons
content = content.replace(
    /<\/div>\n                        <\/div>\n                    <\/div>\n                \) : \(/g,
    `                            {[1, 2, 3].map((i) => (
                                <div key={\`list-\${i}\`} className="bg-[#0d1117] border-[2px] border-[#3d4f5f] rounded-xl p-4 h-32 animate-pulse shadow-[0_4px_10px_rgba(0,0,0,0.5)] mt-4"></div>
                            ))}
                        </div>
                    </div>
                ) : (`
);

// 9. Bet Tier Distribution Wrapper
content = content.replace(
    /<div className={\`\$\{listPanelClass\} p-4\`}>/g,
    `<div className={\`\${cardClass} p-4 mx-4 md:mx-0\`}>`
);

// 10. Tabular Numeric Fonts
content = content.replace(
    /className={\`text-lg font-bold tabular-nums break-words \$\{item.warn \? 'text-\[#FF4444\] drop-shadow-\[0_0_10px_rgba\(255,68,68,0\.4\)\]' : 'text-\[#00D4FF\] drop-shadow-\[0_0_10px_rgba\(0,212,255,0\.4\)\]'\}`}/g,
    'className={`text-xl font-extrabold font-[\'Rajdhani\'] tabular-nums break-words ${item.warn ? \'text-[#FF4444] drop-shadow-[0_0_10px_rgba(255,68,68,0.4)]\' : \'text-[#00D4FF] drop-shadow-[0_0_10px_rgba(0,212,255,0.4)]\'}`}'
);

content = content.replace(
    /<div className="text-3xl font-bold text-\[#00D4FF\] tabular-nums drop-shadow-\[0_0_15px_rgba\(0,212,255,0\.6\)\]">/g,
    `<div className="text-3xl font-extrabold font-['Rajdhani'] text-[#00D4FF] tabular-nums drop-shadow-[0_0_15px_rgba(0,212,255,0.6)]">`
);

content = content.replace(
    /<div className={\`text-2xl font-bold tabular-nums \$\{brierColor\(accuracy\.wtd_avg_brier_ml\)\}\`}>/g,
    `<div className={\`text-2xl font-extrabold font-['Rajdhani'] tabular-nums \${brierColor(accuracy.wtd_avg_brier_ml)}\`}>`
);

content = content.replace(
    /<div className={\`text-2xl font-bold tabular-nums \$\{brierColor\(accuracy\.wtd_avg_brier_props\)\}\`}>/g,
    `<div className={\`text-2xl font-extrabold font-['Rajdhani'] tabular-nums \${brierColor(accuracy.wtd_avg_brier_props)}\`}>`
);

content = content.replace(
    /<div className="text-2xl font-bold text-\[#00D4FF\] tabular-nums">/g,
    `<div className="text-2xl font-extrabold font-['Rajdhani'] text-[#00D4FF] tabular-nums">`
);

fs.writeFileSync(path, content, 'utf8');
console.log('UI fixes applied successfully!');
