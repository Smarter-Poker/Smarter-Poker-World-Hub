/**
 * Typography Law Showcase
 * Visual proof surface for PokerIQ Typography & Capitalization Law
 * Route: /dev/typography-law
 */

import React from 'react';
import Head from 'next/head';
import { formatPokerIQTitleCase } from '../../src/utils/formatPokerIQTitleCase';
import { Text, Heading } from '../../src/components/typography/TypographyPrimitives';

const testCases = [
    // Stack sizes
    { input: 'stack size: 25 bb', expected: 'Stack Size: 25 BB', category: 'Units' },
    { input: 'stack size: 100bb', expected: 'Stack Size: 100 BB', category: 'Units' },
    { input: '25bb deep', expected: '25 BB Deep', category: 'Units' },

    // Metrics
    { input: 'ev difference', expected: 'EV Difference', category: 'Metrics' },
    { input: 'icm pressure', expected: 'ICM Pressure', category: 'Metrics' },
    { input: 'roi calculation', expected: 'ROI Calculation', category: 'Metrics' },
    { input: 'vpip stats', expected: 'VPIP Stats', category: 'Metrics' },

    // Positions
    { input: 'utg open', expected: 'UTG Open', category: 'Positions' },
    { input: 'btn vs co', expected: 'BTN Vs CO', category: 'Positions' },
    { input: 'sb vs bb', expected: 'SB Vs BB', category: 'Positions' },
    { input: 'bu raise', expected: 'BTN Raise', category: 'Positions' },

    // Bet notation
    { input: '3bet pot', expected: '3-Bet Pot', category: 'Bet Notation' },
    { input: '4bet range', expected: '4-Bet Range', category: 'Bet Notation' },
    { input: '3betting frequency', expected: '3-Betting Frequency', category: 'Bet Notation' },

    // Common terms
    { input: 'all in now', expected: 'All-In Now', category: 'Common Terms' },
    { input: 'cbet frequency 33.3 %', expected: 'C-Bet Frequency 33.3%', category: 'Common Terms' },
    { input: 'check raise line', expected: 'Check-Raise Line', category: 'Common Terms' },
    { input: 'donk bet spot', expected: 'Donk-Bet Spot', category: 'Common Terms' },
    { input: 'iso raise', expected: 'Iso-Raise', category: 'Common Terms' },

    // Hand notation
    { input: 'akS', expected: 'AKs', category: 'Hand Notation' },
    { input: 'AQO', expected: 'AQo', category: 'Hand Notation' },
    { input: 'tt', expected: 'TT', category: 'Hand Notation' },

    // Safety
    { input: 'go to https://pokeriq.app', expected: 'go to https://pokeriq.app', category: 'Safety (URLs)' },
    { input: 'user_id 8bb621b6-16b5-4bd9-bb73-7c78a8d347ad', expected: 'user_id 8bb621b6-16b5-4bd9-bb73-7c78a8d347ad', category: 'Safety (UUIDs)' },
    { input: 'user_profile_data', expected: 'user_profile_data', category: 'Safety (Identifiers)' },
];

export default function TypographyLawShowcase() {
    const results = testCases.map(tc => ({
        ...tc,
        actual: formatPokerIQTitleCase(tc.input),
        pass: formatPokerIQTitleCase(tc.input) === tc.expected
    }));

    const passCount = results.filter(r => r.pass).length;
    const totalCount = results.length;

    return (
        <>
            <Head>
                <title>Typography Law Showcase | PokerIQ</title>
            </Head>

            <div style={{
                minHeight: '100vh',
                background: 'linear-gradient(135deg, #0a0a15 0%, #1a1a2e 100%)',
                color: '#fff',
                padding: '40px 20px',
                fontFamily: 'Inter, sans-serif'
            }}>
                <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                    <Heading level={1} style={{
                        fontSize: 48,
                        fontWeight: 900,
                        marginBottom: 16,
                        background: 'linear-gradient(135deg, #00D4FF, #7B2FF7)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent'
                    }}>
                        PokerIQ Typography & Capitalization Law
                    </Heading>

                    <Text style={{
                        fontSize: 18,
                        color: 'rgba(255,255,255,0.7)',
                        marginBottom: 40,
                        display: 'block'
                    }}>
                        Deterministic, non-optional formatting for all user-facing text
                    </Text>

                    {/* Status Badge */}
                    <div style={{
                        display: 'inline-block',
                        padding: '12px 24px',
                        background: passCount === totalCount ? '#00ff88' : '#ff4444',
                        color: '#000',
                        borderRadius: 8,
                        fontWeight: 700,
                        marginBottom: 40
                    }}>
                        {passCount === totalCount ? '✅ ALL TESTS PASSING' : `❌ ${totalCount - passCount} FAILURES`} ({passCount}/{totalCount})
                    </div>

                    {/* Test Results Table */}
                    <div style={{
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: 12,
                        overflow: 'hidden',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                                    <th style={headerStyle}>Category</th>
                                    <th style={headerStyle}>Input</th>
                                    <th style={headerStyle}>Expected</th>
                                    <th style={headerStyle}>Actual</th>
                                    <th style={headerStyle}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((result, idx) => (
                                    <tr key={idx} style={{
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        background: result.pass ? 'transparent' : 'rgba(255,68,68,0.1)'
                                    }}>
                                        <td style={cellStyle}>{result.category}</td>
                                        <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: 13 }}>
                                            {result.input}
                                        </td>
                                        <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: 13, color: '#00ff88' }}>
                                            {result.expected}
                                        </td>
                                        <td style={{ ...cellStyle, fontFamily: 'monospace', fontSize: 13, color: result.pass ? '#00ff88' : '#ff4444' }}>
                                            {result.actual}
                                        </td>
                                        <td style={{ ...cellStyle, textAlign: 'center' }}>
                                            {result.pass ? '✅' : '❌'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Law Summary */}
                    <div style={{
                        marginTop: 60,
                        padding: 32,
                        background: 'rgba(0,212,255,0.1)',
                        border: '2px solid rgba(0,212,255,0.3)',
                        borderRadius: 12
                    }}>
                        <Heading level={2} style={{ fontSize: 24, marginBottom: 20 }}>
                            Law Summary
                        </Heading>
                        <ul style={{ fontSize: 14, lineHeight: 1.8, color: 'rgba(255,255,255,0.8)' }}>
                            <li><strong>Default:</strong> Title Case (First Letter Of Every Word)</li>
                            <li><strong>Units:</strong> BB, SB (always ALL CAPS with space: "25 BB")</li>
                            <li><strong>Metrics:</strong> EV, ICM, ROI, VPIP, PFR, etc. (always ALL CAPS)</li>
                            <li><strong>Positions:</strong> UTG, BTN, CO, HJ, SB, BB (always ALL CAPS)</li>
                            <li><strong>Bet Notation:</strong> 3-Bet, 4-Bet, 5-Bet (hyphenated)</li>
                            <li><strong>Common Terms:</strong> All-In, C-Bet, Check-Raise, Donk-Bet, Iso-Raise</li>
                            <li><strong>Hand Notation:</strong> AKs, AQo, TT (ranks uppercase, suffix lowercase)</li>
                            <li><strong>Safety:</strong> URLs, UUIDs, identifiers remain unchanged</li>
                        </ul>
                    </div>
                </div>
            </div>
        </>
    );
}

const headerStyle: React.CSSProperties = {
    padding: '16px 20px',
    textAlign: 'left',
    fontSize: 14,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
};

const cellStyle: React.CSSProperties = {
    padding: '12px 20px',
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)'
};
