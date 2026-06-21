import re

with open('pages/hub/MLB-ANALYTICS/status.tsx', 'r') as f:
    code = f.read()

# 1. Fix TimeAgo hydration issue
old_timeago = """const TimeAgo = ({
  dateString,
  serverNow,
  fallback = '',
}: {
  dateString: string | null | undefined;
  serverNow?: string | null;
  fallback?: string;
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);"""

new_timeago = """const TimeAgo = ({
  dateString,
  serverNow,
  fallback = '',
}: {
  dateString: string | null | undefined;
  serverNow?: string | null;
  fallback?: string;
}) => {
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);
  
  if (nowMs === null) return <>{fallback}</>;"""
code = code.replace(old_timeago, new_timeago)

# 2. Extract utility functions outside of StatusPage
old_utils = """  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    const safeDate =
      dateString.endsWith('Z') || dateString.includes('+') ? dateString : dateString + 'Z';
    const d = new Date(safeDate);
    if (isNaN(d.getTime())) return String(dateString);
    return d.toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const fmt = (n: number | string | null | undefined): string => {
    if (n == null || n === '') return '\u2014';
    const num = Number(n);
    if (isNaN(num) || !isFinite(num)) return '\u2014';
    return num.toLocaleString();
  };

  const brierColor = (val: number | string | null | undefined): string => {
    const b = Number(val);
    if (isNaN(b) || val == null || val === '') return 'text-slate-300';
    if (b < 0.2) return 'text-[#00D4FF]';
    if (b <= 0.25) return 'text-[#FFB020]';
    return 'text-[#FF4444]';
  };
  const fmtBrier = (val: number | string | null | undefined): string => {
    const b = Number(val);
    return !isNaN(b) && val != null && val !== '' ? b.toFixed(3) : '-';
  };

  const alertLevelColor = (level: string | null | undefined): string => {
    const l = String(level || '').toLowerCase();
    if (l === 'critical' || l === 'error') return 'text-[#FF4444] border-[#FF4444]';
    if (l === 'warning' || l === 'warn') return 'text-[#FFB020] border-[#FFB020]';
    return 'text-[#00D4FF] border-[#00D4FF]';
  };"""

code = code.replace(old_utils, "")
code = code.replace("export default function StatusPage() {", old_utils.replace("  const", "const") + "\n\nconst EMPTY_OBJ = {};\n\nexport default function StatusPage() {")

# 3. Replace data default fallbacks to use EMPTY_OBJ
code = code.replace("const health = data?.health || {};", "const health = data?.health || EMPTY_OBJ;")
code = code.replace("const slate = data?.slate || {};", "const slate = data?.slate || EMPTY_OBJ;")
code = code.replace("const accuracy = data?.accuracy || {};", "const accuracy = data?.accuracy || EMPTY_OBJ;")
code = code.replace("const tierDist = data?.tierDist || {};", "const tierDist = data?.tierDist || EMPTY_OBJ;")
code = code.replace("const tableCounts = data?.tableCounts || {};", "const tableCounts = typeof data?.tableCounts === 'object' && data.tableCounts !== null ? data.tableCounts : EMPTY_OBJ;")
code = code.replace("const latestRuns = data?.latestRuns || {};", "const latestRuns = typeof data?.latestRuns === 'object' && data.latestRuns !== null ? data.latestRuns : EMPTY_OBJ;")

# 4. Remove redundant aria-labels from Retry buttons
code = code.replace('aria-label="Retry status fetch"', 'aria-label="Retry loading data"')

# 5. Fix text clipping on Last Refresh
old_refresh = """<div className="text-[10px] text-slate-400 tracking-widest uppercase mt-0.5 flex items-center gap-2">"""
new_refresh = """<div className="text-[10px] text-slate-400 tracking-widest uppercase mt-0.5 flex items-center gap-2 flex-wrap">"""
code = code.replace(old_refresh, new_refresh)

# 6. Fix truncate on stage title
old_stage = """<div className="text-[14px] font-black uppercase tracking-widest text-slate-200">"""
new_stage = """<div className="text-[14px] font-black uppercase tracking-widest text-slate-200 truncate">"""
code = code.replace(old_stage, new_stage)

with open('pages/hub/MLB-ANALYTICS/status.tsx', 'w') as f:
    f.write(code)

print("Status page fixes applied.")
