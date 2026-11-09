/**
 * FaqSection: the visible half of every FAQPage node.
 *
 * STRUCTURED DATA AUDIT (2026-11-09). hubProductSchema({ faqs }) and
 * faqSchema() publish a FAQPage for any page that hands them questions, and
 * on 25 production pages the questions existed only inside that JSON-LD: the
 * calculators, the hub product pages and the tournament directories shipped
 * Q&A to crawlers that no visitor could read. Structured data describes the
 * page; a FAQPage whose questions are not on the page is a claim about
 * content that does not exist, and the page it describes is the one a crawler
 * compares it against.
 *
 * This component renders the same array the schema builder receives, so the
 * markup and the page cannot disagree. __tests__/structured-data-matches-the-page.law.test.mjs
 * fails the build when a page passes `faqs` to a schema builder without
 * rendering them through this component or an existing visible FAQ block.
 *
 * House style: Title Case headings, no em dashes, no emoji.
 */

const sectionStyle = {
  marginTop: 32,
  padding: 20,
  background: 'rgba(255, 255, 255, 0.02)',
  border: '1px solid rgba(148, 163, 184, 0.25)',
  borderRadius: 12,
  width: '100%',
};

const headingStyle = {
  fontSize: 20,
  fontWeight: 800,
  margin: '0 0 14px 0',
  color: '#f8fafc',
};

const itemStyle = {
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 8,
  padding: '12px 14px',
  color: '#e2e8f0',
};

const questionStyle = {
  fontWeight: 700,
  fontSize: 15,
  margin: 0,
  color: '#38bdf8',
};

const answerStyle = {
  margin: '8px 0 0',
  fontSize: 14,
  lineHeight: 1.6,
  color: '#cbd5e1',
};

/**
 * @param {{ faqs: Array<{ question: string, answer: string }>, title?: string, id?: string }} props
 */
export default function FaqSection({ faqs, title = 'Frequently Asked Questions', id = 'faq' }) {
  const items = (Array.isArray(faqs) ? faqs : []).filter(
    (item) => item && typeof item.question === 'string' && item.question.trim() && typeof item.answer === 'string' && item.answer.trim()
  );
  if (items.length === 0) return null;
  const headingId = `${id}-heading`;
  return (
    <section id={id} className="faq-section" aria-labelledby={headingId} style={sectionStyle}>
      <h2 id={headingId} style={headingStyle}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, index) => (
          <div key={index} className="faq-item" style={itemStyle}>
            <h3 className="faq-question" style={questionStyle}>{item.question}</h3>
            <p className="faq-answer" style={answerStyle}>{item.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
