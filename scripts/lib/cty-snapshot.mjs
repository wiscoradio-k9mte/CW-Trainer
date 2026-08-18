/**
 * cty-snapshot.mjs
 *
 * Pure checksum verification for the vendored cty.csv pin
 * (scripts/vendor/cty.csv + scripts/vendor/cty.csv.meta.json).
 *
 * WHY THIS EXISTS: build-dxcc-dataset.mjs used to fetch cty.csv live from
 * country-files.com on every regen. That made the generator non-reproducible
 * (upstream can and does change the file, so the same command produced
 * different output on different days with no record of why) and made a
 * regen impossible without network access. The fix is to vendor a pinned
 * snapshot and gate every read of it behind this checksum check, so any
 * drift between the checked-in bytes and the recorded pin — an accidental
 * edit, file corruption, a stale meta.json after a hand-patch — is a loud,
 * named failure instead of a silent "whatever's on disk" read.
 *
 * No file I/O lives here on purpose: both the generator (which reads real
 * files) and its tests (which want fixture strings, not fixture files) call
 * these two functions with plain text they already hold.
 */

import { createHash } from 'node:crypto';

/** SHA-256 hex digest of a UTF-8 string. */
export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Compare vendored cty.csv text against its recorded pin.
 * Never throws — returns a result object so a CLI caller can decide how to
 * exit and a test can assert on the fields directly.
 *
 * @param {string} csvText        the vendored file's contents
 * @param {string} expectedSha256 the checksum recorded in cty.csv.meta.json
 * @returns {{ok:true, actual:string} | {ok:false, expected:string, actual:string}}
 */
export function verifyCtySnapshot(csvText, expectedSha256) {
  const actual = sha256Hex(csvText);
  if (actual === expectedSha256) {
    return { ok: true, actual };
  }
  return { ok: false, expected: expectedSha256, actual };
}
