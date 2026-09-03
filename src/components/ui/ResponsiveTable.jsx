/**
 * ResponsiveTable: a real <table> on desktop, one card per row on phones.
 *
 * WHY: rule 5 of the Always Displayed standard. A table that does not fit
 * 375px must become stacked cards with the column header as the label,
 * never a sideways scroll ("slide to see" is a defect). Doing the switch in
 * CSS (one media query at 768px) rather than from the viewport width in JS means
 * the server and the client render identical markup, so it hydrates
 * cleanly (hydration #418 crashed 14 pages that branched on width).
 *
 * Both layouts are rendered from the same data; the media query decides
 * which one is visible. The table is `display: none` on phones and the card
 * list is `display: none` on desktop, which is the one sanctioned use of
 * display:none in the standard: a desktop-only duplicate of something the
 * phone shows another way.
 *
 * Props:
 *   columns  [{ key, label, align: 'left'|'right'|'center', render?(row) }]
 *   rows     array of records
 *   keyField which field on a row is its stable key (default 'id')
 *   caption  optional accessible caption
 */
import React from 'react';

const CSS = `
.sp-rtable { width: 100%; }
.sp-rtable table { width: 100%; border-collapse: collapse; table-layout: auto; }
.sp-rtable th, .sp-rtable td { padding: 10px 12px; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.08); text-align: left; vertical-align: middle; }
.sp-rtable th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; font-weight: 700; }
.sp-rtable .sp-rtable-right { text-align: right; }
.sp-rtable .sp-rtable-center { text-align: center; }
.sp-rtable-cards { display: none; }
@media (max-width: 768px) {
  .sp-rtable table { display: none; }
  .sp-rtable-cards { display: flex; flex-direction: column; gap: 8px; }
  .sp-rtable-card { border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; }
  .sp-rtable-cell { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; min-width: 0; }
  .sp-rtable-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.7; font-weight: 700; flex-shrink: 0; }
  .sp-rtable-value { font-size: 14px; min-width: 0; overflow-wrap: anywhere; text-align: right; }
  .sp-rtable-cell.sp-rtable-left .sp-rtable-value { text-align: left; }
}
`;

const alignClass = (align) =>
  align === 'right' ? 'sp-rtable-right' : align === 'center' ? 'sp-rtable-center' : 'sp-rtable-left';

const cellValue = (column, row) =>
  typeof column.render === 'function' ? column.render(row) : row[column.key];

export default function ResponsiveTable({ columns = [], rows = [], keyField = 'id', caption }) {
  const rowKey = (row, index) => (row && row[keyField] != null ? row[keyField] : index);

  return (
    <div className="sp-rtable">
      <table>
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={alignClass(column.align)}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key} className={alignClass(column.align)}>
                  {cellValue(column, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sp-rtable-cards" role="list" aria-label={caption || undefined}>
        {rows.map((row, index) => (
          <div key={rowKey(row, index)} className="sp-rtable-card" role="listitem">
            {columns.map((column) => (
              <div key={column.key} className={`sp-rtable-cell ${alignClass(column.align)}`}>
                <span className="sp-rtable-label">{column.label}</span>
                <span className="sp-rtable-value">{cellValue(column, row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}
