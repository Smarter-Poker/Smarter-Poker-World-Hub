import styles from './ImmersiveReels.module.css';
export default function ReelsStatusScreen({ title, copy, subtitle, rows = [], primary, secondary }) {
  return <main className={styles.root}><section className={styles.statusScreen} aria-label={title}>
    <h1>{title}</h1><p role="status">{copy || subtitle}</p>
    {rows.map((row) => <p key={row.label}>{row.label}: {row.value}</p>)}
    <div>{[secondary, primary].filter(Boolean).map((action) => <button type="button" key={action.label} onClick={action.onClick} disabled={action.disabled}>{action.label}</button>)}</div>
  </section></main>;
}
