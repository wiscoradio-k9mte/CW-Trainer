/**
 * dxcc-cty-snapshot-pin.test.js
 *
 * TIER 2 — cheap, network-free, runs as part of normal npm test.
 *
 * WHY THIS EXISTS: scripts/build-dxcc-dataset.mjs used to fetch cty.csv live
 * from country-files.com on every regen, so the same command could produce
 * different output on different days with no record of why. The fix vendors
 * a pinned snapshot (scripts/vendor/cty.csv) and checksum-verifies it before
 * every regen (scripts/lib/cty-snapshot.mjs). This suite covers:
 *   a) the pure checksum-compare function (happy + mismatch, asserting the
 *      exact expected/actual values a caller would report — not just "it
 *      returned false");
 *   b) the REAL committed pin — scripts/vendor/cty.csv against the sha256
 *      recorded in scripts/vendor/cty.csv.meta.json — an anti-drift guard in
 *      the metainfo-sync.test.js idiom: if the vendored file and its pin
 *      ever drift apart (hand-edit, bad merge, stale meta.json), THIS test
 *      goes red, not a confusing failure three files downstream;
 *   c) the licence attribution file is present and carries the cited terms;
 *   d) the generator's actual FATAL behavior on a real mismatch — spawned as
 *      a subprocess against a throwaway fixture (never the real vendor
 *      files), asserting the real stderr text and exit code, which is what
 *      "make drift loud" cashes out to for a maintainer running the command.
 *
 * No network access anywhere in this file.
 */

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256Hex, verifyCtySnapshot } from '../../scripts/lib/cty-snapshot.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(__dirname, '../..');
const REAL_SNAPSHOT_PATH = join(REPO_ROOT, 'scripts/vendor/cty.csv');
const REAL_META_PATH = join(REPO_ROOT, 'scripts/vendor/cty.csv.meta.json');
const LICENSE_PATH = join(REPO_ROOT, 'scripts/vendor/CTY-LICENSE.txt');
const GENERATOR_PATH = join(REPO_ROOT, 'scripts/build-dxcc-dataset.mjs');

// ---------------------------------------------------------------------------
// a) verifyCtySnapshot — pure function, happy + mismatch
// ---------------------------------------------------------------------------
describe('verifyCtySnapshot — pure checksum compare', () => {
  it('reports ok:true when the checksum matches', () => {
    const text = 'PRIMARY,Name,1,EU,15,28,0,0,0,PRIMARY;\n';
    const result = verifyCtySnapshot(text, sha256Hex(text));
    expect(result).toEqual({ ok: true, actual: sha256Hex(text) });
  });

  it('reports the exact expected AND actual hash on mismatch — not just false', () => {
    const text = 'PRIMARY,Name,1,EU,15,28,0,0,0,PRIMARY;\n';
    const wrongPin = 'not-a-real-sha256-this-is-a-deliberately-wrong-pin';
    const result = verifyCtySnapshot(text, wrongPin);
    expect(result.ok).toBe(false);
    expect(result.expected).toBe(wrongPin);
    expect(result.actual).toBe(sha256Hex(text));
    // The whole point of "make drift loud" is that a maintainer can see BOTH
    // values, not just "it didn't match" — pin that shape here.
    expect(result.actual).not.toBe(result.expected);
  });

  it('is sensitive to a single-byte change (a real drift, not just any edit)', () => {
    const original = 'AA,Test Entity,1,EU,15,28,0,0,0,AA;\n';
    const drifted = 'AB,Test Entity,1,EU,15,28,0,0,0,AA;\n'; // one char changed
    const pinnedOnOriginal = sha256Hex(original);
    const result = verifyCtySnapshot(drifted, pinnedOnOriginal);
    expect(result.ok).toBe(false);
    expect(result.actual).not.toBe(pinnedOnOriginal);
  });
});

// ---------------------------------------------------------------------------
// b) The REAL committed pin stays honest (anti-drift guard on the artifact)
// ---------------------------------------------------------------------------
describe('the committed cty.csv snapshot matches its committed pin', () => {
  it('scripts/vendor/cty.csv checksum matches scripts/vendor/cty.csv.meta.json', () => {
    const csvText = readFileSync(REAL_SNAPSHOT_PATH, 'utf8');
    const meta = JSON.parse(readFileSync(REAL_META_PATH, 'utf8'));
    const result = verifyCtySnapshot(csvText, meta.sha256);
    // If this fails: cty.csv was hand-edited without updating its pin, OR the
    // pin was hand-edited without updating cty.csv. Re-run
    // `npm run refresh:cty-snapshot` to re-pin both together, or restore
    // whichever side drifted from git.
    expect(result.ok, `checksum mismatch: expected ${result.expected}, got ${result.actual}`).toBe(true);
  });

  it('the pin records a url, retrievedAt date, and licence pointer (not just a hash)', () => {
    const meta = JSON.parse(readFileSync(REAL_META_PATH, 'utf8'));
    expect(meta.url).toBe('https://www.country-files.com/cty/cty.csv');
    expect(meta.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(meta.license).toMatch(/CTY-LICENSE\.txt/);
  });
});

// ---------------------------------------------------------------------------
// c) Attribution accompanies the vendored data
// ---------------------------------------------------------------------------
describe('vendored cty.csv carries its required attribution', () => {
  it('CTY-LICENSE.txt exists and quotes the cited permissive-licence text', () => {
    const license = readFileSync(LICENSE_PATH, 'utf8');
    expect(license).toContain('country-files.com/copyright/');
    expect(license).toContain('Permission is hereby granted, free of charge');
    expect(license).toContain('distribute, sublicense');
  });
});

// ---------------------------------------------------------------------------
// d) The generator FATALs loudly on a real mismatch — subprocess, fixture only
// ---------------------------------------------------------------------------
describe('build-dxcc-dataset.mjs — drift-detection FATAL path (subprocess, fixture dir)', () => {
  it('exits non-zero and names expected vs actual on a checksum mismatch', () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'cty-drift-fixture-'));
    try {
      const csvText = 'AA,Test Entity,1,EU,15,28,0,0,0,AA;\n';
      const snapshotPath = join(fixtureDir, 'cty.csv');
      const metaPath = join(fixtureDir, 'cty.csv.meta.json');
      writeFileSync(snapshotPath, csvText, 'utf8');
      // Deliberately wrong pin — this is the drift under test.
      writeFileSync(
        metaPath,
        JSON.stringify({ url: 'https://example.invalid/cty.csv', retrievedAt: '2020-01-01T00:00:00.000Z', sha256: 'deadbeef00000000000000000000000000000000000000000000000000000' }),
        'utf8'
      );

      let threw = false;
      let stderr = '';
      let status = 0;
      try {
        execFileSync('node', [GENERATOR_PATH], {
          env: {
            ...process.env,
            CW_TRAINER_CTY_SNAPSHOT_PATH: snapshotPath,
            CW_TRAINER_CTY_META_PATH: metaPath,
            // Defense in depth: if the checksum check under test has a bug
            // and passes when it shouldn't, this keeps the write inside the
            // fixture dir instead of the real src/data — see the comment on
            // DATA_DIR in build-dxcc-dataset.mjs for why this matters.
            CW_TRAINER_DXCC_DATA_DIR: fixtureDir,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        threw = true;
        stderr = err.stderr ? err.stderr.toString('utf8') : '';
        status = err.status;
      }

      expect(threw).toBe(true);
      expect(status).toBe(1);
      // The legibility requirement: a maintainer reading this must see BOTH
      // the wrong pin and the real hash of what's on disk, not a stack trace.
      expect(stderr).toContain('FATAL');
      expect(stderr).toContain('checksum');
      expect(stderr).toContain('deadbeef00000000000000000000000000000000000000000000000000000');
      expect(stderr).toContain(sha256Hex(csvText));
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
