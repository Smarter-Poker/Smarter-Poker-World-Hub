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
  background:
    'radial-gradient(120% 70% at 50% -10%, #1b426e 0%, transparent 62%), linear-gradient(160deg, #15293e 0%, #0a1a2b 44%, #040d18 100%)',
  border: '6px solid transparent',
  borderImage: "url('/images/smarterdesign/chrome-readout.webp') 21 / 8px stretch",
  borderRadius: 0,
  boxShadow: '0 12px 24px rgba(0, 0, 0, 0.6), 0 0 0 1px #02070d',
  width: '100%',
  boxSizing: 'border-box',
};

const headingStyle = {
  fontFamily: "var(--font-roboto-condensed), 'Arial Narrow', Arial, sans-serif",
  fontSize: 22,
  fontWeight: 800,
  margin: '0 0 14px 0',
  color: '#f2f7ff',
  letterSpacing: '0.02em',
};

const itemStyle = {
  background: 'linear-gradient(180deg, #0d1f33 0%, #071321 100%)',
  border: '1px solid #2b4663',
  borderRadius: 0,
  padding: '13px 15px',
  color: '#f2f7ff',
  boxShadow: 'inset 0 1px 0 rgba(134, 218, 255, 0.14)',
};

const questionStyle = {
  fontWeight: 700,
  fontSize: 15,
  margin: 0,
  color: '#86daff',
};

const answerStyle = {
  margin: '8px 0 0',
  fontSize: 14,
  lineHeight: 1.6,
  color: '#bdd0e2',
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
