#!/usr/bin/env node
/**
 * Retired by Horse Brain Phase 3.
 *
 * This utility generated images labeled as GTO and hard-coded a 100 percent
 * action badge from a mutable answer key. It did not verify the
 * canonical policy, policy checksum, source classification, or mixed action
 * frequencies. Running it could therefore turn legacy cache text into a
 * solver claim that the database had never certified.
 *
 * Canonical Training UI now renders database-backed provenance and policy
 * distributions directly. A static image cannot remain truthful after policy
 * or source drift, so there is no supported replacement writer.
 */

console.error(
  'This Training GTO panel generator is permanently retired. ' +
  'It cannot turn mutable cache answer text into solver-branded assets.',
);
process.exitCode = 2;
