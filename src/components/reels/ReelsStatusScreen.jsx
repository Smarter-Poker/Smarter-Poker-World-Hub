import styles from './ImmersiveReels.module.css';
export default function ReelsStatusScreen({ title, titleAs = 'h1', copy, subtitle, rows = [], primary, secondary }) {
  const Heading = titleAs === 'h2' ? 'h2' : 'h1';
  return <main className={styles.root}><section className={styles.statusScreen} aria-label={title}>
    <Heading>{title}</Heading><p role="status">{copy || subtitle}</p>
    {rows.map((row) => <p key={row.label}>{row.label}: {row.value}</p>)}
    <div>{[secondary, primary].filter(Boolean).map((action) => <button type="button" key={action.label} onClick={action.onClick} disabled={action.disabled}>{action.label}</button>)}</div>
  </section></main>;
}
