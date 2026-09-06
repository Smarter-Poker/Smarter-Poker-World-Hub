#!/usr/bin/env node

/**
 * Rollback-only behavioral rehearsal for the deduct_diamonds idempotency fix.
 *
 * The migration and its documented rollback are executed inside one outer
 * transaction. The harness proves that neither one can escape that transaction,
 * exercises adversarial replay cases, rolls everything back, and then verifies
 * the selected wallet and every rehearsal reference are unchanged.
 *
 * Production is refused unless the operator deliberately sets:
 *   TRIVIA_LIFELINE_ALLOW_PRODUCTION_REHEARSAL=true
 *
 * Optional:
 *   TRIVIA_ENV_FILE=/absolute/path/to/.env.local
 *   SUPABASE_PROJECT_REF=<clone-or-staging-ref>
 *   TRIVIA_LIFELINE_REHEARSAL_TARGET=clone|staging|local
 */

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

require('dotenv').config({
    path: process.env.TRIVIA_ENV_FILE || path.resolve('.env.local'),
    quiet: true,
});

const PRODUCTION_PROJECT_REF = 'kuklfnapbkmacvwxktbh';
const projectRef = process.env.SUPABASE_PROJECT_REF || PRODUCTION_PROJECT_REF;
const allowProduction = process.env.TRIVIA_LIFELINE_ALLOW_PRODUCTION_REHEARSAL === 'true';
const rehearsalTarget = process.env.TRIVIA_LIFELINE_REHEARSAL_TARGET;
const verifyLive = process.argv.includes('--verify-live');
const migrationPath = path.resolve(
    process.argv.find(argument => !argument.startsWith('--') && argument.endsWith('.sql'))
    || 'supabase/migrations/20260906210000_deduct_diamonds_idempotency_binding.sql',
);

function invariant(condition, message) {
    if (!condition) throw new Error(message);
}

if (projectRef === PRODUCTION_PROJECT_REF) {
    invariant(allowProduction,
        'Refusing production rehearsal without TRIVIA_LIFELINE_ALLOW_PRODUCTION_REHEARSAL=true');
} else {
    invariant(['clone', 'staging', 'local'].includes(rehearsalTarget),
        'Set TRIVIA_LIFELINE_REHEARSAL_TARGET=clone, staging, or local');
}

invariant(fs.existsSync(migrationPath), 'Migration file not found');
const migration = fs.readFileSync(migrationPath, 'utf8');
const rollbackMarker = '-- ROLLBACK (Tier 3:';
const rollbackMarkerIndex = migration.indexOf(rollbackMarker);
invariant(rollbackMarkerIndex > 0, 'Tier 3 rollback marker is missing');

const activeEnvelope = migration.slice(0, rollbackMarkerIndex);
const activeBegins = activeEnvelope.match(/^\s*BEGIN;\s*$/gm) || [];
const activeCommits = activeEnvelope.match(/^\s*COMMIT;\s*$/gm) || [];
invariant(activeBegins.length === 1 && activeCommits.length === 1,
    'Active migration must contain exactly one top-level BEGIN/COMMIT pair');
const activeSql = activeEnvelope
    .replace(/^\s*BEGIN;\s*$/m, '')
    .replace(/^\s*COMMIT;\s*$/m, '');
invariant(!/^\s*(BEGIN|COMMIT);\s*$/m.test(activeSql),
    'Active migration transaction boundary was not fully removed');

const rollbackEnvelope = migration.slice(rollbackMarkerIndex);
const rollbackMatch = rollbackEnvelope.match(
    /\/\*\s*\r?\nBEGIN;\s*\r?\n([\s\S]*?)\r?\nCOMMIT;\s*\r?\n\*\//,
);
invariant(rollbackMatch?.[1], 'Executable rollback transaction was not found');
const rollbackSql = rollbackMatch[1];
invariant(!/^\s*(BEGIN|COMMIT|ROLLBACK);\s*$/m.test(rollbackSql),
    'Rollback body contains an unsafe transaction boundary');

const password = process.env.SUPABASE_DB_PASSWORD || process.env.POSTGRES_PASSWORD;
invariant(password, 'SUPABASE_DB_PASSWORD or POSTGRES_PASSWORD is required');

const configs = [
    {
        host: 'aws-0-us-west-2.pooler.supabase.com',
        port: 6543,
        user: `postgres.${projectRef}`,
        password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
    },
    {
        host: `db.${projectRef}.supabase.co`,
        port: 5432,
        user: 'postgres',
        password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
    },
];

async function connect() {
    let lastError;
    for (const config of configs) {
        const client = new Client({
            ...config,
            application_name: 'trivia_lifeline_rollback_rehearsal',
            connectionTimeoutMillis: 10_000,
            statement_timeout: 120_000,
        });
        try {
            await client.connect();
            return client;
        } catch (error) {
            lastError = error;
            await client.end().catch(() => {});
        }
    }
    throw lastError || new Error('database_connection_failed');
}

async function callDeduct(client, {
    userId,
    amount,
    transactionType,
    source = null,
    metadata = {},
    referenceId,
}) {
    const { rows } = await client.query(
        `SELECT public.deduct_diamonds(
            $1::uuid, $2::integer, 'rollback-only lifeline rehearsal',
            $3::text, $4::text, $5::jsonb, $6::text, 0
        ) AS receipt`,
        [userId, amount, transactionType, source, JSON.stringify(metadata), referenceId],
    );
    return rows[0]?.receipt;
}

async function currentFunction(client) {
    const { rows } = await client.query(`
        SELECT md5(p.prosrc) AS source_md5,
               p.proconfig,
               position('idempotency_conflict' IN p.prosrc) > 0 AS hardened,
               has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
               has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
               has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
               has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
          FROM pg_proc AS p
         WHERE p.oid = to_regprocedure(
             'public.deduct_diamonds(uuid,integer,text,text,text,jsonb,text,integer)'
         )
    `);
    invariant(rows.length === 1, 'Canonical deduct_diamonds function is missing');
    return rows[0];
}

async function main() {
    const client = await connect();
    let wallet;
    let ledgerRowsBefore;
    const suffix = randomUUID().replaceAll('-', '');
    const references = {
        seeded: `rehearsal_seed_${suffix}`,
        exact: `rehearsal_exact_${suffix}`,
        recipient: `rehearsal_recipient_${suffix}`,
        insufficient: `rehearsal_insufficient_${suffix}`,
    };

    try {
        const preimage = await currentFunction(client);
        invariant(verifyLive ? preimage.hardened : !preimage.hardened,
            verifyLive
                ? 'Live verifier requires the hardened production function'
                : 'Rollback rehearsal requires the pre-migration function');

        ({ rows: [wallet] } = await client.query(`
            SELECT id, diamonds, diamond_balance
              FROM public.profiles
             WHERE is_horse IS TRUE
               AND diamonds >= 25
               AND diamonds IS NOT DISTINCT FROM diamond_balance
             ORDER BY id
             LIMIT 1
        `));
        invariant(wallet?.id, 'No safe rehearsal wallet is available');
        ({ rows: [{ count: ledgerRowsBefore }] } = await client.query(
            'SELECT count(*)::bigint AS count FROM public.diamond_transactions',
        ));

        await client.query('BEGIN');
        const { rows: [txStart] } = await client.query(
            'SELECT txid_current()::text AS id',
        );
        if (!verifyLive) {
            await client.query(activeSql);
            const { rows: [txAfterMigration] } = await client.query(
                'SELECT txid_current()::text AS id',
            );
            invariant(txAfterMigration.id === txStart.id,
                'Migration escaped the rollback-only outer transaction');
        }

        const hardened = await currentFunction(client);
        invariant(hardened.hardened, 'Migration did not install replay binding');
        invariant(hardened.proconfig?.includes('search_path=public, extensions'),
            'Migration did not install the fixed search path');
        invariant(!hardened.public_execute && !hardened.anon_execute
            && !hardened.authenticated_execute && hardened.service_execute,
        'Migration did not retain least-privilege execution');

        await client.query(
            `SELECT set_config('request.jwt.claim.role', 'service_role', true)`,
        );

        const seeded = await callDeduct(client, {
            userId: wallet.id,
            amount: 1,
            transactionType: 'game_cost',
            referenceId: references.seeded,
        });
        invariant(seeded?.success === true && seeded.charged === 1
            && seeded.idempotent === false, 'Seed debit failed');

        const priceSubstitution = await callDeduct(client, {
            userId: wallet.id,
            amount: 5,
            transactionType: 'trivia_lifeline',
            referenceId: references.seeded,
        });
        invariant(priceSubstitution?.success === false
            && priceSubstitution.error === 'idempotency_conflict',
        'One-diamond debit replayed as a five-diamond lifeline');

        const exact = await callDeduct(client, {
            userId: wallet.id,
            amount: 5,
            transactionType: 'trivia_lifeline',
            referenceId: references.exact,
        });
        invariant(exact?.success === true && exact.charged === 5
            && exact.transaction_type === 'trivia_lifeline'
            && exact.reference_id === references.exact
            && exact.counterparty === 'revenue:trivia_lifeline'
            && exact.issuance_class === 'spend'
            && exact.idempotent === false,
        'First lifeline receipt was incomplete or incorrect');

        const recipientA = randomUUID();
        const recipientB = randomUUID();
        const transfer = await callDeduct(client, {
            userId: wallet.id,
            amount: 1,
            transactionType: 'diamond_gift_sent',
            source: 'wallet_transfer',
            metadata: { recipient_id: recipientA },
            referenceId: references.recipient,
        });
        invariant(transfer?.success === true
            && transfer.counterparty === `player:${recipientA}`
            && transfer.issuance_class === 'transferred',
        'Transfer receipt was incomplete or incorrect');

        const recipientSubstitution = await callDeduct(client, {
            userId: wallet.id,
            amount: 1,
            transactionType: 'diamond_gift_sent',
            source: 'wallet_transfer',
            metadata: { recipient_id: recipientB },
            referenceId: references.recipient,
        });
        invariant(recipientSubstitution?.success === false
            && recipientSubstitution.error === 'idempotency_conflict',
        'Transfer recipient substitution was accepted');

        const typeSubstitution = await callDeduct(client, {
            userId: wallet.id,
            amount: 5,
            transactionType: 'game_cost',
            referenceId: references.exact,
        });
        invariant(typeSubstitution?.success === false
            && typeSubstitution.error === 'idempotency_conflict',
        'Transaction type substitution was accepted');

        await client.query(`
            UPDATE public.profiles
               SET diamonds = 0, diamond_balance = 0
             WHERE id = $1
        `, [wallet.id]);

        const lateExactReplay = await callDeduct(client, {
            userId: wallet.id,
            amount: 5,
            transactionType: 'trivia_lifeline',
            referenceId: references.exact,
        });
        invariant(lateExactReplay?.success === true
            && lateExactReplay.idempotent === true
            && lateExactReplay.charged === 5
            && lateExactReplay.balance === 0,
        'Exact replay was not recoverable after a later balance change');

        const insufficient = await callDeduct(client, {
            userId: wallet.id,
            amount: 5,
            transactionType: 'trivia_lifeline',
            referenceId: references.insufficient,
        });
        invariant(insufficient?.success === false
            && insufficient.error === 'Insufficient diamonds'
            && insufficient.balance === 0,
        'New debit did not fail at an insufficient balance');

        const { rows: [inside] } = await client.query(`
            SELECT count(*)::integer AS rows
              FROM public.diamond_transactions
             WHERE reference_id = ANY($1::text[])
        `, [Object.values(references)]);
        invariant(inside.rows === 3, 'Unexpected rehearsal receipt count');

        if (!verifyLive) {
            await client.query(rollbackSql);
            const rolledBackFunction = await currentFunction(client);
            invariant(rolledBackFunction.source_md5 === preimage.source_md5,
                'Documented rollback does not restore the exact function source');
            const { rows: [txAfterRollback] } = await client.query(
                'SELECT txid_current()::text AS id',
            );
            invariant(txAfterRollback.id === txStart.id,
                'Documented rollback escaped the rollback-only outer transaction');
        }

        await client.query('ROLLBACK');

        const restored = await currentFunction(client);
        const { rows: [walletAfter] } = await client.query(`
            SELECT diamonds, diamond_balance
              FROM public.profiles
             WHERE id = $1
        `, [wallet.id]);
        const { rows: [persisted] } = await client.query(`
            SELECT count(*)::integer AS rows
              FROM public.diamond_transactions
             WHERE reference_id = ANY($1::text[])
        `, [Object.values(references)]);
        const { rows: [ledgerAfter] } = await client.query(
            'SELECT count(*)::bigint AS count FROM public.diamond_transactions',
        );

        invariant(restored.source_md5 === preimage.source_md5
            && restored.hardened === preimage.hardened,
            'Production function was not restored after rehearsal');
        invariant(walletAfter.diamonds === wallet.diamonds
            && walletAfter.diamond_balance === wallet.diamond_balance,
        'Rehearsal wallet changed after rollback');
        invariant(persisted.rows === 0 && ledgerAfter.count === ledgerRowsBefore,
            'Rehearsal ledger data persisted after rollback');

        process.stdout.write(`${JSON.stringify({
            success: true,
            mode: verifyLive ? 'post_deploy_verification' : 'rollback_only_migration_rehearsal',
            migrationCompiledInOneTransaction: !verifyLive,
            documentedRollbackCompiledInOneTransaction: !verifyLive,
            adversarialCases: 6,
            exactReplayAfterBalanceChange: true,
            persistentWalletChanges: 0,
            persistentLedgerRows: 0,
            productionFunctionRestored: true,
            preimageSourceMd5: preimage.source_md5,
        }, null, 2)}\n`);
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        await client.end().catch(() => {});
    }
}

main().catch((error) => {
    console.error(`Lifeline migration rehearsal failed: ${error?.message || error}`);
    process.exitCode = 1;
});
