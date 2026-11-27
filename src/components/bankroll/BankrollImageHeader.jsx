import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
  back,
}) {
  const asset = '/images/smarterdesign/headers/' + art;
  // A return link never sits inside the image header (Dan, 2026-11-27): when a
  // page has one, it renders directly ABOVE the frame, and the page's spacing
  // class moves to the pair so the header keeps its place in the layout.
  const header = (
    <header className={'sd-masthead ' + styles.header + (back ? '' : ' ' + className)} data-header-art={art}>
      <img className={styles.scene} src={artwork?.scene || asset + '-scene.webp'} alt="" width="1200" height="240" fetchpriority="high" decoding="async" aria-hidden="true" />
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
  if (!back) return header;
  return (
    <div className={className} data-header-stack="">
      <nav className="sd-header-back" aria-label="Back">
        <Link href={back.href} shallow={back.shallow} className="sd-button" data-header-back="">
          <ArrowLeft aria-hidden="true" size={16} /> {back.label || 'Back To Dashboard'}
        </Link>
      </nav>
      {header}
    </div>
  );
}
