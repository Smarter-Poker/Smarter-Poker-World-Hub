import styles from './ReelTrustStrip.module.css';

const DISCLOSURES = Object.freeze({
  sponsored: 'Sponsored',
  promotional: 'Promotional',
  generated: 'Generated Media',
  community: 'Community Submitted',
  organic: null,
});

export default function ReelTrustStrip({ reel, compact = false }) {
  if (!reel) return null;
  const disclosure = DISCLOSURES[reel.disclosure_kind] || null;
  const casino = ['slots', 'casino'].includes(String(reel.topic || '').toLowerCase());
  const labels = [
    disclosure,
    reel.made_for_kids === true ? 'Made For Kids' : null,
    reel.rights_status === 'owned' || reel.rights_status === 'licensed' ? 'Rights Cleared' : null,
    casino ? 'Responsible Play' : null,
  ].filter(Boolean);
  const attribution = reel.channel_name || reel.source_name || reel.attribution_name || 'Creator Unavailable';
  const sourceUrl = reel.source_attribution_url || reel.attribution_url || reel.source_url || null;

  return (
    <aside className={`${styles.strip}${compact ? ` ${styles.compact}` : ''}`} aria-label="Source and media disclosures" data-reel-trust-strip>
      <div className={styles.source}>
        <span>Verified Source</span>
        {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">{attribution}</a> : <strong>{attribution}</strong>}
      </div>
      {labels.length ? <div className={styles.labels}>{labels.map((label) => <span key={label}>{label}</span>)}</div> : null}
      {reel.sponsor_name && ['sponsored', 'promotional'].includes(reel.disclosure_kind) ? <p>Presented By {reel.sponsor_name}</p> : null}
      {casino ? <p>Entertainment Only. Set Limits And Play Responsibly.</p> : null}
    </aside>
  );
}
