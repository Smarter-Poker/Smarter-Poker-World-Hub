/**
 * NotBuiltYet - what replaces a permanently disabled button.
 *
 * A greyed-out button is a promise: it says "this exists, you just cannot use
 * it right now". Four club-management buttons on the Grinder tab and four on
 * the Pipeline tab were disabled from the day they shipped, backed by routes
 * that answer 501, and an operator could only learn that by hovering for a
 * title attribute. Say it in the panel instead, and say when it is planned.
 */
import React from 'react';
import styles from './shared.module.css';

export default function NotBuiltYet({
  title = 'Not Built Yet - Planned For Phase 3 (Fleet Command Center)',
  children,
  items = [],
}) {
  return (
    <div className={styles.notBuilt}>
      <h4 className={styles.notBuiltTitle}>{title}</h4>
      {children ? <p className={styles.notBuiltBody}>{children}</p> : null}
      {items.length > 0 && (
        <ul className={styles.notBuiltList}>
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
    </div>
  );
}
