/**
 * dxcc-bundle-smoke.test.js
 *
 * TIER 2 — cheap smoke tests, run as part of normal npm test.
 *
 * These tests run on every CI build and must stay fast.  They do NOT redo
 * the full dataset validation (that's npm run validate:dxcc, the tier-1 gate
 * run after data (re)generation).
 *
 * What they guard:
 *   a) The bundled dxcc_dataset.json parses and has the right shape.
 *   b) The consumer functions in dxcc-resolve.js (resolveEntity, resolveZones,
 *      resolveUSState) produce correct output for a small set of sentinels.
 *      This tests the SHIPPED CODE, not a re-implementation of its logic.
 *
 * Sentinels chosen to exercise different entity classes:
 *   K9MTE    → United States (multi-zone, prefix K)
 *   DL1ABC   → Germany (single-zone, two-letter prefix DL)
 *   VK3XYZ   → Australia (multi-zone, CQ 30)
 *   VE7ABC   → Canada, British Columbia (resolveZones → CQ 3; tests the VE7
 *              zone supplement — cty.csv misses this, k0swe fills it in)
 *   WI/CA/NY → US state zone lookup via resolveUSState
 */

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEntity, resolveZones, resolveUSState } from '../data/dxcc-resolve.js';

// Read the bundled JSON directly to test the artifact on disk (shape tests only)
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const datasetPath = join(__dirname, '../data/dxcc_dataset.json');

let dataset;
try {
  dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));
} catch {
  dataset = null;
}

// ---------------------------------------------------------------------------
// a) Bundle shape smoke — tests the artifact file itself
// ---------------------------------------------------------------------------
describe('DXCC bundle smoke — shape', () => {
  it('dxcc_dataset.json parses without error', () => {
    expect(dataset).not.toBeNull();
  });

  it('entities.length === 402', () => {
    expect(dataset?.entities?.length).toBe(402);
  });

  it('multiZoneCallAreas is present with UnitedStates + Canada + Australia keys', () => {
    expect(dataset?.multiZoneCallAreas?.UnitedStates).toBeDefined();
    expect(dataset?.multiZoneCallAreas?.Canada).toBeDefined();
    expect(dataset?.multiZoneCallAreas?.Australia).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// b) Consumer logic — resolveEntity (real shipped function, not a copy)
// ---------------------------------------------------------------------------
describe('DXCC consumer logic — resolveEntity sentinels', () => {
  it('K9MTE resolves to United States (entityCode 291)', () => {
    const e = resolveEntity('K9MTE');
    expect(e).not.toBeNull();
    expect(e.entityCode).toBe(291);
    expect(e.name).toBe('United States');
  });

  it('DL1ABC resolves to Germany (entityCode 230)', () => {
    const e = resolveEntity('DL1ABC');
    expect(e).not.toBeNull();
    expect(e.entityCode).toBe(230);
  });

  it('VK3XYZ resolves to Australia (entityCode 150)', () => {
    const e = resolveEntity('VK3XYZ');
    expect(e).not.toBeNull();
    expect(e.entityCode).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// c) Consumer logic — resolveZones
//
// VE7ABC → Canada, British Columbia.  cty.csv has no zone annotation for VE7
// (default is CQ 5); the generator supplements from k0swe giving CQ 3.
// resolveZones exercises the callAreas table that encodes that correction.
// ---------------------------------------------------------------------------
describe('DXCC consumer logic — resolveZones', () => {
  it('VE7ABC (British Columbia) resolves to CQ zone 3 via resolveZones', () => {
    const entity = resolveEntity('VE7ABC');
    expect(entity).not.toBeNull();
    expect(entity.entityCode).toBe(1); // Canada

    const zones = resolveZones('VE7ABC', entity);
    expect(zones).not.toBeNull();
    expect(zones.cqZone).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// d) Consumer logic — resolveUSState (real shipped function, not dataset read)
// ---------------------------------------------------------------------------
describe('DXCC consumer logic — resolveUSState', () => {
  it('Wisconsin (WI) → CQ 4, ITU 7', () => {
    const z = resolveUSState('WI');
    expect(z).not.toBeNull();
    expect(z.cq).toBe(4);
    expect(z.itu).toBe(7);
  });

  it('California (CA) → CQ 3, ITU 6', () => {
    const z = resolveUSState('CA');
    expect(z).not.toBeNull();
    expect(z.cq).toBe(3);
    expect(z.itu).toBe(6);
  });

  it('New York (NY) → CQ 5, ITU 8', () => {
    const z = resolveUSState('NY');
    expect(z).not.toBeNull();
    expect(z.cq).toBe(5);
    expect(z.itu).toBe(8);
  });
});
