import Head from 'next/head';
import { useRouter } from 'next/router';
import OperatorGlyph from './OperatorGlyph';
import { operatorConsoleLabel } from './operatorConsoleRoutes';
import styles from './OperatorConsoleShell.module.css';

export default function OperatorConsoleShell({ children }) {
  const router = useRouter();
  const label = operatorConsoleLabel(router.pathname);

  return (
    <>
      <Head>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <div className={styles.shell} data-admin-console="club-arena">
        <div className={styles.frameRail} aria-hidden="true">
          <span className={styles.fastener} />
          <span className={styles.trace} />
          <span className={styles.emblem}><OperatorGlyph kind="shield" size={18} /></span>
          <span className={styles.trace} />
          <span className={styles.fastener} />
        </div>
        <div className={styles.identityRail}>
          <span className={styles.systemName}>Club Arena Console</span>
          <span className={styles.routeName}>{label}</span>
          <span className={styles.liveState}><i aria-hidden="true" /> Operator Workspace</span>
        </div>
        <div className={styles.stage}>{children}</div>
      </div>
    </>
  );
}
