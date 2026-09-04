/**
 * DataTable - one table, three states, no colour-only meaning.
 *
 * `columns` is an explicit contract, [{ key, header, render, align, width }],
 * so a new field appearing upstream cannot silently change what an operator
 * sees. Loading and empty are distinct states on purpose: "we could not read
 * this" and "there is nothing here" are different answers and the console has
 * been wrong about that before.
 */
import React from 'react';
import styles from './shared.module.css';

function alignClass(align) {
  if (align === 'right') return styles.alignRight;
  if (align === 'center') return styles.alignCenter;
  return '';
}

export default function DataTable({
  columns = [],
  rows = [],
  caption,
  loading = false,
  loadingLabel = 'Loading',
  empty = 'Nothing To Show.',
  getRowKey,
  rowClassName,
}) {
  const keyOf = (row, i) => {
    if (typeof getRowKey === 'function') return getRowKey(row, i);
    if (row && row.id !== undefined && row.id !== null) return row.id;
    return i;
  };

  return (
    <div className={styles.tableScroll}>
      <table className={styles.dataTable}>
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className={alignClass(col.align)} style={col.width ? { width: col.width } : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td className={styles.tableState} colSpan={Math.max(1, columns.length)}>{loadingLabel}</td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td className={styles.tableState} colSpan={Math.max(1, columns.length)}>{empty}</td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={keyOf(row, i)} className={typeof rowClassName === 'function' ? rowClassName(row) : undefined}>
                {columns.map((col) => (
                  <td key={col.key} className={alignClass(col.align)}>
                    {typeof col.render === 'function' ? col.render(row, i) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
