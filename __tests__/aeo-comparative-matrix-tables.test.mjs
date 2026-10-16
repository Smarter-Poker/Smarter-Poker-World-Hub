import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('series/[id].js event table uses semantic caption and col scopes', async () => {
  const content = await fs.readFile('pages/hub/series/[id].js', 'utf8');

  assert.ok(content.includes('<table className="events-table" aria-label="Official Tournament Event Schedule">'), 'Must have accessible table tag');
  assert.ok(content.includes('<caption className="sr-only">'), 'Must contain accessible table caption');
  assert.ok(content.includes('<th scope="col"'), 'Must have th with col scope');
});

test('venues/[id].js amenities matrix table uses semantic caption and scopes', async () => {
  const content = await fs.readFile('pages/hub/venues/[id].js', 'utf8');

  assert.ok(content.includes('<table className="venue-amenities-table"'), 'Must contain venue amenities table');
  assert.ok(content.includes('<caption className="sr-only">'), 'Must contain accessible caption for amenities');
  assert.ok(content.includes('<th scope="col"'), 'Must have column header scope');
  assert.ok(content.includes('<th scope="row"'), 'Must have row header scope');
});

test('venues/[id].js daily tournaments matrix table uses semantic caption and scopes', async () => {
  const content = await fs.readFile('pages/hub/venues/[id].js', 'utf8');

  assert.ok(content.includes('<table className="daily-tournaments-matrix-table"'), 'Must contain daily tournaments matrix table');
  assert.ok(content.includes('<caption className="sr-only">'), 'Must contain accessible caption for daily tournaments');
  assert.ok(content.includes('<th scope="col"'), 'Must have column header scopes');
  assert.ok(content.includes('<th scope="row"'), 'Must have row header scopes');
});
