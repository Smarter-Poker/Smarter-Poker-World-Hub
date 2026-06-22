const fs = require('fs');

let content = fs.readFileSync('pages/hub/MLB-ANALYTICS/hr-tracker.tsx', 'utf-8');

// Import RefreshCw
content = content.replace(
  "import { Search, Info, Flame, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';",
  "import { Search, Info, Flame, ChevronDown, ChevronUp, ChevronsUpDown, RefreshCw } from 'lucide-react';"
);

// Destructure isValidating
content = content.replace(
  "const { data, error, isLoading, mutate } = useSWR('/api/mlb/hr-tracker', fetcher, {",
  "const { data, error, isLoading, isValidating, mutate } = useSWR('/api/mlb/hr-tracker', fetcher, {"
);

// Replace button
content = content.replace(
  `<button
              onClick={() => { try { navigator.vibrate(15); } catch(err) {} return mutate(); }}
              className="ml-auto text-[17px] font-extrabold text-slate-500 border border-[#3d4f5f] px-3 py-1.5 rounded-md tracking-widest capitalize hover:text-[#00D4FF] hover:border-[#00D4FF] transition-colors min-h-[44px]"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              Refresh
            </button>`,
  `<button
              onClick={() => { try { navigator.vibrate(15); } catch(err) {} return mutate(); }}
              disabled={isValidating}
              className="ml-auto text-[17px] font-extrabold text-slate-500 border border-[#3d4f5f] px-3 py-1.5 rounded-md tracking-widest capitalize hover:text-[#00D4FF] hover:border-[#00D4FF] transition-colors min-h-[44px] disabled:opacity-50 inline-flex items-center gap-2"
              style={{ fontFamily: '"Rajdhani", sans-serif' }}
            >
              <RefreshCw className={\`w-4 h-4 \${isValidating ? 'animate-spin' : ''}\`} />
              {isValidating ? 'Syncing' : 'Refresh'}
            </button>`
);

content = content.replace(
  `<button
              onClick={() => mutate()}
              className="bg-[#00D4FF] text-[#0a0a15] font-extrabold text-[15px] px-6 py-2 rounded-lg transition-transform hover:scale-105"
            >
              Refresh
            </button>`,
  `<button
              onClick={() => mutate()}
              disabled={isValidating}
              className="bg-[#00D4FF] text-[#0a0a15] font-extrabold text-[15px] px-6 py-2 rounded-lg transition-transform hover:scale-105 disabled:opacity-50 inline-flex items-center gap-2"
            >
              <RefreshCw className={\`w-4 h-4 \${isValidating ? 'animate-spin' : ''}\`} />
              {isValidating ? 'Syncing' : 'Refresh'}
            </button>`
);

fs.writeFileSync('pages/hub/MLB-ANALYTICS/hr-tracker.tsx', content);

