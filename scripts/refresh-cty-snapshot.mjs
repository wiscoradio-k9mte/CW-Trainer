#!/usr/bin/env node
/**
 * refresh-cty-snapshot.mjs
 *
 * MAINTAINER ONLY, NETWORK REQUIRED. This is the ONLY script in this repo
 * that fetches cty.csv live from country-files.com — build-dxcc-dataset.mjs
 * reads the vendored, checksum-pinned copy instead (see scripts/lib/
 * cty-snapshot.mjs), so a regen is reproducible and works offline.
 *
 * Run this only when you want to DELIBERATELY pull upstream's current
 * cty.csv and re-pin it:
 *   npm run refresh:cty-snapshot
 *   git diff scripts/vendor/cty.csv          # review what changed upstream
 *   npm run build:dxcc && npm run validate:dxcc
 *
 * It fetches, writes the new snapshot + its checksum together (never one
 * without the other — a stale pin against fresh bytes is exactly the
 * silent-drift failure this whole mechanism exists to prevent), and prints
 * the old vs new checksum so a no-op refresh (upstream unchanged) is obvious
 * without needing `git diff`.
 *
 * Licence: country-files.com publishes cty.csv under an MIT-style permissive
 * licence (country-files.com/copyright/, retrieved 2026-08-18) — full text
 * in scripts/vendor/CTY-LICENSE.txt. That file does not change on refresh.
 */

import https from 'node:https';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex } from './lib/cty-snapshot.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = join(__dirname, 'vendor');

const CTY_CSV_URL     = 'https://www.country-files.com/cty/cty.csv';
const SNAPSHOT_PATH   = join(VENDOR_DIR, 'cty.csv');
const META_PATH       = join(VENDOR_DIR, 'cty.csv.meta.json');

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

async function main() {
  const oldMeta = JSON.parse(readFileSync(META_PATH, 'utf8'));

  console.log(`Fetching ${CTY_CSV_URL} …`);
  let csvText;
  try {
    csvText = await fetchText(CTY_CSV_URL);
  } catch (err) {
    console.error('FATAL: could not fetch cty.csv:', err.message);
    console.error('The existing pin at scripts/vendor/cty.csv is untouched.');
    process.exit(1);
  }

  const newSha256 = sha256Hex(csvText);

  writeFileSync(SNAPSHOT_PATH, csvText, 'utf8');
  const newMeta = {
    ...oldMeta,
    retrievedAt: new Date().toISOString(),
    sha256: newSha256,
  };
  writeFileSync(META_PATH, JSON.stringify(newMeta, null, 2) + '\n', 'utf8');

  console.log(`Wrote ${SNAPSHOT_PATH}`);
  console.log(`  previous sha256: ${oldMeta.sha256}`);
  console.log(`  new sha256:      ${newSha256}`);
  if (newSha256 === oldMeta.sha256) {
    console.log('  (unchanged — upstream has not published new data since the last pin)');
  } else {
    console.log('  (CHANGED — review `git diff scripts/vendor/cty.csv`, then run');
    console.log('   npm run build:dxcc && npm run validate:dxcc before committing)');
  }
}

main();
