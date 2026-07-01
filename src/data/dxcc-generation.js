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
    call:         row.prefix + suffix,
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
// NEEDS-SOURCING: POTA program prefixes and SOTA association codes may diverge
// from callsign prefixes (classic case: Germany callsign=DL, POTA ref="DE-…").
// Summit refs are plausible illustrative examples only — validate association
// and region codes against sota.org.uk/Associations/ and pota.app/programs
// before treating them as authoritative.
// ---------------------------------------------------------------------------
const FIELD_STATION_TABLE = [
  { prefix: 'DL',  entityPrefix: 'DL', entity: 'Fed. Rep. of Germany', continent: 'EU', cqZone: 14,
    potaPrefix: 'DE',  sotaSummits: ['DL/AL-001', 'DL/BY-001', 'DL/SAX-001'] },
  { prefix: 'G',   entityPrefix: 'G',  entity: 'England',              continent: 'EU', cqZone: 14,
    potaPrefix: 'G',   sotaSummits: ['G/LD-001', 'G/NP-001', 'G/CE-001'] },
  { prefix: 'F',   entityPrefix: 'F',  entity: 'France',               continent: 'EU', cqZone: 14,
    potaPrefix: 'F',   sotaSummits: ['F/AB-001', 'F/PE-001', 'F/CR-001'] },
  { prefix: 'VK2', entityPrefix: 'VK', entity: 'Australia',            continent: 'OC', cqZone: 30,
    potaPrefix: 'VK',  sotaSummits: ['VK1/AC-001', 'VK2/HU-001', 'VK3/VT-001'] },
  { prefix: 'JA',  entityPrefix: 'JA', entity: 'Japan',                continent: 'AS', cqZone: 25,
    potaPrefix: 'JA',  sotaSummits: ['JA/NN-001', 'JA/KN-001', 'JA/TO-001'] },
  { prefix: 'VE3', entityPrefix: 'VE', entity: 'Canada',               continent: 'NA', cqZone:  4,
    potaPrefix: 'VE',  sotaSummits: ['VE2/LR-001', 'VE3/CL-001', 'VE6/RM-001'] },
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
    call:         row.prefix + suffix,
    entity:       row.entity,
    continent:    row.continent,
    cqZone:       row.cqZone,
    entityPrefix: row.entityPrefix,
    potaRef:      `${row.potaPrefix}-${parkNum}`,
    sotaRef:      _rand(row.sotaSummits),
  };
}
