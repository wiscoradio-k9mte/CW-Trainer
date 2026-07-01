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

function singleZoneRow(code) {
  const e = entityByCode.get(code);
  if (!e || e.deleted) return null;
  // Italy has cqZone=null, cqZones=[15,33]. Use cqZones[0] (mainland Italy = 15).
  const cqZone = e.cqZone ?? e.cqZones[0];
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
