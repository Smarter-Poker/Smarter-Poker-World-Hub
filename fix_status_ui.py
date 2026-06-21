import re

with open('pages/hub/MLB-ANALYTICS/status.tsx', 'r') as f:
    code = f.read()

# 1. Error Boundary Props
code = code.replace(
    'constructor(props: any) {',
    'constructor(props: { children: React.ReactNode; seo: React.ReactNode; header: React.ReactNode; nav: React.ReactNode }) {'
)

# 2. aria-hidden on ServerCrash in ErrorBoundary
code = code.replace(
    '<ServerCrash className="w-12 h-12 text-[#FF4444] mx-auto mb-4 relative z-10" />',
    '<ServerCrash aria-hidden="true" className="w-12 h-12 text-[#FF4444] mx-auto mb-4 relative z-10" />'
)

# 3. Delete duplicate functions inside StatusPage. 
# We'll use regex to strip out lines matching exactly.
# Note that we know the outer ones are present. Let's just remove the block:
to_remove = """  const formatDate = (dateString: string | null | undefined): string => {
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
    if (n == null || n === '') return '\\u2014';
    const num = Number(n);
    if (isNaN(num) || !isFinite(num)) return '\\u2014';
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

# Wait, `fmt` inside uses `\u2014` while outside uses `—` probably. I'll just regex delete from `const formatDate = ` to `return 'text-[#00D4FF] border-[#00D4FF]';\n  };` inside the `export default function StatusPage() {` block.

match = re.search(r'export default function StatusPage\(\) \{.*?(  const formatDate =.*?  \};\n)', code, re.DOTALL)
if match:
    # Just the block we want
    chunk = match.group(1)
    code = code.replace(chunk, '')

# 4. Skeleton Loader fix
code = code.replace(
    'className="h-24 animate-pulse bg-[#161b22] border border-[#2d3748] rounded-lg"',
    'className="min-h-[500px] animate-pulse bg-[#161b22] border border-[#2d3748] rounded-lg"'
)

# 5. Contrast fixes
# text-slate-500 around tier distributions:
code = code.replace(
    'text-slate-500 text-[10px]',
    'text-slate-400 text-[10px]'
)
code = code.replace(
    'text-slate-500 font-bold tracking-wider text-[11px] uppercase',
    'text-slate-400 font-bold tracking-wider text-[11px] uppercase'
)

# 6. React key warnings
code = code.replace(
    'key={src?.source || idx}',
    'key={src?.source || `src-${idx}`}'
)

code = code.replace(
    'key={al?.id || idx}',
    'key={al?.id || `al-${idx}`}'
)

with open('pages/hub/MLB-ANALYTICS/status.tsx', 'w') as f:
    f.write(code)

