import { ArrowRight, Check, Diamond, Smartphone } from 'lucide-react';
import styles from './SignupWelcome.module.css';

export default function SignupWelcome({ playerNumber, alias, city, state, onContinue, onVerifyPhone }) {
    return (
        <section className={styles.welcome} aria-labelledby="signup-welcome-title">
            <div className={styles.brand}>
                <img src="/images/merch/neural-steel/print/brain-spade-metallic.png" alt="" width="110" height="118" />
                <span>Smarter<span className={styles.blue}>.Poker</span></span>
            </div>
            <div className={styles.verified}><Check size={14} aria-hidden="true" /> Email Verified</div>
            <h2 id="signup-welcome-title">Welcome To Smarter.Poker!</h2>
            <p className={styles.lead}>Your Identity. Every Game. One Place.</p>
            <div className={styles.credential}>
                <div className={styles.edge} aria-hidden="true" />
                <div className={styles.cardTop}><span>Player Access</span><span className={styles.status}><i /> Active</span></div>
                <span className={styles.numberLabel}>Your Player Number</span>
                <strong className={styles.number}>{playerNumber ? `#${playerNumber}` : 'Account Ready'}</strong>
                <div className={styles.identity}><strong>{alias}</strong><span>{[city, state].filter(Boolean).join(', ')}</span></div>
                <div className={styles.cardFoot}><span>PokerIQ</span><span>Training</span><span>Club Arena</span></div>
            </div>
            <button type="button" className={styles.continue} onClick={onContinue}>Enter The Club Lobby <ArrowRight size={19} aria-hidden="true" /></button>
            <div className={styles.reward}>
                <Diamond size={25} aria-hidden="true" />
                <div><strong>Your Welcome Package Awaits</strong><p>Verify Your Phone To Claim 30 Days Of VIP And 500 Diamonds.</p></div>
            </div>
            <button type="button" className={styles.phone} onClick={onVerifyPhone}><Smartphone size={17} aria-hidden="true" /> Verify Phone And Claim Welcome Package</button>
        </section>
    );
}
