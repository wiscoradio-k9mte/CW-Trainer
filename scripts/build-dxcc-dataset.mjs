#!/usr/bin/env node
/**
 * build-dxcc-dataset.mjs
 *
 * MAINTAINER / CI ONLY — never imported by the app at runtime.
 * The app reads the bundled JSON from src/data/dxcc_dataset.json; this script
 * is how that artifact is (re)generated.  Run: npm run build:dxcc
 *
 * Sources:
 *   1. AD1C cty.csv  (fetched from country-files.com, authoritative for current
 *      340 entities: primaryPrefix, zones, continent, alias prefixes)
 *   2. scripts/vendor/k0swe-dxcc.json  (vendored Apache-2.0 snapshot from
 *      github.com/k0swe/dxcc-json; provides flag, countryCode, prefixRegex,
 *      and all 62 deleted entities not in cty.csv)
 *
 * Outputs (written to src/data/):
 *   dxcc_dataset.json  — primary bundle the app reads
 *   dxcc_entities.csv  — flat-file mirror for inspection
 *   README.md          — schema docs + consumer snippet
 */

import https from 'node:https';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const DATA_DIR   = join(ROOT, 'src', 'data');
const VENDOR_DIR = join(__dirname, 'vendor');

const CTY_CSV_URL     = 'https://www.country-files.com/cty/cty.csv';
const K0SWE_JSON_PATH = join(VENDOR_DIR, 'k0swe-dxcc.json');

// ---------------------------------------------------------------------------
// primaryPrefix overrides — applied after cty.csv is parsed.
// Cty.csv is usually right but diverges from conventional ham usage in a few
// cases (e.g. Cuba: cty lists CM; DX community uses CO far more often).
// The k0swe source uses alphabetical-first order so needs more overrides.
// Both sources need the Cuba fix; the rest verify cty.csv is already correct.
// Key: ARRL DXCC entityCode (int).  Value: the canonical display prefix.
// ---------------------------------------------------------------------------
const PRIMARY_PREFIX_OVERRIDES = {
  70: 'CO',   // Cuba — cty.csv says CM; contest/DX convention is CO
};

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/** Download a URL and resolve with the full text. */
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// cty.csv parser
// ---------------------------------------------------------------------------

/**
 * Parse a single cty.csv line and return a raw entity object.
 *
 * cty.csv format (9 comma-separated fields then a space-separated prefix list):
 *   PrimaryPrefix, Name, EntityCode, Continent, CQZone, ITUZone, Lat, Lon, GMT, PrefixList;
 *
 * Within PrefixList:
 *   PREFIX       — plain alias; inherits entity's default zone
 *   PREFIX(n)    — CQ zone override to n
 *   PREFIX[n]    — ITU zone override to n
 *   PREFIX(n)[m] — both overrides
 *   =CALL...     — exact callsign match (same zone annotation syntax applies)
 *
 * A leading '*' marks a WAE/CQ-only entity (IT9 Sicily, IG9 African Italy,
 * GM/s Shetlands, etc.).  These share entityCodes with real ARRL entities
 * (e.g. both Sicily AND Italy use entityCode 248).  We skip them here so they
 * don't overwrite the legitimate ARRL DXCC entry.  The ARRL DXCC list totals
 * 340 current; including WAE entities would corrupt both the count and the
 * entity records.
 */
function parseCtyCsvLine(line) {
  line = line.trim();
  if (!line) return null;

  // Skip WAE-only entities — they are NOT ARRL DXCC entities.
  if (line.startsWith('*')) return null;

  // Split into the 9 metadata fields + the prefix list (no commas inside list)
  const commaPos = [];
  for (let i = 0, count = 0; i < line.length && count < 9; i++) {
    if (line[i] === ',') { commaPos.push(i); count++; }
  }
  if (commaPos.length < 9) return null; // malformed line

  const metaPart   = line.slice(0, commaPos[8]);
  const prefixPart = line.slice(commaPos[8] + 1).replace(/;$/, '').trim();
  const [
    rawPrimaryPrefix, name, rawEntityCode, continent,
    rawCqZone, rawItuZone,
  ] = metaPart.split(',');

  const primaryPrefix = rawPrimaryPrefix.trim();
  const entityCode    = parseInt(rawEntityCode.trim(), 10);
  const defaultCq     = parseInt(rawCqZone.trim(), 10);
  const defaultItu    = parseInt(rawItuZone.trim(), 10);

  // Collect all CQ/ITU zones (entity defaults + any overrides in the prefix list)
  const cqZones  = new Set([defaultCq]);
  const ituZones = new Set([defaultItu]);

  // Collect alias prefixes (non-exact entries stripped of zone annotations)
  const prefixes = new Set();

  for (const token of prefixPart.split(/\s+/).filter(Boolean)) {
    const isExact = token.startsWith('=');
    const bare    = isExact ? token.slice(1) : token;

    const cqM  = bare.match(/\((\d+)\)/);
    const ituM = bare.match(/\[(\d+)\]/);
    if (cqM)  cqZones.add(parseInt(cqM[1], 10));
    if (ituM) ituZones.add(parseInt(ituM[1], 10));

    if (!isExact) {
      // Strip zone annotations and record the bare prefix
      const stripped = bare.replace(/\(\d+\)/, '').replace(/\[\d+\]/, '');
      prefixes.add(stripped);
    }
  }

  return {
    primaryPrefix,
    name: name.trim(),
    entityCode,
    continent: continent.trim(),
    cqZones:  [...cqZones].sort((a, b) => a - b),
    ituZones: [...ituZones].sort((a, b) => a - b),
    // Prefixes exclude exact-match callsigns; include the primaryPrefix itself.
    prefixes: [primaryPrefix, ...[...prefixes].filter(p => p !== primaryPrefix)],
  };
}

/** Parse the full cty.csv text into a map keyed by entityCode. */
function parseCty(csvText) {
  const entities = new Map();
  for (const line of csvText.split('\n')) {
    const e = parseCtyCsvLine(line);
    if (!e) continue;
    entities.set(e.entityCode, e);
  }
  return entities;
}

// ---------------------------------------------------------------------------
// Zone display formatting
// ---------------------------------------------------------------------------

/**
 * Return a human-readable zone string:
 *   [15]       → "15"
 *   [29, 30]   → "29–30"  (en-dash; contiguous range)
 *   [16,17,18,19,23] → "16, 17, 18, 19, 23"
 */
function zoneDisplay(zones) {
  if (zones.length === 1) return String(zones[0]);

  // Check for a fully contiguous range
  let contiguous = true;
  for (let i = 1; i < zones.length; i++) {
    if (zones[i] !== zones[i - 1] + 1) { contiguous = false; break; }
  }

  return contiguous
    ? `${zones[0]}–${zones[zones.length - 1]}`  // en-dash
    : zones.join(', ');
}

// ---------------------------------------------------------------------------
// Build the regex from a bare prefix list when k0swe doesn't have one (or
// when the k0swe regex is for the wrong call format — see DISAMBIG note).
// Anchored: ^(PREFIX1|PREFIX2|...)[A-Z0-9/]*$
// ---------------------------------------------------------------------------
function buildFallbackRegex(prefixes) {
  if (!prefixes.length) return '';
  const alts = prefixes.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return `^(${alts.join('|')})[A-Z0-9/]*$`;
}

/**
 * Is this primaryPrefix a cty.csv disambiguation notation?
 * Examples: FT/z, 3Y/b, FO/c — lowercase after slash is cty's way of
 * distinguishing co-prefix entities (FT/z = Amsterdam, FT/g = Glorioso etc.)
 * These are NOT real callsign prefixes; the actual prefixes are in the list.
 */
function isDisambigPrimary(primaryPrefix) {
  return /\/[a-z]/.test(primaryPrefix);
}

// ---------------------------------------------------------------------------
// Build one entity record in the final schema
// ---------------------------------------------------------------------------
function buildEntity(ctyEntry, k0sweEntry, overridePrimaryPrefix) {
  const primaryPrefix = overridePrimaryPrefix ?? ctyEntry.primaryPrefix;
  let { cqZones, ituZones, prefixes } = ctyEntry;

  // cty.csv may not encode every zone an entity spans — for example, Canada's
  // VE7 (British Columbia = CQ 3) has no explicit zone annotation in cty.csv
  // so zone 3 is absent from the parsed set.  Supplement from k0swe's zone
  // arrays, which are built from a broader set of sources.
  if (k0sweEntry) {
    const cqSet  = new Set(cqZones);
    const ituSet = new Set(ituZones);
    for (const z of k0sweEntry.cq  ?? []) cqSet.add(z);
    for (const z of k0sweEntry.itu ?? []) ituSet.add(z);
    cqZones  = [...cqSet].sort((a, b) => a - b);
    ituZones = [...ituSet].sort((a, b) => a - b);
  }

  const cqZone  = cqZones.length  === 1 ? cqZones[0]  : null;
  const ituZone = ituZones.length === 1 ? ituZones[0] : null;
  const multiZone = cqZones.length > 1 || ituZones.length > 1;

  // Regex selection:
  // - For disambiguation-notation primaries (FT/z, 3Y/b, …): k0swe's regex
  //   uses the portable-operation format (FT/ZA) which differs from the actual
  //   allocated prefix format in cty.csv (FT5ZA).  Build from cty.csv prefixes
  //   instead, excluding the disambiguation notation primary itself.
  // - For normal entities: use k0swe's pre-computed regex where available.
  // - Fall back to building from the prefix list (covers Spratly Islands 247).
  let prefixRegex;
  if (isDisambigPrimary(primaryPrefix)) {
    const realPrefixes = prefixes.filter(p => !isDisambigPrimary(p));
    // If the entity has real prefixes (e.g. FT0Z..FT8Z for Amsterdam), build
    // from those.  If it has only exact-match callsigns (e.g. Bouvet = 3Y/LB5SH),
    // fall back to k0swe's regex which at least covers the 3Y prefix.
    prefixRegex = realPrefixes.length
      ? buildFallbackRegex(realPrefixes)
      : (k0sweEntry?.prefixRegex ?? '');
  } else {
    prefixRegex = (k0sweEntry && k0sweEntry.prefixRegex)
      ? k0sweEntry.prefixRegex
      : buildFallbackRegex(prefixes);
  }

  return {
    entityCode:     ctyEntry.entityCode,
    name:           ctyEntry.name,
    primaryPrefix,
    prefixes,
    prefixRegex,
    continent:      ctyEntry.continent,
    continents:     [ctyEntry.continent],
    cqZone,
    cqZones,
    cqZoneDisplay:  zoneDisplay(cqZones),
    ituZone,
    ituZones,
    ituZoneDisplay: zoneDisplay(ituZones),
    multiZone,
    flag:           k0sweEntry?.flag        ?? '',
    countryCode:    k0sweEntry?.countryCode ?? '',
    deleted:        false,
  };
}

/** Build a deleted entity record from the k0swe source. */
function buildDeletedEntity(k0e) {
  const cqZones  = [...k0e.cq].sort((a, b) => a - b);
  const ituZones = [...k0e.itu].sort((a, b) => a - b);
  const cqZone   = cqZones.length  === 1 ? cqZones[0]  : null;
  const ituZone  = ituZones.length === 1 ? ituZones[0] : null;
  const continent = k0e.continent[0] ?? '';

  return {
    entityCode:     k0e.entityCode,
    name:           k0e.name,
    primaryPrefix:  k0e.prefix ? k0e.prefix.split(',')[0] : '',
    prefixes:       k0e.prefix ? k0e.prefix.split(',').map(s => s.trim()).filter(Boolean) : [],
    prefixRegex:    k0e.prefixRegex ?? '',
    continent,
    continents:     k0e.continent,
    cqZone,
    cqZones,
    cqZoneDisplay:  zoneDisplay(cqZones),
    ituZone,
    ituZones,
    ituZoneDisplay: zoneDisplay(ituZones),
    multiZone:      cqZones.length > 1 || ituZones.length > 1,
    flag:           k0e.flag        ?? '',
    countryCode:    k0e.countryCode ?? '',
    deleted:        true,
  };
}

// ---------------------------------------------------------------------------
// multiZoneCallAreas — hard-coded from authoritative CQ WW WAZ data.
// These resolve zone ambiguity for call areas within entities that span zones.
// The CQ zone facts are from cqww.com; the ITU boundaries follow the 110°W
// and 90°W meridians (some states straddle; value shown is predominant).
// ---------------------------------------------------------------------------

// CQ zone assignments by US state (lower 48 + DC).
// Source:  CQ WW WAZ rules.  "coastal W4" (FL GA SC NC VA) = CQ 5.
const US_STATE_ZONES = {
  // Pacific (CQ 3, ITU 6)
  AZ: { cq: 3, itu: 6 }, CA: { cq: 3, itu: 6 }, ID: { cq: 3, itu: 6 },
  NV: { cq: 3, itu: 6 }, OR: { cq: 3, itu: 6 }, UT: { cq: 3, itu: 6 },
  WA: { cq: 3, itu: 6 },
  // CQ 5 — W1 (New England)
  CT: { cq: 5, itu: 8 }, MA: { cq: 5, itu: 8 }, ME: { cq: 5, itu: 8 },
  NH: { cq: 5, itu: 8 }, RI: { cq: 5, itu: 8 }, VT: { cq: 5, itu: 8 },
  // CQ 5 — W2
  NJ: { cq: 5, itu: 8 }, NY: { cq: 5, itu: 8 },
  // CQ 5 — W3
  DC: { cq: 5, itu: 8 }, DE: { cq: 5, itu: 8 },
  MD: { cq: 5, itu: 8 }, PA: { cq: 5, itu: 8 },
  // CQ 5 — coastal W4 + WV
  FL: { cq: 5, itu: 8 }, GA: { cq: 5, itu: 8 }, NC: { cq: 5, itu: 8 },
  SC: { cq: 5, itu: 8 }, VA: { cq: 5, itu: 8 }, WV: { cq: 5, itu: 8 },
  // CQ 4 — everything else lower 48
  AL: { cq: 4, itu: 8 }, AR: { cq: 4, itu: 7 }, CO: { cq: 4, itu: 7 },
  IA: { cq: 4, itu: 7 }, IL: { cq: 4, itu: 8 }, IN: { cq: 4, itu: 8 },
  KS: { cq: 4, itu: 7 }, KY: { cq: 4, itu: 8 }, LA: { cq: 4, itu: 7 },
  MI: { cq: 4, itu: 8 }, MN: { cq: 4, itu: 7 }, MO: { cq: 4, itu: 7 },
  MS: { cq: 4, itu: 8 }, MT: { cq: 4, itu: 7 }, ND: { cq: 4, itu: 7 },
  NE: { cq: 4, itu: 7 }, NM: { cq: 4, itu: 7 }, OH: { cq: 4, itu: 8 },
  OK: { cq: 4, itu: 7 }, SD: { cq: 4, itu: 7 }, TN: { cq: 4, itu: 8 },
  TX: { cq: 4, itu: 7 }, WI: { cq: 4, itu: 7 }, WY: { cq: 4, itu: 7 },
};

const MULTI_ZONE_CALL_AREAS = {
  UnitedStates: {
    entityCode: 291,
    determinedBy: 'state',
    note: 'CQ 3/4/5 and ITU 6/7/8 set by state, not the call digit; ' +
          'ITU boundaries follow 110W and 90W meridians so some states ' +
          'straddle two ITU zones (value shown is predominant).',
    states: US_STATE_ZONES,
  },
  Canada: {
    entityCode: 1,
    determinedBy: 'call-area/province',
    note: 'VE2 is CQ 5 south of the 50th parallel / CQ 2 north; ' +
          'VY0 is CQ 1 west of 102W / CQ 2 east.',
    callAreas: {
      VE1: { province: 'Nova Scotia / New Brunswick (includes NB+NS)', cq: 5 },
      VE2: { province: 'Quebec',               cq: 5 },  // default (south of 50N)
      VE3: { province: 'Ontario',              cq: 4 },
      VE4: { province: 'Manitoba',             cq: 4 },
      VE5: { province: 'Saskatchewan',         cq: 4 },
      VE6: { province: 'Alberta',              cq: 4 },
      VE7: { province: 'British Columbia',     cq: 3 },
      VE8: { province: 'Northwest Territories',cq: 1 },
      VE9: { province: 'New Brunswick',        cq: 5 },
      VO1: { province: 'Newfoundland',         cq: 5 },
      VO2: { province: 'Labrador',             cq: 2 },
      VY0: { province: 'Nunavut',              cq: 1 },  // default (west of 102W)
      VY1: { province: 'Yukon',                cq: 1 },
      VY2: { province: 'Prince Edward Island', cq: 5 },
    },
  },
  Australia: {
    entityCode: 150,
    determinedBy: 'call-area/state',
    note: 'CQ 29 = Western Zone (VK6, VK8); CQ 30 = Eastern Zone (VK1-5, VK7).',
    callAreas: {
      VK1: { state: 'Australian Capital Territory', cq: 30 },
      VK2: { state: 'New South Wales',              cq: 30 },
      VK3: { state: 'Victoria',                     cq: 30 },
      VK4: { state: 'Queensland',                   cq: 30 },
      VK5: { state: 'South Australia',              cq: 30 },
      VK6: { state: 'Western Australia',            cq: 29 },
      VK7: { state: 'Tasmania',                     cq: 30 },
      VK8: { state: 'Northern Territory',           cq: 29 },
    },
  },
};

// ---------------------------------------------------------------------------
// CSV output helpers
// ---------------------------------------------------------------------------
const CSV_HEADER = [
  'entityCode','name','primaryPrefix','continent','cqZone','cqZones',
  'ituZone','ituZones','multiZone','flag','countryCode','deleted','prefixRegex',
].join(',');

function entityToCsvRow(e) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [
    e.entityCode, q(e.name), q(e.primaryPrefix), e.continent,
    e.cqZone ?? '', q(e.cqZones.join('|')),
    e.ituZone ?? '', q(e.ituZones.join('|')),
    e.multiZone, q(e.flag), e.countryCode, e.deleted, q(e.prefixRegex),
  ].join(',');
}

// ---------------------------------------------------------------------------
// README content
// ---------------------------------------------------------------------------
function buildReadme(meta) {
  return `# DXCC Dataset — CW Trainer International/DX

## What this is

Bundled DXCC (DX Century Club) entity data for offline lookup by the CW Trainer app.
The app reads \`dxcc_dataset.json\` locally at runtime; it never fetches this data.

Generated: ${meta.generatedAt}
Source 1: AD1C country files — ${CTY_CSV_URL}  (current entities, zones, prefixes)
Source 2: k0swe/dxcc-json (Apache-2.0, vendored) — deleted entities, flag, countryCode, prefixRegex baseline
Validated against: ARRL DXCC List January 2026 (340 current + 62 deleted = 402 total)

## Files

| File | Purpose |
|---|---|
| \`dxcc_dataset.json\` | **Primary bundle** — read by the app; includes entities[] + multiZoneCallAreas |
| \`dxcc_entities.csv\` | Flat-file mirror for inspection or import into a spreadsheet |
| \`README.md\` | This document |

The generator script is \`scripts/build-dxcc-dataset.mjs\` (maintainer/CI only).
Run \`npm run build:dxcc\` to regenerate.  Requires network access to country-files.com.
Run \`npm run validate:dxcc\` after regeneration for a thorough correctness check.

## Entity schema (one object per entity, 402 total)

\`\`\`ts
interface DxccEntity {
  entityCode:     number;    // ARRL DXCC number (unique id)
  name:           string;
  primaryPrefix:  string;    // Conventional display prefix (DL not DA, VE not CF, etc.)
  prefixes:       string[];  // All alias prefixes (non-exact; includes primaryPrefix)
  prefixRegex:    string;    // Anchored regex matching this entity's callsigns
  continent:      string;    // Two-letter code: NA SA EU AF AS OC AN
  continents:     string[];  // Same as [continent]; array for forward-compat
  cqZone:         number | null;  // null when the entity spans multiple CQ zones
  cqZones:        number[];       // Sorted; always ≥1 element
  cqZoneDisplay:  string;         // "15" | "29–30" (en-dash range) | "16, 17, 18"
  ituZone:        number | null;
  ituZones:       number[];
  ituZoneDisplay: string;
  multiZone:      boolean;   // true when cqZones.length > 1 OR ituZones.length > 1
  flag:           string;    // Emoji flag (empty string for some entities)
  countryCode:    string;    // ISO 3166-1 alpha-2 (empty string for non-sovereign entities)
  deleted:        boolean;   // true = removed from ARRL DXCC list
}
\`\`\`

## Callsign → entity lookup (consumer snippet)

This is the lookup algorithm the app's consumer module implements.
\`resolveEntity\` is in \`src/data/dxcc-resolve.js\`.

\`\`\`js
import dataset from './dxcc_dataset.json' assert { type: 'json' };

const CURRENT = dataset.entities.filter(e => !e.deleted);

/**
 * Resolve a callsign to its DXCC entity.  Returns the entity or null.
 * Prefix matching: iterate current entities, test against prefixRegex.
 * For multi-zone entities, pass the result to resolveZones() for the
 * actual zone — the entity record itself carries null for cqZone/ituZone.
 */
export function resolveEntity(callsign) {
  const call = callsign.toUpperCase().trim();
  for (const entity of CURRENT) {
    if (entity.prefixRegex && new RegExp(entity.prefixRegex).test(call)) {
      return entity;
    }
  }
  return null;
}
\`\`\`

## Test tiers

**Tier 1 — dataset validation** (\`npm run validate:dxcc\`):
Thorough checks run after (re)generation: entity counts, zone invariants, regex
round-trips for all current entities, sentinel checks, multiZoneCallAreas coverage.
Lives in \`scripts/validate-dxcc.mjs\`.  NOT part of the app's normal \`npm test\`.

**Tier 2 — app normal suite** (\`npm test\`):
Cheap smoke tests in \`src/test/dxcc-bundle-smoke.test.js\`:
bundle parses, entity count, multiZoneCallAreas present, consumer logic (4 sentinels).
Must stay fast; must NOT redo the full validation.

## multiZoneCallAreas

The \`multiZoneCallAreas\` top-level key in \`dxcc_dataset.json\` resolves
zone-by-subdivision for entities that span CQ/ITU zones.
Currently covers: United States (by state), Canada (by call area / province),
Australia (by call area / state).

## Changelog

| Date | Notes |
|---|---|
| ${meta.generatedAt.slice(0, 10)} | Initial generation from AD1C cty.csv + k0swe snapshot |
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  // 1. Fetch cty.csv
  console.log(`Fetching ${CTY_CSV_URL} …`);
  let csvText;
  try {
    csvText = await fetchText(CTY_CSV_URL);
  } catch (err) {
    console.error('FATAL: Could not fetch cty.csv:', err.message);
    console.error('The app must never ship data from the generator\'s memory.');
    console.error('Resolve network access and re-run.');
    process.exit(1);
  }
  console.log(`  → ${csvText.split('\n').filter(l => l.trim()).length} lines`);

  // 2. Load vendored k0swe data
  const k0sweRaw = JSON.parse(readFileSync(K0SWE_JSON_PATH, 'utf8'));
  const k0sweEntities = k0sweRaw.dxcc; // array of {entityCode, name, ...}

  // Build a lookup map from k0swe by entityCode
  const k0sweByCode = new Map(k0sweEntities.map(e => [e.entityCode, e]));

  // 3. Parse cty.csv → current entities
  const ctyMap = parseCty(csvText);
  console.log(`Parsed ${ctyMap.size} current entities from cty.csv`);

  // 4. Build current entity records
  const currentEntities = [];
  for (const [entityCode, ctyEntry] of ctyMap) {
    const k0e      = k0sweByCode.get(entityCode);
    const override = PRIMARY_PREFIX_OVERRIDES[entityCode];
    currentEntities.push(buildEntity(ctyEntry, k0e, override));
  }

  // 5. Collect deleted entities from k0swe (absent from cty.csv)
  const deletedEntities = [];
  for (const k0e of k0sweEntities) {
    if (k0e.deleted) {
      deletedEntities.push(buildDeletedEntity(k0e));
    }
  }

  // 6. Merge and sort: current first (by entityCode), then deleted
  const allEntities = [
    ...currentEntities.sort((a, b) => a.entityCode - b.entityCode),
    ...deletedEntities.sort((a, b) => a.entityCode - b.entityCode),
  ];

  const meta = {
    generatedAt: new Date().toISOString(),
    source1: CTY_CSV_URL,
    source2: 'github.com/k0swe/dxcc-json (Apache-2.0, vendored)',
    totalEntities: allEntities.length,
    currentCount: currentEntities.length,
    deletedCount: deletedEntities.length,
  };

  // 7. Build dataset JSON
  const dataset = { meta, entities: allEntities, multiZoneCallAreas: MULTI_ZONE_CALL_AREAS };
  const jsonPath = join(DATA_DIR, 'dxcc_dataset.json');
  writeFileSync(jsonPath, JSON.stringify(dataset, null, 2), 'utf8');
  console.log(`Wrote ${jsonPath}`);

  // 8. Build flat CSV
  const csvRows = [CSV_HEADER, ...allEntities.map(entityToCsvRow)];
  const csvPath = join(DATA_DIR, 'dxcc_entities.csv');
  writeFileSync(csvPath, csvRows.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${csvPath}`);

  // 9. Build README
  const readmePath = join(DATA_DIR, 'README.md');
  writeFileSync(readmePath, buildReadme(meta), 'utf8');
  console.log(`Wrote ${readmePath}`);

  console.log(`\nDone: ${currentEntities.length} current + ${deletedEntities.length} deleted = ${allEntities.length} total entities`);
  console.log('Run "npm run validate:dxcc" to verify the generated data.');
}

main().catch(err => { console.error(err); process.exit(1); });
