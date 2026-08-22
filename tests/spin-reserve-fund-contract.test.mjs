/**
 * fund_spin_reserve - the money path behind the union's Spin reserve button.
 *
 * WHAT THIS PROTECTS
 *
 * There are two functions in the database with almost the same name:
 *
 *   fn_spin_reserve_wallet_fund      moves the money. No replay protection at
 *                                    all, and a NULL source wallet MINTS the
 *                                    chips as an operator deposit.
 *   fn_spin_reserve_wallet_fund_op   wraps it, claims an op id on the ledger
 *                                    row, rolls the entire move back if that
 *                                    id was already used, and refuses a NULL
 *                                    source wallet.
 *
 * Only the second is safe to put behind a button. Calling the first would look
 * identical in every log and every response - it returns the same shape - and
 * would double-credit on any retry, which for a fund control means an impatient
 * operator, a serverless cold start, or a browser resending the POST.
 *
 * The second trap is the envelope. This RPC returns { ok: true|false }, while
 * every neighbouring money RPC in the same file returns { success }. Reading
 * `success` here is always undefined, so every refusal - insufficient funds
 * included - would be reported to the operator as a completed transfer. That is
 * the precise shape tests/unchecked-money-rpc.test.mjs was written for after a
 * rejected debit shipped as a free item in marketplace-purchase.
 *
 * These are source-level assertions on purpose: the handler needs Supabase,
 * Zod and a live union to run, and the failures being guarded against are all
 * visible in the source. A test that cannot run in CI protects nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..');
const HANDLER = path.join(REPO, 'pages/api/club-arena/union-wallet.js');
const CONTRACT = path.join(REPO, 'src/contracts/orb4_syndicate.ts');

const handler = fs.readFileSync(HANDLER, 'utf8');
const contract = fs.readFileSync(CONTRACT, 'utf8');

/** The fund_spin_reserve branch, isolated from the rest of the handler. */
function fundBranch() {
    const start = handler.indexOf("if (action === 'fund_spin_reserve')");
    assert.ok(start > -1, 'the fund_spin_reserve branch is gone from union-wallet.js');
    const next = handler.indexOf("if (action === 'fund_bbj_pool')", start);
    return handler.slice(start, next > -1 ? next : handler.length);
}

test('fund_spin_reserve calls the op-scoped wrapper, never the bare function', () => {
    const branch = fundBranch();
    assert.match(
        branch,
        /rpc\(\s*\n?\s*'fn_spin_reserve_wallet_fund_op'/,
        'fund_spin_reserve must call fn_spin_reserve_wallet_fund_op'
    );
    assert.doesNotMatch(
        branch,
        /'fn_spin_reserve_wallet_fund'/,
        'fund_spin_reserve calls the BARE fn_spin_reserve_wallet_fund. That function has no replay protection and mints chips when the source wallet is null.'
    );
    assert.match(branch, /p_op_id:\s*opId/, 'the op id is not being passed to the RPC');
    assert.match(branch, /p_from_wallet:\s*fromWallet/, 'the source wallet is not being passed to the RPC');
});

test('fund_spin_reserve reads ok, not success', () => {
    const branch = fundBranch();
    assert.match(
        branch,
        /fundRes\?\.ok\s*!==\s*true/,
        'the refusal check must read `ok`. fn_spin_reserve_wallet_fund_op returns { ok }, so reading `success` is undefined on every response and books a refusal as a completed transfer.'
    );
    assert.doesNotMatch(
        branch,
        /fundRes\?\.success/,
        'this RPC has no `success` key - reading one always yields undefined'
    );
    assert.match(branch, /fundRes\?\.duplicate/, 'a replay must be reported as a duplicate, not as a generic failure');
    assert.match(branch, /409/, 'a duplicate should answer 409');
});

test('fund_spin_reserve refuses to proceed without a usable op id', () => {
    const branch = fundBranch();
    assert.match(
        branch,
        /if\s*\(!opId/,
        'the branch must reject a missing op id before calling the RPC - without one the fund is not idempotent'
    );
    assert.match(branch, /400/, 'a missing op id is a client error');
});

test('fund_spin_reserve is guarded by the idempotency middleware', () => {
    assert.match(
        handler,
        /const mutationActions = \[[^\]]*'fund_spin_reserve'/s,
        "fund_spin_reserve must be in mutationActions or checkIdempotency never runs for it"
    );
});

test('get_balances returns and totals the spin reserve wallet', () => {
    const start = handler.indexOf("if (action === 'get_balances')");
    assert.ok(start > -1, 'get_balances is gone');
    const branch = handler.slice(start, handler.indexOf('Lead-only actions from here', start));

    assert.match(
        branch,
        /\.select\('[^']*spin_reserve_wallet[^']*'\)/,
        'get_balances no longer selects spin_reserve_wallet - the union cannot see the wallet that funds its own Spin pools'
    );
    assert.match(branch, /spin_reserve_wallet:\s*Number\(w\.spin_reserve_wallet/, 'spin_reserve_wallet is selected but not returned');
    assert.match(
        branch,
        /total:[\s\S]*Number\(w\.spin_reserve_wallet \|\| 0\)/,
        'spin_reserve_wallet is missing from the wallet total, so the total understates what the union holds'
    );
});

test('the Zod contract requires a real source wallet, and only the three that exist', () => {
    assert.match(contract, /FundSpinReserveSchema/, 'FundSpinReserveSchema is missing from the contract');

    const start = contract.indexOf('export const FundSpinReserveSchema');
    const schema = contract.slice(start, contract.indexOf('export type FundSpinReserve', start));

    assert.match(
        schema,
        /fromWallet:\s*z\.enum\(\['promo_wallet', 'rake_wallet', 'chip_balance'\]\)/,
        "fromWallet must be a required enum of exactly the three wallets fn_spin_reserve_wallet_fund accepts. Optional means null, and null means mint."
    );
    assert.doesNotMatch(schema, /fromWallet:[^\n]*optional/, 'fromWallet must not be optional - a null source mints chips');
    assert.match(schema, /\.strict\(\)/, 'the schema must be strict so unknown keys are rejected');

    assert.match(
        contract,
        /discriminatedUnion\('action', \[[\s\S]*FundSpinReserveSchema[\s\S]*\]\)/,
        'FundSpinReserveSchema is defined but not in UnionWalletSchema, so the action is rejected as unknown before it reaches the handler'
    );
});

test('WalletType lists every wallet the database CHECK allows', () => {
    const start = contract.indexOf('export const WalletType');
    const block = contract.slice(start, contract.indexOf(');', start));
    for (const w of [
        'chip_balance',
        'rake_wallet',
        'bbj_wallet',
        'promo_wallet',
        'insurance_wallet',
        'spin_reserve_wallet',
    ]) {
        assert.ok(
            block.includes(`'${w}'`),
            `WalletType is missing ${w}, which union_wallet_transactions.wallet accepts - filtering transactions by it answers 400 for a request the database considers valid`
        );
    }
});
