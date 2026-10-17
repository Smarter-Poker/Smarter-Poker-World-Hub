import { VIP_TERMS, vipGiftTerms } from '../../lib/store/vipStructuredData.mjs';
import { useEffect, useRef, useState } from 'react';
import { VIP_MEMBERSHIP } from '../../data/diamondStoreData';
import { getVerifiedCheckoutAuthorization } from '../../lib/store/checkoutAuthorization';
import { getAuthUser } from '../../lib/authUtils';
import { vipGiftOffer, sameGiftOffer } from '../../lib/store/vipGiftContract.mjs';
import theme from './VipMembershipPage.module.css';
import styles from './VipGifts.module.css';

const names = { monthly: 'Monthly', yearly: 'Yearly', lifetime: 'Lifetime' };
const price = (n) => `$${(n / 100).toFixed(2)}`;
const statusNames = { pending: 'Awaiting Card Payment', available: 'Ready To Redeem', redeemed: 'Redeemed',
  refunded: 'Returned', disputed: 'Payment Disputed', return_pending: 'Return Processing', expired: 'Checkout Expired. No Gift Sent' };

export default function VipGifts({ accountId }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [people, setPeople] = useState([]);
  const [recipient, setRecipient] = useState('');
  const [plan, setPlan] = useState('monthly');
  const [method, setMethod] = useState('card');
  const [review, setReview] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && getAuthUser()?.id === accountId;
  const storageKey = `vip-gift-intent:${accountId}`;
  async function request(url, body) {
    const auth = await getVerifiedCheckoutAuthorization(accountId);
    if (!auth || !current()) throw new Error('Your Account Changed. Sign In And Review Your Gift Again.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(url, { method: body ? 'POST' : 'GET', signal: controller.signal,
        headers: { Authorization: `Bearer ${auth.accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!current()) throw new Error('Your Account Changed. Review Your Gift Again.');
      if (!response.ok || !result.success) { const failure = new Error(result.error || 'Your Gift Could Not Be Loaded. Try Again.'); failure.code = result.code; throw failure; }
      if (result.accountId && result.accountId !== accountId) throw new Error('Gift Account Verification Failed.');
      return result;
    } finally { clearTimeout(timer); }
  }
  function savePending(value) {
    setPending(value);
    try { if (value) localStorage.setItem(storageKey, JSON.stringify(value)); else localStorage.removeItem(storageKey); }
    catch { /* Current mounted request still retains its identity. */ }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const [history, list] = await Promise.all([request('/api/store/vip-gifts'), request('/api/friends')]);
      if (!current()) return;
      setGifts(history.gifts); setCursor(history.nextCursor); setPeople(history.people); setFriends(list.data?.friends || []); setLoaded(true);
      let saved;
      try { saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { saved = null; }
      if (saved && sameGiftOffer(saved.offerConfirmation,
        vipGiftOffer(accountId, saved.recipientId, saved.plan, saved.method, VIP_MEMBERSHIP))) {
        const completed = history.gifts.some(g => g.requestId === saved.requestId && g.status !== 'pending');
        if (completed) savePending(null);
        else { setPending(saved); setReview(saved); setRecipient(saved.recipientId); setPlan(saved.plan); setMethod(saved.method); }
      }
    } catch (error) { if (current()) setMessage(error.name === 'AbortError' ? 'Loading Timed Out. Please Refresh Your Gifts.' : error.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function loadMore() {
    if (lock.current || !cursor) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const next = await request(`/api/store/vip-gifts?${new URLSearchParams(cursor)}`);
      if (!current()) return;
      setGifts(old => [...old, ...next.gifts.filter(g => !old.some(existing => existing.id === g.id))]);
      setPeople(old => [...old, ...next.people]); setCursor(next.nextCursor);
    } catch (error) { if (current()) setMessage(error.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function resume(gift) {
    const offer = vipGiftOffer(accountId, gift.recipientId, gift.plan, gift.method, VIP_MEMBERSHIP);
    if (!offer || offer.amount !== gift.amount || !gift.requestId) {
      setMessage('This Saved Gift Needs Its Original Purchase Terms. Refresh Gifts To Check Its Status.'); return;
    }
    const payload = { action: 'send', requestId: gift.requestId, recipientId: gift.recipientId,
      plan: gift.plan, method: gift.method, offerConfirmation: offer };
    savePending(payload); setReview(payload); setRecipient(gift.recipientId); setPlan(gift.plan); setMethod(gift.method);
  }
  async function purchase() {
    if (lock.current || !review) return;
    lock.current = true; setBusy(true); setMessage('');
    let payload = pending;
    try {
      if (!payload) {
        payload = { action: 'send', requestId: `vip-gift-${crypto.randomUUID()}`, recipientId: recipient, plan, method,
          offerConfirmation: vipGiftOffer(accountId, recipient, plan, method, VIP_MEMBERSHIP) };
        // A durable request is required before any payment call. A blocked
        // storage environment must not allow an unrepeatable money action.
        localStorage.setItem(storageKey, JSON.stringify(payload));
        setPending(payload);
      }
      const result = await request('/api/store/vip-gifts', payload);
      if (result.checkoutUrl) {
        const url = new URL(result.checkoutUrl);
        if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.port || url.username || url.password
          || result.requestId !== payload.requestId || !sameGiftOffer(result.offerConfirmation, payload.offerConfirmation)
          || result.gift.recipientId !== payload.recipientId) throw new Error('Secure Checkout Could Not Be Verified.');
        const confirmed = await getVerifiedCheckoutAuthorization(accountId);
        if (!confirmed || !current()) return;
        window.location.assign(url.href);
        return;
      }
      savePending(null); setReview(null);
      setGifts(old => [result.gift, ...old.filter(g => g.id !== result.gift.id)]);
      setMessage(result.gift.status === 'available' ? 'Your VIP Gift Card Was Sent. Your Friend Can Redeem It Here.' : 'Your Gift Status Has Been Updated.');
    } catch (error) { if (current() && ['friends_required','recipient_already_lifetime','insufficient_diamonds','invalid_offer'].includes(error.code)) { savePending(null); setReview(null); }
      if (current()) setMessage(error.name === 'AbortError'
      ? 'The Result Is Still Unknown. Retry This Saved Request To Check It Safely.' : error.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function act(gift, action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      await request('/api/store/vip-gifts', { action, giftId: gift.id });
      const result = await request('/api/store/vip-gifts');
      if (!current()) return;
      setGifts(result.gifts); setCursor(result.nextCursor); setPeople(result.people);
      setMessage(action === 'redeem' ? 'Your VIP Gift Is Redeemed. Your Membership Is Active.' : 'Your Gift Return Has Been Submitted. Card Refunds Return To The Original Payment Method.');
    } catch (error) { if (current()) setMessage(error.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const personName = (id) => {
    const person = [...friends, ...people].find(p => p.id === id);
    return person?.display_name || person?.username || 'Your Friend';
  };
  return <section id="gifts" className={styles.section} aria-labelledby="vip-gifts-title">
    <div className={theme.sectionHeading}>
      <span className={theme.membershipLabel}>Give Them An Edge</span>
      <h2 id="vip-gifts-title">Gift A VIP</h2>
      <p>Send A Friend A Monthly, Yearly, Or Lifetime VIP Gift Card. Pay Once With A Card Or Diamonds. They Choose When To Redeem.</p>
    </div>
    <p>You Must Be Accepted Friends Before Sending A Gift.</p>
    <ul role="list" className={styles.publicTerms} aria-label="VIP Gift Card Prices And Terms">
      {Object.entries(VIP_TERMS).map(([key, term]) => <li key={key}>
        <strong>{term.label} VIP Gift Card</strong>
        <span>${Number(VIP_MEMBERSHIP[key].price).toFixed(2)} Or {Math.round(VIP_MEMBERSHIP[key].price * 100).toLocaleString('en-US')} Diamonds</span>
        <small>{vipGiftTerms(key)}</small>
      </li>)}
    </ul>
    {!accountId ? <a className={`${theme.action} ${theme.primaryAction}`} href="/auth/login?redirect=%2Fhub%2Fvip-membership%23gifts">Sign In To Gift A VIP</a> : <>
      <button type="button" className={`${theme.action} ${theme.primaryAction}`} aria-expanded={open} aria-controls="vip-gift-workspace"
        onClick={() => { setOpen(!open); if (!open && !loaded) refresh(); }}>Gift A VIP / My Gift Cards</button>
      {open && <div id="vip-gift-workspace" className={styles.workspace}>
        <div className={styles.form}>
          <h3>Send A VIP Gift Card</h3>
          <p>You Must Be Accepted Friends Before Sending A Gift. Monthly And Yearly Cards Never Renew Automatically.</p>
          {!loaded ? <p>{busy ? 'Loading Your Friends And Gifts...' : 'Your Friends Could Not Be Loaded.'}</p> : <>
            {!friends.length && !pending ? <p>No Accepted Friends Yet. <a href="/hub/friends">Add A Friend</a> Before Sending A Gift.</p> : <>
              <label htmlFor="vip-gift-friend">Choose A Friend</label>
              <select id="vip-gift-friend" value={recipient} disabled={busy || !!pending} onChange={e => { setRecipient(e.target.value); setReview(null); }}>
                <option value="">Select An Accepted Friend</option>
                {pending && !friends.some(f => f.id === recipient) && <option value={recipient}>Saved Gift Recipient</option>}
                {friends.map(f => <option key={f.id} value={f.id}>{f.display_name || f.username || 'Friend'}</option>)}
              </select>
              <label htmlFor="vip-gift-plan">Gift Membership</label>
              <select id="vip-gift-plan" value={plan} disabled={busy || !!pending} onChange={e => { setPlan(e.target.value); setReview(null); }}>
                {Object.keys(names).map(key => <option key={key} value={key}>{names[key]} VIP</option>)}
              </select>
              <label htmlFor="vip-gift-payment">Payment Method</label>
              <select id="vip-gift-payment" value={method} disabled={busy || !!pending} onChange={e => { setMethod(e.target.value); setReview(null); }}>
                <option value="card">Card Checkout</option><option value="diamonds">Diamonds</option>
              </select>
              <div className={styles.card} role="img" aria-label={`${names[plan]} VIP Gift Card Preview`}>
                <span>Smarter.Poker</span><strong>VIP</strong><b>{names[plan]} Gift Card</b>
                <span>For {recipient ? personName(recipient) : 'Your Friend'}</span>
                <small>{plan === 'lifetime' ? 'Lifetime Access. No Expiry.' : `${plan === 'monthly' ? '30' : '365'} Days Of VIP. Starts On Redemption.`}</small>
              </div>
              <p className={styles.price}>{method === 'card' ? price(Math.round(VIP_MEMBERSHIP[plan].price * 100))
                : `${Math.round(VIP_MEMBERSHIP[plan].price * 100).toLocaleString('en-US')} Diamonds`} <span>One-Time Gift</span></p>
              {!review ? <button type="button" className={theme.action} disabled={!recipient || busy}
                onClick={() => setReview(vipGiftOffer(accountId, recipient, plan, method, VIP_MEMBERSHIP))}>Review Gift</button>
                : <div className={styles.review}>
                  <h4>Review Your Gift</h4><p>{names[plan]} VIP For {personName(recipient)}. {method === 'card'
                    ? `${price(Math.round(VIP_MEMBERSHIP[plan].price * 100))} At Secure Checkout.`
                    : `${Math.round(VIP_MEMBERSHIP[plan].price * 100).toLocaleString('en-US')} Diamonds From Your Wallet.`}</p>
                  <p>Delivered To This Friend Only. One Redemption. An Unredeemed Card Can Be Returned To The Sender.</p>
                  <button type="button" className={`${theme.action} ${theme.primaryAction}`} disabled={busy} onClick={purchase}>
                    {busy ? 'Processing Your Gift...' : pending ? 'Retry / Resume This Gift' : method === 'card' ? 'Continue To Gift Checkout' : 'Pay Diamonds And Send Gift'}</button>
                  {!pending && <button type="button" className={theme.action} disabled={busy} onClick={() => setReview(null)}>Edit Gift</button>}
                </div>}
            </>}
          </>}
        </div>
        <div className={styles.history}>
          <div className={styles.historyHeading}><h3>My VIP Gift Cards</h3><button type="button" className={theme.action} disabled={busy} onClick={refresh}>Refresh Gifts</button></div>
          {loaded && !gifts.length && <p>Your Sent And Received VIP Gifts Will Appear Here.</p>}
          {gifts.map(g => <article key={g.id} className={styles.gift}>
            <span>{g.recipientId === accountId ? `From ${personName(g.senderId)}` : `To ${personName(g.recipientId)}`}</span>
            <h4>{names[g.plan]} VIP Gift Card</h4><p>{statusNames[g.status] || 'Checking Status'}</p>
            <small>{g.method === 'card' ? price(g.amount) : `${g.amount.toLocaleString('en-US')} Diamonds`} · One-Time Gift</small>
            {g.status === 'pending' && g.senderId === accountId && <a className={theme.action} href="#vip-gift-workspace" onClick={() => resume(g)}>Resume / Check Gift Checkout</a>}
            {g.status === 'available' && g.recipientId === accountId && <button type="button" className={`${theme.action} ${theme.primaryAction}`} disabled={busy} onClick={() => act(g, 'redeem')}>Redeem My VIP Gift</button>}
            {['available','return_pending'].includes(g.status) && <details><summary>Return This Gift</summary>
              <p>Return The Full Unredeemed Gift To The Original Payment Method. This Cancels The Gift Card.</p>
              <button type="button" className={theme.action} disabled={busy} onClick={() => act(g, 'return')}>Confirm Gift Return</button></details>}
          </article>)}
          {cursor && <button type="button" className={theme.action} disabled={busy} onClick={loadMore}>Load More Gift Cards</button>}
        </div>
      </div>}
      {message && <p className={styles.message} role="status">{message}</p>}
    </>}
  </section>;
}
