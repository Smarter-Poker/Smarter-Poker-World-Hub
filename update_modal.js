const fs = require('fs');
const path = './pages/hub/MLB-ANALYTICS/best-bets.tsx';
let content = fs.readFileSync(path, 'utf8');

content = content.replace(
  /const BetDetailModal = \(\{ bet, onClose \}: \{ bet: any; onClose: \(\) => void \}\) => \{/g,
  `const BetDetailView = ({ bet, onClose }: { bet: any; onClose: () => void }) => {`
);

// We need to replace the outer wrappers.
// Currently:
/*
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative flex flex-col w-full max-w-lg mx-auto h-full overflow-y-auto"
        style={{ background: 'linear-gradient(180deg, #0d1117 0%, #131e2e 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top border glow *\/}
        ...
        {/* Header bar *\/}
        <div
          className="sticky top-0 z-10 flex justify-between items-center px-4 py-3 border-b border-[#2a3a4a]"
          style={{ background: 'rgba(13,17,23,0.97)', backdropFilter: 'blur(10px)' }}
        >
          ...
          <button ...> <X size={16} /> </button>
        </div>
*/
// I will replace it with:
/*
    <div className="min-h-screen bg-[#0a0a15] text-slate-200 font-sans w-full max-w-[100vw] overflow-x-hidden box-border flex flex-col">
      <UniversalHeader pageDepth={3} onBackClick={onClose} />
      <div
        className="relative flex flex-col w-full max-w-lg mx-auto min-h-screen pb-[70px]"
        style={{ background: 'linear-gradient(180deg, #0d1117 0%, #131e2e 100%)' }}
      >
        {/* Top border glow *\/}
        ...
*/

content = content.replace(
  /<div\s*className="fixed inset-0 z-\[9999\] flex flex-col"\s*style=\{\{ background: 'rgba\(0,0,0,0\.92\)', backdropFilter: 'blur\(8px\)' \}\}\s*onClick=\{\(e\) => \{\s*if \(e\.target === e\.currentTarget\) onClose\(\);\s*\}\}\s*>\s*<div\s*className="relative flex flex-col w-full max-w-lg mx-auto h-full overflow-y-auto"\s*style=\{\{ background: 'linear-gradient\(180deg, #0d1117 0%, #131e2e 100%\)' \}\}\s*onClick=\{\(e\) => e\.stopPropagation\(\)\}\s*>/m,
  `<div className="min-h-screen bg-[#0a0a15] text-slate-200 font-sans w-full max-w-[100vw] overflow-x-hidden box-border flex flex-col">
      <UniversalHeader pageDepth={3} onBackClick={onClose} />
      <div
        className="relative flex flex-col w-full max-w-lg mx-auto flex-1 pb-[70px]"
        style={{ background: 'linear-gradient(180deg, #0d1117 0%, #131e2e 100%)' }}
      >`
);

content = content.replace(
  /\{\/\* Header bar \*\/\}\s*<div\s*className="sticky top-0 z-10 flex justify-between items-center px-4 py-3 border-b border-\[#2a3a4a\]"\s*style=\{\{ background: 'rgba\(13,17,23,0\.97\)', backdropFilter: 'blur\(10px\)' \}\}\s*>\s*<div className="text-\[17px\] font-black text-\[#5a6a7a\] capitalize tracking-widest ">\s*Bet Details\s*<\/div>\s*<button\s*onClick=\{\(\) => \{\s*if \(typeof navigator !== 'undefined' && navigator\.vibrate\) \{\s*try \{\s*navigator\.vibrate\(15\);\s*\} catch \(e\) \{\}\s*\}\s*onClose\(\);\s*\}\}\s*aria-label="Close bet details"\s*className="flex items-center justify-center p-2 rounded-sm border border-\[#3d4f5f\] text-slate-400 hover:text-white hover:border-\[#00D4FF\] transition-all active:scale-95 min-h-\[44px\] min-w-\[44px\]"\s*>\s*<X size=\{16\} \/>\s*<\/button>\s*<\/div>/m,
  ``
);

// We need to disable the scrolling lock hook inside BetDetailView
content = content.replace(
  /useEffect\(\(\) => \{\s*document\.body\.style\.overflow = 'hidden';\s*return \(\) => \{\s*document\.body\.style\.overflow = '';\s*\};\s*\}, \[\]\);/m,
  `// Removed body overflow lock`
);

// Finally, update the render inside BestBetsPage
content = content.replace(
  /export default function BestBetsPage\(\) \{([\s\S]*?)return \(\s*<div className="min-h-screen bg-\[#0a0a15\] text-slate-200 pb-\[70px\] font-sans w-full max-w-\[100vw\] overflow-x-hidden box-border">/m,
  `export default function BestBetsPage() {$1
  if (selectedBet) {
    return <BetDetailView bet={selectedBet} onClose={closeModal} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a15] text-slate-200 pb-[70px] font-sans w-full max-w-[100vw] overflow-x-hidden box-border">`
);

content = content.replace(
  /\{\/\* Fullscreen Modal \*\/\}\s*\{selectedBet && <BetDetailModal bet=\{selectedBet\} onClose=\{closeModal\} \/>\}/g,
  ``
);

fs.writeFileSync(path, content);
console.log("Updated Modal successfully.");
