import React, { useCallback, useId, useMemo } from 'react';
import { List } from 'react-window';
import DataTable from './DataTable';
import styles from './VirtualDataTable.module.css';

const MIN_COLUMN_WIDTH = 140;

function alignClass(align) {
  if (align === 'right') return styles.alignRight;
  if (align === 'center') return styles.alignCenter;
  return '';
}

function VirtualRow({ index, style, rows, columns, gridTemplateColumns, getRowKey, rowClassName }) {
  const row = rows[index];
  const key = getRowKey ? getRowKey(row, index) : (row?.id ?? index);
  return (
    <div
      role="row"
      aria-rowindex={index + 2}
      data-row-key={String(key)}
      className={`${styles.row} ${typeof rowClassName === 'function' ? rowClassName(row) || '' : ''}`}
      style={{ ...style, gridTemplateColumns }}
    >
      {columns.map((column) => (
        <div role="cell" key={column.key} className={`${styles.cell} ${alignClass(column.align)}`}>
          {typeof column.render === 'function' ? column.render(row, index) : row?.[column.key]}
        </div>
      ))}
    </div>
  );
}

/**
 * A bounded, accessible large-list companion to DataTable.
 *
 * Short lists keep a native table, including its caption/header/body semantics.
 * Large lists expose table/row/column/cell roles plus the full row count while
 * react-window keeps only the visible body rows mounted. Row height is fixed on
 * purpose: operator cells truncate rather than changing height while scrolling.
 */
export default function VirtualDataTable({
  columns = [],
  rows = [],
  caption,
  loading = false,
  loadingLabel = 'Loading',
  empty = 'Nothing To Show.',
  getRowKey,
  rowClassName,
  virtualizeAt = 100,
  height = 520,
  rowHeight = 58,
  overscanCount = 6,
}) {
  const captionId = useId();
  const shouldVirtualize = !loading && rows.length > virtualizeAt;
  const gridTemplateColumns = useMemo(
    () => columns.map((column) => column.width || `minmax(${MIN_COLUMN_WIDTH}px, 1fr)`).join(' '),
    [columns],
  );
  const minWidth = Math.max(columns.length * MIN_COLUMN_WIDTH, 1);
  const rowProps = useMemo(() => ({
    rows, columns, gridTemplateColumns, getRowKey, rowClassName,
  }), [rows, columns, gridTemplateColumns, getRowKey, rowClassName]);
  const rowKey = useCallback(
    (index) => (getRowKey ? getRowKey(rows[index], index) : (rows[index]?.id ?? index)),
    [getRowKey, rows],
  );

  if (!shouldVirtualize) {
    return (
      <DataTable
        columns={columns}
        rows={rows}
        caption={caption}
        loading={loading}
        loadingLabel={loadingLabel}
        empty={empty}
        getRowKey={getRowKey}
        rowClassName={rowClassName}
      />
    );
  }

  return (
    <div className={styles.horizontalScroll}>
      <div
        className={styles.table}
        role="table"
        aria-colcount={columns.length}
        aria-rowcount={rows.length + 1}
        aria-labelledby={caption ? captionId : undefined}
        style={{ minWidth }}
      >
        {caption ? <div id={captionId} className={styles.caption}>{caption}</div> : null}
        <div role="row" aria-rowindex={1} className={styles.header} style={{ gridTemplateColumns }}>
          {columns.map((column) => (
            <div
              role="columnheader"
              key={column.key}
              className={`${styles.headerCell} ${alignClass(column.align)}`}
            >
              {column.header}
            </div>
          ))}
        </div>
        <List
          role="rowgroup"
          aria-label={caption || 'Table Rows'}
          rowComponent={VirtualRow}
          rowCount={rows.length}
          rowHeight={rowHeight}
          rowProps={rowProps}
          rowKey={rowKey}
          overscanCount={overscanCount}
          style={{ height, width: '100%' }}
        />
      </div>
    </div>
  );
}
