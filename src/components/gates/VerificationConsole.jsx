import Link from 'next/link';
import styles from './VerificationConsole.module.css';

/** The owner's artwork is the complete surface. Transparent semantic controls
 * occupy its measured input, plate, close and link faces at the native ratio. */
export default function VerificationConsole({ checking, alreadyVerified, stage, busy, error,
    phone, digits, code, codeRef, cooldown, formatPhone, onPhoneChange, onCodeChange,
    sendCode, verifyCode, skip, goHub, changePhone, doneLead, vipDays, welcomeDiamonds,
    bonusDiamonds, packageStatus }) {
    const complete = alreadyVerified || stage === 'done';
    const isCode = stage === 'code' && !complete;
    const action = complete ? goHub : isCode ? verifyCode : sendCode;
    const actionLabel = checking ? 'Loading Your Account...' : complete ? 'Enter The Hub'
        : busy ? (isCode ? 'Verifying...' : 'Sending...') : isCode ? 'Verify And Claim' : 'Send Verification Code';
    return <main className={styles.page}>
        <section className={styles.console} aria-labelledby="verification-title" aria-busy={busy || checking}>
            <img className={styles.art} src="/images/verification/phone-welcome-v2.webp" alt="" aria-hidden="true" draggable={false} />
            <h1 id="verification-title" className={styles.srOnly}>{complete ? 'Phone Verified' : 'Welcome To Smarter.Poker'}</h1>
            <p className={styles.srOnly}>Verify Your Phone Number To Unlock Your Welcome Package. 30-Day VIP Card And 500 Diamonds.</p>
            <button type="button" className={`${styles.hitbox} ${styles.close}`} onClick={complete ? goHub : skip}
                disabled={busy || checking} aria-label="Close Verification" />
            {complete && <div className={styles.rewardStatus} role="status">
                {packageStatus === 'withheld_disposable' ? 'Welcome Package Not Eligible' : <>
                    <span>{vipDays > 0 ? `${vipDays}-Day VIP Activated` : 'VIP Already On Your Account'}</span>
                    <span>{welcomeDiamonds > 0 ? `+${welcomeDiamonds} Diamonds Added` : packageStatus === 'mint_refused' ? 'Diamonds Pending' : 'Welcome Diamonds Already Claimed'}</span>
                </>}
            </div>}
            <form onSubmit={(event) => { event.preventDefault(); if (!checking && !busy && (complete || (isCode ? code.length === 4 : digits.length === 10))) action(); }}>
                <label className={isCode || complete || checking ? styles.liveLabel : styles.srOnly} htmlFor={isCode ? 'vp-code' : 'vp-phone'}>
                    {checking ? 'Loading Your Account...' : complete ? 'Your Phone Is Verified' : isCode ? '4-Digit Verification Code' : 'US Mobile Number'}
                </label>
                {isCode && <span className={styles.codePrefix}>Code</span>}
                {!complete && !checking && <input id={isCode ? 'vp-code' : 'vp-phone'} ref={isCode ? codeRef : undefined}
                    className={`${styles.input} ${isCode ? styles.codeInput : ''}`} type={isCode ? 'text' : 'tel'} inputMode={isCode ? 'numeric' : 'tel'}
                    autoComplete={isCode ? 'one-time-code' : 'tel-national'} maxLength={isCode ? 4 : 14}
                    placeholder={isCode ? '4-Digit Code' : '(555) 555-5555'} value={isCode ? code : formatPhone(phone)}
                    disabled={busy} onChange={isCode ? onCodeChange : onPhoneChange} />}
                {complete && <p className={styles.completion}>{alreadyVerified ? 'Already Verified On This Account.' : doneLead}</p>}
                <button type="submit" className={`${styles.hitbox} ${styles.send}`} aria-label={actionLabel}
                    disabled={checking || busy || (!complete && (isCode ? code.length !== 4 : digits.length !== 10))}>
                    <span className={isCode || complete || checking || busy ? styles.liveAction : styles.srOnly}>{actionLabel}</span>
                </button>
            </form>
            {isCode && <div className={styles.stateFooter}><div className={styles.codeActions}>
                <span>Code Sent To +1 {formatPhone(phone)}</span>
                <button type="button" onClick={changePhone} disabled={busy}>Change Number</button>
                <button type="button" onClick={sendCode} disabled={busy || cooldown > 0}>{cooldown > 0 ? `Resend In ${cooldown}s` : 'Resend Code'}</button>
            </div><button type="button" onClick={skip} disabled={busy}>Skip For Now</button></div>}
            {complete && <div className={styles.stateFooter}><div className={styles.codeActions}>{bonusDiamonds > 0 ? `Plus ${bonusDiamonds} Bonus Diamonds For Verifying Your Phone.` : 'Your Account Status Is Up To Date.'}</div></div>}
            {!isCode && <button type="button" className={`${styles.hitbox} ${styles.skip}`} disabled={busy || checking} onClick={complete ? goHub : skip} aria-label={complete ? 'Go To The Hub' : 'Skip For Now'}>
                {complete && <span className={styles.liveSkip}>Go To The Hub</span>}
            </button>}
            <Link href="/hub" className={`${styles.hitbox} ${styles.hub}`} onClick={(event) => { event.preventDefault(); if (!busy && !checking) (complete ? goHub : skip)(); }} aria-label="Hub" />
            <Link href="/hub/help" className={`${styles.hitbox} ${styles.help}`} aria-label="Help" />
        </section>
        {error && <p role="alert" className={styles.error}>{error}</p>}
    </main>;
}
