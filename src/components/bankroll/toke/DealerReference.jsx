import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Send } from 'lucide-react';
import { getFreshAccessToken } from '../../../lib/authUtils';
import BankrollImageHeader from '../BankrollImageHeader';
import seal from './art/dealer-reference-seal.webp';
import scene from './art/dealer-reference-scene.webp';
import styles from './DealerReference.module.css';

export default function DealerReference() {
  const id = useId();
  const pending = useRef(null);
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => pending.current?.abort(), []);

  async function ask(event) {
    event.preventDefault();
    const question = query.trim();
    if (!question || pending.current) return;
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError('');
    try {
      const token = await getFreshAccessToken();
      if (request.signal.aborted) return;
      if (!token) throw new Error('Sign in to ask Jarvis a question.');
      const response = await fetch('/api/jarvis/dealer-reference', {
        method: 'POST',
        signal: request.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ query: question, history: history.slice(-4) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not retrieve an answer. Please try again.');
      if (typeof result.answer !== 'string' || !result.answer.trim()) throw new Error('No answer was received. Please try again.');
      if (!request.signal.aborted) {
        setHistory(previous => [...previous.slice(-4), { question, answer: result.answer.trim() }]);
        setQuery('');
      }
    } catch (failure) {
      if (!request.signal.aborted) setError(failure.message || 'Could not retrieve an answer. Please try again.');
    } finally {
      if (!request.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  const latest = history.at(-1);
  return (
    <section aria-labelledby={id + '-title'} className={'sd-panel ' + styles.reference}>
      <BankrollImageHeader art="dealer-reference" artwork={{ seal: seal.src, scene: scene.src }}
        title="Jarvis Dealer Reference" heading="h2" titleId={id + '-title'} className={styles.mast} />
      <button type="button" className={styles.disclosure} aria-expanded={expanded} aria-controls={id + '-body'}
        onClick={() => setExpanded(value => !value)}>
        Ask A Dealing Question <ChevronDown size={18} aria-hidden="true" />
      </button>
      <div id={id + '-body'} hidden={!expanded} className={styles.body}>
        <form onSubmit={ask} className={styles.form}>
          <label htmlFor={id + '-question'}>Your Question</label>
          <div className={styles.inputRow}>
            <input id={id + '-question'} type="text" maxLength={500} value={query}
              onChange={event => setQuery(event.target.value)} readOnly={busy}
              placeholder="E.g. Who Acts First In Heads-Up Play?" />
            <button className="sd-button sd-primary" type="submit" disabled={busy || !query.trim()}>
              <Send size={15} aria-hidden="true" /> {busy ? 'Asking…' : 'Ask Jarvis'}
            </button>
          </div>
          {error && <p className={styles.error} role="alert" data-preserve-case="true">{error}</p>}
        </form>
        <div aria-live="polite" aria-atomic="true">
          {latest && <div className={styles.answer} data-preserve-case="true">
            <h3>{latest.question}</h3>
            <p>{latest.answer}</p>
          </div>}
        </div>
        {history.length > 1 && <details className={styles.history}>
          <summary>Earlier Questions ({history.length - 1})</summary>
          {history.slice(0, -1).reverse().map((turn, index) =>
            <div key={index} className={styles.turn} data-preserve-case="true"><h4>{turn.question}</h4><p>{turn.answer}</p></div>)}
        </details>}
      </div>
    </section>
  );
}
