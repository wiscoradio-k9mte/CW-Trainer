# DXCC Dataset — CW Trainer International/DX

## What this is

Bundled DXCC (DX Century Club) entity data for offline lookup by the CW Trainer app.
The app reads `dxcc_dataset.json` locally at runtime; it never fetches this data.

Generated: 2026-07-01T11:49:07.472Z
Source 1: AD1C country files — https://www.country-files.com/cty/cty.csv  (current entities, zones, prefixes)
Source 2: k0swe/dxcc-json (Apache-2.0, vendored) — deleted entities, flag, countryCode, prefixRegex baseline
Validated against: ARRL DXCC List January 2026 (340 current + 62 deleted = 402 total)

## Files

| File | Purpose |
|---|---|
| `dxcc_dataset.json` | **Primary bundle** — read by the app; includes entities[] + multiZoneCallAreas |
| `dxcc_entities.csv` | Flat-file mirror for inspection or import into a spreadsheet |
| `README.md` | This document |

The generator script is `scripts/build-dxcc-dataset.mjs` (maintainer/CI only).
Run `npm run build:dxcc` to regenerate.  Requires network access to country-files.com.
Run `npm run validate:dxcc` after regeneration for a thorough correctness check.

## Entity schema (one object per entity, 402 total)

```ts
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
```

## Callsign → entity lookup (consumer snippet)

This is the lookup algorithm the app's consumer module implements.
`resolveEntity` is in `src/data/dxcc-resolve.js`.

```js
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
```

## Test tiers

**Tier 1 — dataset validation** (`npm run validate:dxcc`):
Thorough checks run after (re)generation: entity counts, zone invariants, regex
round-trips for all current entities, sentinel checks, multiZoneCallAreas coverage.
Lives in `scripts/validate-dxcc.mjs`.  NOT part of the app's normal `npm test`.

**Tier 2 — app normal suite** (`npm test`):
Cheap smoke tests in `src/test/dxcc-bundle-smoke.test.js`:
bundle parses, entity count, multiZoneCallAreas present, consumer logic (4 sentinels).
Must stay fast; must NOT redo the full validation.

## multiZoneCallAreas

The `multiZoneCallAreas` top-level key in `dxcc_dataset.json` resolves
zone-by-subdivision for entities that span CQ/ITU zones.
Currently covers: United States (by state), Canada (by call area / province),
Australia (by call area / state).

## Changelog

| Date | Notes |
|---|---|
| 2026-07-01 | Initial generation from AD1C cty.csv + k0swe snapshot |
