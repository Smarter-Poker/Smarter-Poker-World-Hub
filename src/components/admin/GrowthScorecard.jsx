import React from 'react';

export default function GrowthScorecard({ report }) {
  return <section id="growth-scorecard" aria-labelledby="growth-scorecard-title" style={{ marginBottom: 32, padding: 20, border: '1px solid #2a3a4a', borderRadius: 12 }}>
    <h2 id="growth-scorecard-title" style={{ fontSize: 20 }}>Growth Scorecard</h2>
    {!report ? <p role="status">Growth Data Is Unavailable. Reload To Retry.</p> : <>
      <p>Last 7 Days, Rolling. {report.start} To {report.end} (UTC, End Excluded).</p>
      <p>{report.attribution}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 12 }}>
        {report.metrics.map(metric => <article key={metric.id} style={{ padding: 16, border: '1px solid #334155', borderRadius: 8 }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>{metric.label}</h3>
          <p style={{ fontSize: 28, margin: '12px 0' }}>{metric.status === 'measured' ? metric.value : 'Unavailable'}</p>
          <p style={{ fontSize: 13, color: '#cbd5e1' }}>{metric.definition}</p>
        </article>)}
      </div>
      <p style={{ fontSize: 13 }}>{report.completeness}</p>
      <p style={{ fontSize: 13 }}>Business Hub Mentions, Agent Conversations And Website Clicks Have Separate Definitions. View Their Native Insights Before Comparing Results. Unavailable Does Not Mean Zero.</p>
    </>}
  </section>;
}
