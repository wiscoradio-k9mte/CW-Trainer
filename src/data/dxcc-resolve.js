/**
 * dxcc-resolve.js
 *
 * Callsign → DXCC entity lookup.  Consumed by the app at runtime.
 * The bundled dataset is read once and cached; no network access ever occurs.
 *
 * API:
 *   resolveEntity(callsign)  → DxccEntity | null
 *   resolveZones(callsign, entity)  → { cqZone, ituZone } | null
 *   resolveUSState(stateAbbr) → { cq, itu } | null
 *
 * Multi-zone entities (US, Canada, Australia) have cqZone === null in the
 * entity record.  Use resolveZones() with the specific callsign (and, for the
 * US, you'll need state knowledge) to get the actual zone.
 */

import dataset from './dxcc_dataset.json';

// Only current entities are useful for on-air resolution
const CURRENT_ENTITIES = dataset.entities.filter(e => !e.deleted);

// Pre-compile all regexes once at module load (not per call)
// Why: this module is imported once; compiling 340 regexes at startup
// is cheaper than compiling one per resolveEntity call under load.
const COMPILED = CURRENT_ENTITIES.map(entity => ({
  entity,
  re: entity.prefixRegex ? new RegExp(entity.prefixRegex) : null,
}));

/**
 * Resolve a callsign string to its DXCC entity.
 * Returns the first matching entity, or null if unrecognised.
 *
 * Note on multi-zone entities: the returned entity has cqZone === null.
 * Call resolveZones() to get the zone for a specific call area.
 */
export function resolveEntity(callsign) {
  const call = String(callsign).toUpperCase().trim();
  for (const { entity, re } of COMPILED) {
    if (re && re.test(call)) return entity;
  }
  return null;
}

/**
 * For multi-zone entities, return the zone breakdown from multiZoneCallAreas.
 * Returns null if the entity is not in multiZoneCallAreas or zones are unambiguous.
 *
 * Usage example (US):
 *   const entity = resolveEntity('W9ABC');   // → United States
 *   const zones  = resolveZones('W9ABC', entity);  // → { cqZone: 4, ituZone: 7 }
 *   // W9 = Illinois district = CQ 4, ITU 8 actually — see US_STATE_ZONES for truth
 *
 * Current limitation: zone resolution for multi-zone entities requires external
 * state/province knowledge (the callsign area digit alone is not sufficient for
 * the US — you also need the operator's state of license).  This function is a
 * placeholder for the Phase 2 resolver.  The multiZoneCallAreas data is the
 * authoritative lookup table.
 */
export function resolveZones(callsign, entity) {
  if (!entity || !entity.multiZone) return null;

  const mz = dataset.multiZoneCallAreas;

  if (entity.entityCode === 291 && mz.UnitedStates) {
    // US: zone is set by state, not call-area digit; can't resolve from callsign alone
    return null;
  }

  if (entity.entityCode === 1 && mz.Canada) {
    // Canada: match call-area prefix (VE7, VO1, etc.)
    const call = String(callsign).toUpperCase().trim();
    for (const [area, z] of Object.entries(mz.Canada.callAreas)) {
      if (call.startsWith(area)) return { cqZone: z.cq, ituZone: null };
    }
  }

  if (entity.entityCode === 150 && mz.Australia) {
    const call = String(callsign).toUpperCase().trim();
    for (const [area, z] of Object.entries(mz.Australia.callAreas)) {
      if (call.startsWith(area)) return { cqZone: z.cq, ituZone: null };
    }
  }

  return null;
}

/**
 * For US stations: look up CQ and ITU zone by two-letter state abbreviation.
 * Returns { cq, itu } or null if state is unknown.
 */
export function resolveUSState(stateAbbr) {
  const s = String(stateAbbr).toUpperCase().trim();
  return dataset.multiZoneCallAreas.UnitedStates?.states?.[s] ?? null;
}

/** Expose the full entity list and multiZoneCallAreas for consumers that need them. */
export const allEntities = dataset.entities;
export const multiZoneCallAreas = dataset.multiZoneCallAreas;
