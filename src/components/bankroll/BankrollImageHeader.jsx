import BankrollHelp from './BankrollHelp';
import styles from './BankrollImageHeader.module.css';

export default function BankrollImageHeader({
  art,
  artwork,
  title,
  parent,
  children,
  helpContent,
  onTutorial,
  section = art,
  heading: Heading = 'h1',
  titleId,
  className = '',
}) {
  const asset = '/images/smarterdesign/headers/' + art;
  return (
    <header className={'sd-masthead ' + styles.header + ' ' + className} data-header-art={art}>
      <img className={styles.scene} src={artwork?.scene || asset + '-scene.webp'} alt="" aria-hidden="true" />
      <span className={styles.seal} aria-hidden="true">
        <img src={artwork?.seal || asset + '-seal.webp'} alt="" width="176" height="176" />
      </span>
      <div className={styles.copy}>
        {parent && <div className={styles.parent}>{parent}</div>}
        <Heading id={titleId} className={styles.title}>
          {title}
        </Heading>
        {children}
      </div>
      <BankrollHelp title={title} section={section} onTutorial={onTutorial}>
        {helpContent}
      </BankrollHelp>
    </header>
  );
}
