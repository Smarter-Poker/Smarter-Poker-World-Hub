import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20261006024310_stable_admin_phase11_incident_acknowledgements_canonical.sql', import.meta.url);
const migration = await readFile(migrationUrl, 'utf8');

test('C7 installs an append-only acknowledgement overlay with exact service grants', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.ca_operator_incident_ack_events/);
  assert.match(migration, /action IN \('acknowledge', 'release'\)/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /BEFORE TRUNCATE/);
  assert.match(migration, /REVOKE ALL ON public\.ca_operator_incident_ack_events FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT ON public\.ca_operator_incident_ack_events TO service_role/);
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = pg_catalog, public/);
});

test('C7 write is idempotent and validates the source without mutating it', () => {
  assert.match(migration, /operation_id uuid NOT NULL UNIQUE/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /'replayed', true/);
  assert.match(migration, /incident source row not found/);
  assert.doesNotMatch(migration, /UPDATE public\.(?:ca_drift_incidents|operational_alert_events|engine_alerts|deploy_alerts|financial_alerts)/i);
  assert.doesNotMatch(migration, /DELETE FROM public\.(?:ca_drift_incidents|operational_alert_events|engine_alerts|deploy_alerts|financial_alerts)/i);
});

test('incidents.ack is seeded only to operational ownership roles', () => {
  const seed = migration.slice(migration.indexOf("SELECT role_key, 'incidents.ack'"));
  for (const role of ['owner', 'god', 'superadmin', 'admin', 'operations', 'compliance']) {
    assert.match(seed, new RegExp(`\\('${role}'\\)`));
  }
  for (const role of ['finance', 'support', 'read_only']) assert.doesNotMatch(seed, new RegExp(`\\('${role}'\\)`));
  assert.match(migration, /permission = 'incidents\.ack'/);
});
