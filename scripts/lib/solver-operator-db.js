'use strict';

const { Pool } = require('pg');

/**
 * Open the operator-only connection used by offline warehouse inspections.
 *
 * The service_role JWT is deliberately not accepted here. A temporary
 * read-only grant exists solely for protected migration-first rollback
 * compatibility; operator diagnostics must still use this DB-owner path.
 * Keep this pool read-only even though the postgres password is an operator
 * credential, so a diagnostic script cannot accidentally become ingestion.
 */
function createSolverOperatorPool({ statementTimeout = 30_000, max = 2 } = {}) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const password = process.env.SUPABASE_DB_PASSWORD;
    if (!supabaseUrl || !password) {
        throw new Error(
            'Solver warehouse inspection requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD. '
            + 'Operator diagnostics must not use the service-role key for solved_spots_gold.',
        );
    }

    let projectRef;
    try {
        const parsedUrl = new URL(supabaseUrl);
        const match = parsedUrl.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
        if (parsedUrl.protocol !== 'https:' || !match) {
            throw new Error('unexpected Supabase URL origin');
        }
        projectRef = match[1];
    } catch {
        throw new Error(
            'NEXT_PUBLIC_SUPABASE_URL is invalid; expected an https://<project-ref>.supabase.co URL.',
        );
    }
    if (!projectRef) throw new Error('Could not determine the Supabase project reference.');

    return new Pool({
        host: process.env.SUPABASE_DB_HOST || `db.${projectRef}.supabase.co`,
        port: Number(process.env.SUPABASE_DB_PORT || 5432),
        user: process.env.SUPABASE_DB_USER || 'postgres',
        password,
        database: process.env.SUPABASE_DB_NAME || 'postgres',
        // The DB password is an operator credential. Do not make a TLS
        // downgrade the default for a diagnostic connection.
        ssl: { rejectUnauthorized: true },
        max,
        connectionTimeoutMillis: 15_000,
        statement_timeout: statementTimeout,
        options: '-c default_transaction_read_only=on',
    });
}

module.exports = { createSolverOperatorPool };
