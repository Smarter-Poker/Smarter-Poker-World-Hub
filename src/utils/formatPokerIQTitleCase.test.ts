/**
 * Tests for PokerIQ Typography & Capitalization Law
 * These tests are MANDATORY and define the contract
 */

import { formatPokerIQTitleCase } from './formatPokerIQTitleCase';

describe('PokerIQ Typography Law', () => {
    describe('Stack sizes and units', () => {
        test('normalizes bb with spacing', () => {
            expect(formatPokerIQTitleCase('stack size: 25 bb')).toBe('Stack Size: 25 BB');
            expect(formatPokerIQTitleCase('stack size: 100bb')).toBe('Stack Size: 100 BB');
            expect(formatPokerIQTitleCase('25bb deep')).toBe('25 BB Deep');
        });

        test('normalizes sb with spacing', () => {
            expect(formatPokerIQTitleCase('post 1 sb')).toBe('Post 1 SB');
            expect(formatPokerIQTitleCase('2sb')).toBe('2 SB');
        });
    });

    describe('Metrics and acronyms', () => {
        test('EV always ALL CAPS', () => {
            expect(formatPokerIQTitleCase('ev difference')).toBe('EV Difference');
            expect(formatPokerIQTitleCase('expected ev')).toBe('Expected EV');
        });

        test('ICM always ALL CAPS', () => {
            expect(formatPokerIQTitleCase('icm pressure')).toBe('ICM Pressure');
            expect(formatPokerIQTitleCase('icm spot')).toBe('ICM Spot');
        });

        test('other metrics ALL CAPS', () => {
            expect(formatPokerIQTitleCase('roi calculation')).toBe('ROI Calculation');
            expect(formatPokerIQTitleCase('vpip stats')).toBe('VPIP Stats');
            expect(formatPokerIQTitleCase('pfr range')).toBe('PFR Range');
        });
    });

    describe('Positions', () => {
        test('UTG always ALL CAPS', () => {
            expect(formatPokerIQTitleCase('utg open')).toBe('UTG Open');
            expect(formatPokerIQTitleCase('utg1 range')).toBe('UTG1 Range');
        });

        test('BTN always ALL CAPS', () => {
            expect(formatPokerIQTitleCase('btn vs co')).toBe('BTN Vs CO');
            expect(formatPokerIQTitleCase('bu vs co')).toBe('BTN Vs CO'); // BU alias
        });

        test('all positions ALL CAPS', () => {
            expect(formatPokerIQTitleCase('sb vs bb')).toBe('SB Vs BB');
            expect(formatPokerIQTitleCase('hj raise')).toBe('HJ Raise');
            expect(formatPokerIQTitleCase('co steal')).toBe('CO Steal');
        });
    });

    describe('Bet notation', () => {
        test('3-Bet canonical form', () => {
            expect(formatPokerIQTitleCase('3bet pot')).toBe('3-Bet Pot');
            expect(formatPokerIQTitleCase('3-bet')).toBe('3-Bet');
            expect(formatPokerIQTitleCase('3 bet')).toBe('3-Bet');
            expect(formatPokerIQTitleCase('3BET')).toBe('3-Bet');
        });

        test('4-Bet and 5-Bet', () => {
            expect(formatPokerIQTitleCase('4bet range')).toBe('4-Bet Range');
            expect(formatPokerIQTitleCase('5bet jam')).toBe('5-Bet Jam');
        });

        test('betting suffix', () => {
            expect(formatPokerIQTitleCase('3betting frequency')).toBe('3-Betting Frequency');
        });
    });

    describe('Common poker terms', () => {
        test('All-In canonical', () => {
            expect(formatPokerIQTitleCase('all in now')).toBe('All-In Now');
            expect(formatPokerIQTitleCase('all-in')).toBe('All-In');
            expect(formatPokerIQTitleCase('allin')).toBe('All-In');
        });

        test('C-Bet canonical', () => {
            expect(formatPokerIQTitleCase('cbet frequency 33.3 %')).toBe('C-Bet Frequency 33.3%');
            expect(formatPokerIQTitleCase('c-bet')).toBe('C-Bet');
            expect(formatPokerIQTitleCase('c bet')).toBe('C-Bet');
        });

        test('Check-Raise canonical', () => {
            expect(formatPokerIQTitleCase('check raise line')).toBe('Check-Raise Line');
            expect(formatPokerIQTitleCase('checkraise')).toBe('Check-Raise');
        });

        test('Donk-Bet canonical', () => {
            expect(formatPokerIQTitleCase('donk bet spot')).toBe('Donk-Bet Spot');
            expect(formatPokerIQTitleCase('donk')).toBe('Donk-Bet');
        });

        test('Iso-Raise canonical', () => {
            expect(formatPokerIQTitleCase('iso raise')).toBe('Iso-Raise');
            expect(formatPokerIQTitleCase('iso')).toBe('Iso-Raise');
        });
    });

    describe('Hand notation', () => {
        test('suited hands', () => {
            expect(formatPokerIQTitleCase('akS')).toBe('AKs');
            expect(formatPokerIQTitleCase('AQO')).toBe('AQo');
            expect(formatPokerIQTitleCase('kqs')).toBe('KQs');
        });

        test('pairs', () => {
            expect(formatPokerIQTitleCase('tt')).toBe('TT');
            expect(formatPokerIQTitleCase('AA')).toBe('AA');
        });
    });

    describe('Safety guards', () => {
        test('URLs unchanged', () => {
            const url = 'go to https://pokeriq.app';
            expect(formatPokerIQTitleCase(url)).toBe(url);
        });

        test('UUIDs unchanged', () => {
            const uuid = 'user_id 8bb621b6-16b5-4bd9-bb73-7c78a8d347ad';
            expect(formatPokerIQTitleCase(uuid)).toBe(uuid);
        });

        test('identifiers unchanged', () => {
            expect(formatPokerIQTitleCase('user_profile_data')).toBe('user_profile_data');
            expect(formatPokerIQTitleCase('api-key-value')).toBe('api-key-value');
        });

        test('raw mode bypasses', () => {
            expect(formatPokerIQTitleCase('ev difference', { raw: true })).toBe('ev difference');
        });
    });

    describe('Idempotency', () => {
        test('running twice yields same result', () => {
            const input = 'utg 3bet vs btn with 100bb stack';
            const once = formatPokerIQTitleCase(input);
            const twice = formatPokerIQTitleCase(once);
            expect(once).toBe(twice);
            expect(once).toBe('UTG 3-Bet Vs BTN With 100 BB Stack');
        });
    });

    describe('Title Case default', () => {
        test('capitalizes first letter of words', () => {
            expect(formatPokerIQTitleCase('hello world')).toBe('Hello World');
            expect(formatPokerIQTitleCase('this is a test')).toBe('This Is A Test');
        });
    });
});
