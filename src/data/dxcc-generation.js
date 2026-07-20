/**
 * dxcc-generation.js
 *
 * DX station generation pool sourced from the bundled DXCC dataset.
 * Network is never used — this reads the same JSON the app ships with.
 *
 * "Curated common-current subset" criteria (per product brief):
 *   • EU majors, JA, VK/ZL, big SA, common AF, VE — current entities only.
 *   • Deleted entities are excluded.
 *   • Multi-zone entities (VK, VE) are expanded by call area so the zone in a
 *     generated record is coherent: VK2 → CQ 30, VK6 → CQ 29, VE7 → CQ 3.
 *   • Common EU majors (DL, G, F) and JA appear twice for coarse weighting.
 *     No propagation modeling — that's gold-plating for a drill tool.
 *
 * Pool entry shape:
 *   { prefix, entityPrefix, entity, continent, cqZone, ituZone, entityCode }
 *
 *   prefix       — the prefix used to generate a callsign ("VK2", "VE3", "DL").
 *   entityPrefix — the country-level prefix for reciprocal call formatting ("VK",
 *                  "VE", "DL"). Same as prefix for single-area entities.
 */

import { allEntities, multiZoneCallAreas } from './dxcc-resolve.js';

// ---------------------------------------------------------------------------
// Curated entity codes (sourced from dxcc_dataset.json — not invented)
// ---------------------------------------------------------------------------

// Single-representative entities: each has a single operational CQ zone.
// entityCode values verified against the bundled dataset.
const SINGLE_ZONE_CODES = [
  230, // Fed. Rep. of Germany (DL) — CQ 14 — EU major
  223, // England (G)               — CQ 14 — EU major
  227, // France (F)                — CQ 14 — EU major
  281, // Spain (EA)                — CQ 14
  248, // Italy (I)                 — CQ 15 (primary; also 33 for some islands)
  263, // Netherlands (PA)          — CQ 14
  209, // Belgium (ON)              — CQ 14
  284, // Sweden (SM)               — CQ 14
  224, // Finland (OH)              — CQ 15
  503, // Czech Republic (OK)       — CQ 15
  339, // Japan (JA)                — CQ 25 — common DX for US operators
  137, // South Korea (HL)          — CQ 25 — common Asian DX from US
   50, // Mexico (XE)               — CQ 6  — NA neighbor, easily worked on many bands
  318, // China (BY)                — see REPRESENTATIVE_CQ_ZONE override; east is CQ 24
  170, // New Zealand (ZL)          — CQ 32
  108, // Brazil (PY)               — CQ 11
  100, // Argentina (LU)            — CQ 13
  462, // South Africa (ZS)         — CQ 38
];

// These appear twice in the final pool — ~2× probability relative to the rest.
// EU majors and JA are the most commonly heard on 40 m CW from the US.
const WEIGHTED_CODES = [230, 223, 227, 339];

// ---------------------------------------------------------------------------
// Call-area numerals — the DOMAIN FACT that makes a generated call a REAL call.
//
// Every amateur callsign carries a "separating numeral" between its prefix
// letters and its suffix (F5KT, DL2ABC, JA1XYZ). An entity-level prefix
// (F, DL, JA…) with no numeral is an *impossible* callsign, so the generator
// must insert one. Which numerals are valid is COUNTRY-SPECIFIC — the ITU
// leaves the numeral to each administration's discretion (Article 19; "all ten
// digits 0-9 … at the discretion of national allocating bodies") and they use
// different subsets, tied to region or licence class. Two things this table
// must get right:
//
//   1. ENTITY COHERENCE (correctness-critical). Some parent-letter + numeral
//      combinations name a *different* DXCC entity. Those numerals are excluded
//      here — verified against the bundled DXCC dataset (AD1C country-files.com
//      / k0swe), the same source the app resolves calls with:
//        EA6 = Balearic Is. (21), EA8 = Canary Is. (29), EA9 = Ceuta & Melilla
//        (32)  →  Spain omits 6, 8, 9
//        OH0  = Åland Is. (5)                          →  Finland omits 0
//        ZL7/8/9 = Chatham/Kermadec/Subantarctic       →  New Zealand omits 7-9
//        ZS7 = Antarctica, ZS8 = Pr. Edward & Marion    →  South Africa omits 7, 8
//        PY0  = oceanic islands (PY0F/S/T)              →  Brazil omits 0
//      Generating one of those would be worse than a digit-less call — it would
//      teach a callsign whose numeral contradicts its own entity/zone.
//
//   2. REALISM. Where the numeral encodes GEOGRAPHY the set is the real call
//      districts; where it encodes LICENCE CLASS / era (no geographic meaning)
//      the set is the commonly-issued classes. Sources cited per entry.
//
// Region-coded sets (numeral = call district) are primary-sourced:
//   • Mexico   — Wikipedia "Call signs in Mexico" (IFT): XE1/XE2/XE3.
//   • Korea    — Wikipedia "Call signs in Korea" (KCC): 1-5 geographic
//                (0 = clubs, 8 = Antarctica HL8, 9 = USFK HL9 — omitted).
//   • S.Africa — Wikipedia "…call signs in Africa" (SARL callbook / ARRL):
//                ZS1-ZS6 provinces.
//   • China    — Wikipedia "Amateur radio licensing in China" (MIIT/CRAC):
//                eastern call areas 1-7 (CQ 24, matching this pool's zone-24
//                override; far-west 0/8/9 are CQ 23 and are omitted to keep the
//                generated zone coherent).
//   • Japan    — JARL: ten call areas JA0-JA9.
//   • Sweden   — SSA call districts SM0 (Stockholm) … SM7 (south).
//   • Finland  — SRAL districts OH1-OH9 (0 = Åland, omitted per above).
//   • Spain    — peninsular regions EA1-EA5, EA7 (6/8/9 omitted per above).
//   • Brazil   — call districts PY1-PY9 (0 = islands, omitted per above).
//   • NZ        — traditional areas ZL1-ZL4 (7-9 omitted per above).
//
// Licence-class / non-geographic sets (numeral = class or era, entity-coherent
// for every value — the region lives elsewhere in the call, so any of these
// numerals still names the parent entity). These reflect the commonly-issued
// classes rather than a single crisp per-numeral citation:
//   • Germany     (DL) — 1-9 individual (0 = club stations).
//   • England     (G)  — full-call classes G0/G1/G3/G4/G6/G7/G8 (the geographic
//                        distinction is the 2nd letter GM/GW/GI…, which this
//                        generator never emits — bare "G" is England only).
//   • France      (F)  — commonly-issued classes F1/F4/F5/F6/F8.
//   • Belgium     (ON) — full/individual classes ON4-ON7.
//   • Netherlands (PA) — classic individual series PA0-PA3.
//   • Czechia     (OK) — OK1 (Bohemia), OK2 (Moravia); 3 was Slovakia (now OM).
//   • Italy       (I)  — region numerals 0-9 (bare "I"+n is peninsular Italy /
//                        Sicily = entity 248; Sardinia uses IS/IM, not bare I).
//   • Argentina   (LU) — districts 1-9 (no LU numeral crosses to another entity).
//
// Keyed by ARRL entityCode (the pool's join key). Exported for tests that
// assert the entity-coherence exclusions declaratively.
export const CALL_AREA_DIGITS = {
  230: [1, 2, 3, 4, 5, 6, 7, 8, 9],          // Germany (DL) — class/era, 0 = clubs
  223: [0, 1, 3, 4, 6, 7, 8],                // England (G)  — full-call classes
  227: [1, 4, 5, 6, 8],                      // France (F)   — issued classes
  281: [1, 2, 3, 4, 5, 7],                   // Spain (EA)   — excl 6/8/9 (sep. entities)
  248: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],       // Italy (I)    — region numerals
  263: [0, 1, 2, 3],                         // Netherlands (PA) — classic series
  209: [4, 5, 6, 7],                         // Belgium (ON) — full/indiv classes
  284: [0, 1, 2, 3, 4, 5, 6, 7],             // Sweden (SM)  — districts 0-7
  224: [1, 2, 3, 4, 5, 6, 7, 8, 9],          // Finland (OH) — excl 0 = Åland (sep.)
  503: [1, 2],                               // Czechia (OK) — Bohemia/Moravia
  339: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],       // Japan (JA)   — 10 call areas
  137: [1, 2, 3, 4, 5],                      // Korea (HL)   — geographic 1-5
   50: [1, 2, 3],                            // Mexico (XE)  — XE1/XE2/XE3
  318: [1, 2, 3, 4, 5, 6, 7],                // China (BY)   — eastern areas (CQ 24)
  170: [1, 2, 3, 4],                         // New Zealand (ZL) — excl 7-9 (sep.)
  108: [1, 2, 3, 4, 5, 6, 7, 8, 9],          // Brazil (PY)  — excl 0 = islands (sep.)
  100: [1, 2, 3, 4, 5, 6, 7, 8, 9],          // Argentina (LU) — districts 1-9
  462: [1, 2, 3, 4, 5, 6],                   // South Africa (ZS) — provinces; excl 7/8 (sep.)
};

// Field-station table (randDxFieldStation) uses its own small country set;
// map its entity-level prefixes to the same call-area numerals as above.
const FIELD_CALL_AREA_DIGITS = {
  DL: CALL_AREA_DIGITS[230],
  G:  CALL_AREA_DIGITS[223],
  F:  CALL_AREA_DIGITS[227],
  JA: CALL_AREA_DIGITS[339],
};

// Multi-zone call areas to expand (only the active, commonly-heard areas)
// Australia: VK2/3/4 = CQ 30 (east coast); VK6 = CQ 29 (WA, a different zone)
const VK_AREAS = ['VK2', 'VK3', 'VK4', 'VK6'];
// Canada: most active provinces by licensed population
const VE_AREAS = ['VE1', 'VE2', 'VE3', 'VE7'];

// ---------------------------------------------------------------------------
// Pool builders
// ---------------------------------------------------------------------------

const entityByCode = new Map(allEntities.map(e => [e.entityCode, e]));

// Per-entity CQ zone overrides for cases where the dataset's first listed zone
// is not representative of typical on-air activity.
//
// China (318): dataset cqZones=[23,24]; zone 23 is sparse far-west (Xinjiang area);
// zone 24 (eastern China) is where nearly all BY traffic originates.
// This override is pinned in smoke tests so a dataset regen can't silently revert it.
const REPRESENTATIVE_CQ_ZONE = { 318: 24 };

function singleZoneRow(code) {
  const e = entityByCode.get(code);
  if (!e || e.deleted) return null;
  // Consult the override table first, then the dataset's single-zone field,
  // then the first of any multi-zone list (e.g. Italy: cqZones[0]=15 for mainland).
  const cqZone = REPRESENTATIVE_CQ_ZONE[code] ?? e.cqZone ?? e.cqZones[0];
  return {
    prefix:       e.primaryPrefix,
    entityPrefix: e.primaryPrefix,
    entity:       e.name,
    continent:    e.continent,
    cqZone,
    ituZone:      e.ituZone ?? null,
    entityCode:   e.entityCode,
    callAreaDigits: CALL_AREA_DIGITS[code] ?? null,
  };
}

// Expand a multi-zone entity into one row per call area.
// Zone is read from multiZoneCallAreas, not the entity-level default.
function callAreaRows(entityCode, callAreasKey, commonAreas) {
  const e = entityByCode.get(entityCode);
  if (!e || e.deleted) return [];
  const areas = multiZoneCallAreas[callAreasKey]?.callAreas ?? {};
  return Object.entries(areas)
    .filter(([area]) => commonAreas.includes(area))
    .map(([area, data]) => ({
      prefix:       area,
      entityPrefix: e.primaryPrefix,
      entity:       e.name,
      continent:    e.continent,
      cqZone:       data.cq,
      ituZone:      null,   // per-area ITU zones not in callAreas table
      entityCode:   e.entityCode,
      // Call-area prefixes (VK2, VE3) already carry their numeral, so no
      // separate call-area digit is inserted for these rows.
      callAreaDigits: null,
    }));
}

const baseRows     = SINGLE_ZONE_CODES.map(singleZoneRow).filter(Boolean);
const weightedRows = WEIGHTED_CODES.map(singleZoneRow).filter(Boolean);
const vkRows       = callAreaRows(150, 'Australia', VK_AREAS);
const veRows       = callAreaRows(1,   'Canada',    VE_AREAS);

/**
 * DX_GENERATION_POOL — the curated subset used by all DX drill generators.
 * Duplicates (WEIGHTED_CODES rows) appear at the END; that's intentional.
 * Pool is built at module load (once); it's a fixed static structure.
 */
export const DX_GENERATION_POOL = [
  ...baseRows,
  ...vkRows,
  ...veRows,
  ...weightedRows,   // intentional duplicates for coarse weighting
];

const _rand = arr => arr[Math.floor(Math.random() * arr.length)];

/**
 * withCallArea(prefix, digits, suffix) — build a full callsign body, inserting
 * a call-area numeral between an entity-level prefix and its letter suffix.
 *
 * A real amateur call always carries a separating numeral (F5KT, DL2ABC), so an
 * entity-level prefix ("F", "DL", "JA") must gain one. A prefix that already
 * ends in a digit ("VK2", "VE3") is itself a call-area prefix — its numeral is
 * already correct — so it is returned unchanged (byte-for-byte the old output).
 *
 * `digits` is the entity's valid call-area numeral set (see CALL_AREA_DIGITS);
 * one is drawn uniformly. If a caller supplies a digit-less prefix with no digit
 * set (only reachable via a hand-built custom pool in tests), the body is built
 * without a numeral rather than throwing — the internal pools always provide a
 * set, so real generation never hits that branch.
 */
export function withCallArea(prefix, digits, suffix) {
  if (/\d$/.test(prefix)) return prefix + suffix;   // already a call-area prefix
  const d = digits && digits.length ? _rand(digits) : '';
  return prefix + d + suffix;
}

/**
 * randDxStation(pool) — draw a random pool entry and produce a coherent
 * DX station record.  The generated call's zone always matches the specific
 * call area (VK2 → CQ 30, not the Australia entity default null).
 *
 * Returned fields:
 *   call         — generated callsign, e.g. "VK2ABC"
 *   prefix       — the call-area prefix used ("VK2")
 *   entityPrefix — country-level prefix for reciprocal format ("VK")
 *   entity, continent, cqZone, ituZone, entityCode
 */
export function randDxStation(pool = DX_GENERATION_POOL) {
  const row   = _rand(pool);
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Suffix weighted toward 2–3 letters — matches the distribution heard on the air.
  const sLen  = [1, 2, 2, 2, 3, 3][Math.floor(Math.random() * 6)];
  let suffix  = '';
  for (let i = 0; i < sLen; i++) suffix += ALPHA[Math.floor(Math.random() * 26)];
  return {
    call:         withCallArea(row.prefix, row.callAreaDigits, suffix),
    entity:       row.entity,
    continent:    row.continent,
    cqZone:       row.cqZone,
    ituZone:      row.ituZone ?? null,
    prefix:       row.prefix,
    entityPrefix: row.entityPrefix,
    entityCode:   row.entityCode,
  };
}

// ---------------------------------------------------------------------------
// Field station pool — used for P2P (POTA) and S2S (SOTA) contacts.
//
// SOURCED (2026-07-01):
//   POTA program prefixes are ISO 3166-1 alpha-2 country codes — POTA switched
//   from callsign-style prefixes to ISO country codes in early 2024 (e.g. K→US,
//   I→IT, DL→DE, G→GB, F→FR, VK→AU, JA→JP, VE→CA). potaPrefix values below
//   reflect the current program codes.
//
//   SOTA association codes verified against published SOTA conventions. Germany's
//   SOTA association is "DM" (Deutsche Mittelgebirge) — not the callsign "DL".
//   All other associations (G, F, VK-area, JA, VE-area) are the callsign prefix
//   as expected.
//
//   The specific summit region and number in sotaSummits are illustrative examples.
//   The trainer generates plausible-looking references for drill coherence; it is
//   NOT a live park or summit database. The invariant is country-coherence: the
//   park/summit country always matches the call prefix from the same row.
// ---------------------------------------------------------------------------
//   Entity-level prefixes (DL, G, F, JA) carry a call-area numeral via
//   `callAreaDigits`, same as DX_GENERATION_POOL; the VK2/VE3 rows already
//   carry theirs in the prefix (callAreaDigits null).
const FIELD_STATION_TABLE = [
  { prefix: 'DL',  entityPrefix: 'DL', entity: 'Fed. Rep. of Germany', continent: 'EU', cqZone: 14,
    potaPrefix: 'DE',  sotaSummits: ['DM/BW-001', 'DM/BM-001', 'DM/SX-001'], callAreaDigits: FIELD_CALL_AREA_DIGITS.DL },
  { prefix: 'G',   entityPrefix: 'G',  entity: 'England',              continent: 'EU', cqZone: 14,
    potaPrefix: 'GB',  sotaSummits: ['G/LD-001', 'G/NP-001', 'G/CE-001'], callAreaDigits: FIELD_CALL_AREA_DIGITS.G },
  { prefix: 'F',   entityPrefix: 'F',  entity: 'France',               continent: 'EU', cqZone: 14,
    potaPrefix: 'FR',  sotaSummits: ['F/AB-001', 'F/PE-001', 'F/CR-001'], callAreaDigits: FIELD_CALL_AREA_DIGITS.F },
  { prefix: 'VK2', entityPrefix: 'VK', entity: 'Australia',            continent: 'OC', cqZone: 30,
    potaPrefix: 'AU',  sotaSummits: ['VK1/AC-001', 'VK2/HU-001', 'VK3/VT-001'], callAreaDigits: null },
  { prefix: 'JA',  entityPrefix: 'JA', entity: 'Japan',                continent: 'AS', cqZone: 25,
    potaPrefix: 'JP',  sotaSummits: ['JA/NN-001', 'JA/KN-001', 'JA/TO-001'], callAreaDigits: FIELD_CALL_AREA_DIGITS.JA },
  { prefix: 'VE3', entityPrefix: 'VE', entity: 'Canada',               continent: 'NA', cqZone:  4,
    potaPrefix: 'CA',  sotaSummits: ['VE2/LR-001', 'VE3/CL-001', 'VE6/RM-001'], callAreaDigits: null },
];

/**
 * randDxFieldStation() — draw a DX field operator for P2P/S2S scenarios.
 *
 * Returns a station where call, entity, potaRef, and sotaRef all name the
 * same country — required so a P2P exchange reads coherently (the park ref
 * country matches the call prefix the trainee copies from the CQ).
 *
 * Returned fields:
 *   call        — generated callsign, e.g. "DL3AB"
 *   entity      — entity name string for summary display
 *   continent, cqZone, entityPrefix — from the curated table
 *   potaRef     — plausible POTA program ref, e.g. "DE-0745"
 *   sotaRef     — plausible SOTA summit ref, e.g. "DL/AL-001"
 */
export function randDxFieldStation() {
  const row  = _rand(FIELD_STATION_TABLE);
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // Suffix weighted 1-3 letters; field ops tend toward shorter calls.
  const sLen = [1, 2, 2, 3][Math.floor(Math.random() * 4)];
  let suffix = '';
  for (let i = 0; i < sLen; i++) suffix += ALPHA[Math.floor(Math.random() * 26)];
  const parkNum = String(1 + Math.floor(Math.random() * 9999)).padStart(4, '0');
  return {
    call:         withCallArea(row.prefix, row.callAreaDigits, suffix),
    entity:       row.entity,
    continent:    row.continent,
    cqZone:       row.cqZone,
    entityPrefix: row.entityPrefix,
    potaRef:      `${row.potaPrefix}-${parkNum}`,
    sotaRef:      _rand(row.sotaSummits),
  };
}
