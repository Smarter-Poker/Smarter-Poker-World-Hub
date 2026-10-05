'use strict';

const fs = require('node:fs');
const { X509Certificate } = require('node:crypto');
const { Pool } = require('pg');

const SUPABASE_ROOT_2021_SHA256 = '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA';

function loadPinnedSupabaseRootCa(env = process.env) {
    const caPath = env.SUPABASE_DB_CA_CERT;
    if (!caPath) return null;
    try {
        const resolved = fs.realpathSync(caPath);
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) throw new Error('path is not a regular file');
        if ((stat.mode & 0o077) !== 0) throw new Error('file must have mode 0600');
        const ca = fs.readFileSync(resolved, 'utf8');
        const certificate = new X509Certificate(ca);
        if (certificate.fingerprint256.toUpperCase() !== SUPABASE_ROOT_2021_SHA256) {
            throw new Error(`unexpected SHA-256 fingerprint ${certificate.fingerprint256}`);
        }
        if (Date.parse(certificate.validTo) <= Date.now()) {
            throw new Error(`certificate expired ${certificate.validTo}`);
        }
        return ca;
    } catch (error) {
        throw new Error(`SUPABASE_DB_CA_CERT is not the pinned Supabase Root 2021 CA: ${error.message}`);
    }
}

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

    const ca = loadPinnedSupabaseRootCa();
    return new Pool({
        host: process.env.SUPABASE_DB_HOST || `db.${projectRef}.supabase.co`,
        port: Number(process.env.SUPABASE_DB_PORT || 5432),
        user: process.env.SUPABASE_DB_USER || 'postgres',
        password,
        database: process.env.SUPABASE_DB_NAME || 'postgres',
        // The DB password is an operator credential. Do not make a TLS
        // downgrade the default for a diagnostic connection.
        ssl: {
            rejectUnauthorized: true,
            ...(ca ? { ca } : {}),
        },
        max,
        connectionTimeoutMillis: 15_000,
        statement_timeout: statementTimeout,
        options: '-c default_transaction_read_only=on',
    });
}

module.exports = { createSolverOperatorPool, loadPinnedSupabaseRootCa };
