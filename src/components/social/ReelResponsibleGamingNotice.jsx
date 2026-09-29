import Link from 'next/link';

const NOTICE_STYLE = Object.freeze({
  display: 'grid',
  gap: '7px',
  padding: '12px 14px',
  border: '1px solid rgba(96, 181, 255, 0.58)',
  background: 'linear-gradient(145deg, rgba(20, 31, 43, 0.96), rgba(3, 8, 14, 0.98))',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -1px 0 rgba(0, 0, 0, 0.9), 0 8px 22px rgba(0, 0, 0, 0.34)',
  color: '#d7dee7',
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: '12px',
  lineHeight: 1.45,
});

const LABEL_STYLE = Object.freeze({
  color: '#8fd4ff',
  fontFamily: "'Roboto Condensed', Inter, sans-serif",
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
});

const LINK_STYLE = Object.freeze({
  width: 'fit-content',
  color: '#8fd4ff',
  fontFamily: "'Roboto Condensed', Inter, sans-serif",
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
});

export default function ReelResponsibleGamingNotice({ topic, className = '' }) {
  if (String(topic || '').trim().toLowerCase() !== 'slots') return null;

  return (
    <aside
      className={className || undefined}
      style={NOTICE_STYLE}
      aria-label="Responsible Gaming Notice"
    >
      <strong style={LABEL_STYLE}>Responsible Gaming</strong>
      <span>
        Casino Content Is For Entertainment. Set Limits, Take Breaks, And Use Responsible Gaming Tools.
      </span>
      <Link href="/hub/commander/responsible-gaming" style={LINK_STYLE}>
        Open Responsible Gaming Tools
      </Link>
    </aside>
  );
}
