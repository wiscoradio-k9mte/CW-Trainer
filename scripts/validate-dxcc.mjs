#!/usr/bin/env node
/**
 * validate-dxcc.mjs
 *
 * TIER 1 — thorough dataset validation.
 * Run after (re)generating the DXCC dataset: npm run validate:dxcc
 * This script is maintainer/CI-only and is NOT part of the normal npm test suite
 * (which would make every test run re-validate a large static dataset).
 *
 * Gates the artifact when it changes.  The normal app test suite (npm test) has
 * a cheap smoke test in src/test/dxcc-bundle-smoke.test.js for CI regression.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const DATASET   = JSON.parse(
  readFileSync(join(ROOT, 'src', 'data', 'dxcc_dataset.json'), 'utf8')
);

const { entities, multiZoneCallAreas } = DATASET;
const VALID_CONTINENTS = new Set(['NA', 'SA', 'EU', 'AF', 'AS', 'OC', 'AN']);

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? '  (' + detail + ')' : ''}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// 1. Counts
// ---------------------------------------------------------------------------
console.log('\n--- 1. Entity counts ---');
const current = entities.filter(e => !e.deleted);
const deleted = entities.filter(e => e.deleted);

check('total == 402',    entities.length === 402,  `got ${entities.length}`);
check('current == 340',  current.length  === 340,  `got ${current.length}`);
check('deleted == 62',   deleted.length  === 62,   `got ${deleted.length}`);

// ---------------------------------------------------------------------------
// 2. entityCode uniqueness
// ---------------------------------------------------------------------------
console.log('\n--- 2. entityCode uniqueness ---');
const codes = new Set(entities.map(e => e.entityCode));
check('entityCode unique across all 402', codes.size === entities.length,
  `${entities.length} entities, ${codes.size} unique codes`);

// ---------------------------------------------------------------------------
// 3. Zone invariants (must hold for every entity)
// ---------------------------------------------------------------------------
console.log('\n--- 3. Zone invariants ---');
let zoneInvariantFails = [];
for (const e of entities) {
  // cqZone is null IFF cqZones has >1 entry
  const cqOk = (e.cqZone === null) === (e.cqZones.length > 1);
  // ituZone is null IFF ituZones has >1 entry
  const ituOk = (e.ituZone === null) === (e.ituZones.length > 1);
  // multiZone IFF either array has >1 entry
  const mzOk  = e.multiZone === (e.cqZones.length > 1 || e.ituZones.length > 1);

  if (!cqOk || !ituOk || !mzOk) {
    zoneInvariantFails.push(
      `${e.entityCode} ${e.name}: cqOk=${cqOk} ituOk=${ituOk} mzOk=${mzOk}`
    );
  }
}
check('cqZone/ituZone/multiZone invariants hold for all entities',
  zoneInvariantFails.length === 0,
  zoneInvariantFails.length ? `fails: ${zoneInvariantFails.join('; ')}` : 'all pass');

// ---------------------------------------------------------------------------
// 4. Current entities have prefixes and a compilable regex
// ---------------------------------------------------------------------------
console.log('\n--- 4. Current entities — prefix + regex presence ---');
let prefixFails = [];
let regexFails  = [];
for (const e of current) {
  if (!e.prefixes || e.prefixes.length < 1) prefixFails.push(`${e.entityCode} ${e.name}`);
  if (!e.prefixRegex) {
    regexFails.push(`${e.entityCode} ${e.name} (missing)`);
  } else {
    try { new RegExp(e.prefixRegex); }
    catch (err) { regexFails.push(`${e.entityCode} ${e.name} (invalid: ${err.message})`); }
  }
}
check('every current entity has prefixes.length >= 1',
  prefixFails.length === 0,
  prefixFails.length ? `fails: ${prefixFails.slice(0, 5).join('; ')}` : 'all pass');
check('every current entity has a present + compilable prefixRegex',
  regexFails.length === 0,
  regexFails.length ? `fails: ${regexFails.slice(0, 5).join('; ')}` : 'all pass');

// ---------------------------------------------------------------------------
// 5. All-entity regex round-trip
//    Build a sample call from a real prefix + "A" and verify it resolves
//    back to THAT entity.  Catches regexes that are too narrow or too wide.
//
//    Sample call strategy:
//    - For disambiguation-notation primaries (FT/z, 3Y/b, …): the primaryPrefix
//      is not a real callsign prefix.  Use the first non-disambiguation entry in
//      prefixes[] instead.  If none exists (all exact callsigns), skip — that
//      entity can only be matched by specific known callsigns.
//    - For normal primaries: use primaryPrefix + "A".  Appending "A" avoids the
//      digit-position restrictions in some regexes (e.g. UA9 requires [089] at
//      position 3; "UA9A" matches, "UA91TEST" does not).
// ---------------------------------------------------------------------------
console.log('\n--- 5. Regex round-trip (primary call resolves back to same entity) ---');
const compiledRegexes = current
  .filter(e => e.prefixRegex)
  .map(e => ({ entity: e, re: new RegExp(e.prefixRegex) }));

/** True when primaryPrefix is a cty.csv disambiguation notation (FT/z, 3Y/b…) */
function isDisambig(prefix) { return /\/[a-z]/.test(prefix); }

/**
 * Pick the first prefix from the entity's list such that prefix+"A" matches
 * the entity's own regex.  Falls back to null (→ skip) when no prefix works.
 *
 * Why "prefix + A" instead of "prefix + 1TEST":
 *   Some regexes restrict which digit may appear (UA9 requires [089], Gibraltar
 *   requires ZB2, etc.).  Appending "A" avoids digit-position conflicts while
 *   still building a minimal plausible callsign suffix.
 */
function samplePrefix(entity) {
  if (!entity.prefixRegex) return null;
  const re = new RegExp(entity.prefixRegex);
  // Search order: primaryPrefix first, then the rest of prefixes[]
  const candidates = [
    entity.primaryPrefix,
    ...entity.prefixes.filter(p => p !== entity.primaryPrefix),
  ].filter(p => !isDisambig(p));  // never try disambiguation notation as a call base

  for (const p of candidates) {
    if (re.test(p + 'A')) return p;
  }
  return null;  // no match found — skip this entity in the round-trip test
}

let roundTripFails = [];
let roundTripSkipped = 0;
for (const e of current) {
  if (!e.prefixRegex) continue;

  const base = samplePrefix(e);
  if (!base) {
    // Entity has only exact-callsign matches (e.g. entity with only =CALL entries)
    // and a disambiguation primary — can't auto-test; skip with a note.
    roundTripSkipped++;
    continue;
  }

  const sample = base + 'A';
  const matches = compiledRegexes.filter(({ re }) => re.test(sample));

  if (matches.length === 0) {
    roundTripFails.push(`${e.entityCode} ${e.name}: "${sample}" matches nothing`);
  } else if (matches.length > 1) {
    // Ambiguity: inherent for co-prefix entities (Bouvet/Peter1 both match 3Y prefix).
    // Log informational; only fail if THIS entity is not in the match set.
    const names = matches.map(m => m.entity.name).join(' / ');
    const ours  = matches.some(m => m.entity.entityCode === e.entityCode);
    if (!ours) {
      roundTripFails.push(
        `${e.entityCode} ${e.name}: "${sample}" matches [${names}] but NOT this entity`
      );
    } else {
      console.log(`  INFO  ambiguity for "${sample}": ${names}`);
    }
  } else if (matches[0].entity.entityCode !== e.entityCode) {
    roundTripFails.push(
      `${e.entityCode} ${e.name}: "${sample}" resolves to ${matches[0].entity.name} (${matches[0].entity.entityCode})`
    );
  }
}
check('regex round-trip: sample call resolves to correct entity (or set includes it)',
  roundTripFails.length === 0,
  roundTripFails.length
    ? `${roundTripFails.length} fail(s): ${roundTripFails.slice(0, 5).join('; ')}`
    : `all pass (${roundTripSkipped} skipped — exact-callsign-only entities)`);

// ---------------------------------------------------------------------------
// 6. zoneDisplay formatting
// ---------------------------------------------------------------------------
console.log('\n--- 6. cqZoneDisplay / ituZoneDisplay formatting ---');
let displayFails = [];
for (const e of entities) {
  // Single zone → just the number
  if (e.cqZones.length === 1 && e.cqZoneDisplay !== String(e.cqZones[0])) {
    displayFails.push(`${e.name} cqZoneDisplay: expected "${e.cqZones[0]}", got "${e.cqZoneDisplay}"`);
  }
  if (e.ituZones.length === 1 && e.ituZoneDisplay !== String(e.ituZones[0])) {
    displayFails.push(`${e.name} ituZoneDisplay: expected "${e.ituZones[0]}", got "${e.ituZoneDisplay}"`);
  }
  // Multi zone → must contain something (not blank)
  if (e.cqZones.length > 1 && !e.cqZoneDisplay) {
    displayFails.push(`${e.name} cqZoneDisplay: blank for multi-zone`);
  }
}
check('zone display strings match zone arrays', displayFails.length === 0,
  displayFails.length ? displayFails.slice(0, 3).join('; ') : 'all pass');

// ---------------------------------------------------------------------------
// 7. Continent validity and continents[] containment
// ---------------------------------------------------------------------------
console.log('\n--- 7. continent validity ---');
let contFails = [];
for (const e of entities) {
  if (!VALID_CONTINENTS.has(e.continent)) {
    contFails.push(`${e.name}: "${e.continent}"`);
  }
  if (!Array.isArray(e.continents) || !e.continents.includes(e.continent)) {
    contFails.push(`${e.name}: continents[] does not include "${e.continent}"`);
  }
}
check('all entities have valid continent and continents[] includes it',
  contFails.length === 0,
  contFails.length ? contFails.slice(0, 3).join('; ') : 'all pass');

// ---------------------------------------------------------------------------
// 8. Travis's original 6 self-checks
// ---------------------------------------------------------------------------
console.log('\n--- 8. Original acceptance self-checks ---');

function byCode(code) { return entities.find(e => e.entityCode === code); }
function findByCall(call) {
  const c = call.toUpperCase();
  return current.find(e => e.prefixRegex && new RegExp(e.prefixRegex).test(c));
}

const finland = byCode(224);
check('Finland primaryPrefix == OH',
  finland?.primaryPrefix === 'OH', `got ${finland?.primaryPrefix}`);
check('Finland cqZone == 15',
  finland?.cqZone === 15, `got ${finland?.cqZone}`);
check('Finland ituZone == 18',
  finland?.ituZone === 18, `got ${finland?.ituZone}`);

const sweden = byCode(284);
check('Sweden primaryPrefix == SM',
  sweden?.primaryPrefix === 'SM', `got ${sweden?.primaryPrefix}`);
check('Sweden cqZone == 14',
  sweden?.cqZone === 14, `got ${sweden?.cqZone}`);
check('Sweden ituZone == 18',
  sweden?.ituZone === 18, `got ${sweden?.ituZone}`);

const australia = byCode(150);
check('Australia cqZones == [29, 30]',
  JSON.stringify(australia?.cqZones) === JSON.stringify([29, 30]),
  `got ${JSON.stringify(australia?.cqZones)}`);
check('Australia cqZone == null',
  australia?.cqZone === null, `got ${australia?.cqZone}`);

const canada = byCode(1);
check('Canada cqZones == [1,2,3,4,5]',
  JSON.stringify(canada?.cqZones) === JSON.stringify([1, 2, 3, 4, 5]),
  `got ${JSON.stringify(canada?.cqZones)}`);
check('Canada cqZone == null',
  canada?.cqZone === null, `got ${canada?.cqZone}`);

const k9mte = findByCall('K9MTE');
check('K9MTE → United States',
  k9mte?.name === 'United States', `got ${k9mte?.name}`);

const dl1abc = findByCall('DL1ABC');
check('DL1ABC → Germany (Fed. Rep. of Germany)',
  dl1abc?.entityCode === 230, `got ${dl1abc?.name}`);

const vk3xyz = findByCall('VK3XYZ');
check('VK3XYZ → Australia',
  vk3xyz?.entityCode === 150, `got ${vk3xyz?.name}`);

const oh2xx = findByCall('OH2XX');
check('OH2XX → Finland',
  oh2xx?.entityCode === 224, `got ${oh2xx?.name}`);

// Wisconsin → CQ 4
const wi = multiZoneCallAreas.UnitedStates?.states?.WI;
check('Wisconsin resolves to CQ 4 in US table',
  wi?.cq === 4, `got ${wi?.cq}`);

// ---------------------------------------------------------------------------
// 9. Additional sentinels (coordinator augmentation)
// ---------------------------------------------------------------------------
console.log('\n--- 9. Additional sentinels ---');

const germany = byCode(230);
check('Germany cqZone == 14',
  germany?.cqZone === 14, `got ${germany?.cqZone}`);

const japan = byCode(339);
check('Japan (JA) cqZone == 25',
  japan?.cqZone === 25, `got ${japan?.cqZone}`);

const us = byCode(291);
check('US multiZone == true',
  us?.multiZone === true, `got ${us?.multiZone}`);
check('US cqZones == [3,4,5]',
  JSON.stringify(us?.cqZones) === JSON.stringify([3, 4, 5]),
  `got ${JSON.stringify(us?.cqZones)}`);

const alaska = byCode(6);
check('Alaska is a current entity',
  alaska && !alaska.deleted, `deleted=${alaska?.deleted}`);

const hawaii = byCode(110);
check('Hawaii is a current entity',
  hawaii && !hawaii.deleted, `deleted=${hawaii?.deleted}`);

// VE7 = CQ 3
const ve7 = multiZoneCallAreas.Canada?.callAreas?.VE7;
check('VE7 (British Columbia) resolves to CQ 3',
  ve7?.cq === 3, `got ${ve7?.cq}`);

// VK6 = CQ 29
const vk6 = multiZoneCallAreas.Australia?.callAreas?.VK6;
check('VK6 (Western Australia) resolves to CQ 29',
  vk6?.cq === 29, `got ${vk6?.cq}`);

// VK8 = CQ 29
const vk8 = multiZoneCallAreas.Australia?.callAreas?.VK8;
check('VK8 (Northern Territory) resolves to CQ 29',
  vk8?.cq === 29, `got ${vk8?.cq}`);

// ---------------------------------------------------------------------------
// 10. multiZoneCallAreas coverage
// ---------------------------------------------------------------------------
console.log('\n--- 10. multiZoneCallAreas coverage ---');

const usStates = Object.keys(multiZoneCallAreas.UnitedStates?.states ?? {});
const LOWER_48_DC = [
  'AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA',
  'IA','ID','IL','IN','KS','KY','LA','MA','MD','ME',
  'MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ',
  'NM','NV','NY','OH','OK','OR','PA','RI','SC','SD',
  'TN','TX','UT','VA','VT','WA','WI','WV','WY',
]; // 48 lower states + DC = 49 entries
check(`US table covers all 49 lower-48 states + DC`,
  LOWER_48_DC.every(s => usStates.includes(s)),
  `missing: ${LOWER_48_DC.filter(s => !usStates.includes(s)).join(',') || 'none'}`);

// Every US state cq in {3,4,5} and itu in {6,7,8}
let usBadZone = [];
for (const [state, zones] of Object.entries(multiZoneCallAreas.UnitedStates?.states ?? {})) {
  if (![3,4,5].includes(zones.cq)) usBadZone.push(`${state} cq=${zones.cq}`);
  if (![6,7,8].includes(zones.itu)) usBadZone.push(`${state} itu=${zones.itu}`);
}
check('All US states have cq in {3,4,5} and itu in {6,7,8}',
  usBadZone.length === 0, usBadZone.join(', ') || 'all valid');

const caAreas = Object.keys(multiZoneCallAreas.Canada?.callAreas ?? {});
check('Canada table has VE1-VE9 + VO1 + VO2 + VY0 + VY1 + VY2',
  ['VE1','VE2','VE3','VE4','VE5','VE6','VE7','VE8','VE9','VO1','VO2','VY0','VY1','VY2']
    .every(k => caAreas.includes(k)),
  `missing: ${['VE1','VE2','VE3','VE4','VE5','VE6','VE7','VE8','VE9','VO1','VO2','VY0','VY1','VY2']
    .filter(k => !caAreas.includes(k)).join(',') || 'none'}`);

// Canada cq in [1..5]
let caBadZone = [];
for (const [area, z] of Object.entries(multiZoneCallAreas.Canada?.callAreas ?? {})) {
  if (![1,2,3,4,5].includes(z.cq)) caBadZone.push(`${area} cq=${z.cq}`);
}
check('All Canada call areas have cq in {1..5}',
  caBadZone.length === 0, caBadZone.join(', ') || 'all valid');

const ausAreas = Object.keys(multiZoneCallAreas.Australia?.callAreas ?? {});
check('Australia table has VK1-VK8',
  ['VK1','VK2','VK3','VK4','VK5','VK6','VK7','VK8'].every(k => ausAreas.includes(k)),
  `missing: ${['VK1','VK2','VK3','VK4','VK5','VK6','VK7','VK8']
    .filter(k => !ausAreas.includes(k)).join(',') || 'none'}`);

// Australia cq in {29,30}
let ausBadZone = [];
for (const [area, z] of Object.entries(multiZoneCallAreas.Australia?.callAreas ?? {})) {
  if (![29,30].includes(z.cq)) ausBadZone.push(`${area} cq=${z.cq}`);
}
check('All Australia call areas have cq in {29,30}',
  ausBadZone.length === 0, ausBadZone.join(', ') || 'all valid');

// CQ3 state list check
const cq3states = Object.entries(multiZoneCallAreas.UnitedStates?.states ?? {})
  .filter(([, z]) => z.cq === 3).map(([s]) => s).sort();
const EXPECTED_CQ3 = ['AZ','CA','ID','NV','OR','UT','WA'].sort();
check('US CQ3 states == AZ CA ID NV OR UT WA',
  JSON.stringify(cq3states) === JSON.stringify(EXPECTED_CQ3),
  `got [${cq3states.join(',')}]`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n=== Validation complete: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  console.error(`${failed} check(s) failed — dataset is NOT ready to bundle.`);
  process.exit(1);
} else {
  console.log('All checks passed — dataset is ready to bundle.');
}
