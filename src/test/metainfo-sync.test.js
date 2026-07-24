/**
 * metainfo-sync.test.js
 *
 * TIER 2 — cheap consistency guard, run as part of normal npm test.
 *
 * WHY THIS EXISTS: the AppStream metainfo ships in TWO hand-maintained copies —
 *   build/…metainfo.xml   (bundled by electron-builder into the unpacked tree)
 *   snap/local/…metainfo.xml (bundled by snapcraft into the snap)
 * They must stay identical, and their newest <release> must match the app version.
 * These drifted before (one copy updated, the other stale) — a release defect that
 * no functional test could see because the files aren't imported by the app code.
 * This guard makes that drift fail CI instead of shipping.
 *
 * It is a pure artifact check (reads the files on disk); no product code involved.
 */

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(__dirname, '../..');
const BUILD_METAINFO = join(repoRoot, 'build/io.github.wiscoradio_k9mte.CWTrainer.metainfo.xml');
const SNAP_METAINFO = join(repoRoot, 'snap/local/io.github.wiscoradio_k9mte.CWTrainer.metainfo.xml');
const PKG = join(repoRoot, 'package.json');

const build = readFileSync(BUILD_METAINFO, 'utf8');
const snap = readFileSync(SNAP_METAINFO, 'utf8');
const pkgVersion = JSON.parse(readFileSync(PKG, 'utf8')).version;

// The newest release entry = the first <release version="X" …> in document order
// (AppStream convention: releases listed newest-first).
function newestReleaseVersion(xml) {
  const m = xml.match(/<release\s+version="([^"]+)"/);
  return m ? m[1] : null;
}

describe('metainfo drift guard — the two copies stay in sync', () => {
  it('build and snap metainfo files are byte-identical', () => {
    // If this fails: you edited one copy and not the other. Copy the intended
    // version over the other (they are meant to be a literal duplicate).
    expect(snap).toBe(build);
  });
});

describe('metainfo release-version guard — newest release matches the app version', () => {
  it('build metainfo newest <release> matches package.json version', () => {
    // If this fails: package.json was bumped without adding the matching
    // <release version="…"> block to the metainfo (a release-notes gap).
    expect(newestReleaseVersion(build)).toBe(pkgVersion);
  });

  it('snap metainfo newest <release> matches package.json version', () => {
    expect(newestReleaseVersion(snap)).toBe(pkgVersion);
  });
});
