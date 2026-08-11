/**
 * metainfo-sync.test.js
 *
 * TIER 2 — cheap consistency guard, run as part of normal npm test.
 *
 * WHY THIS EXISTS: the AppStream metainfo ships in TWO hand-maintained copies —
 *   build/…metainfo.xml   (bundled by electron-builder into the unpacked tree)
 *   snap/local/…metainfo.xml (bundled by snapcraft into the snap)
 * They must stay identical, and their newest <release> must document the release
 * line the app version belongs to. These drifted before (one copy updated, the
 * other stale) — a release defect that no functional test could see because the
 * files aren't imported by the app code. This guard makes that drift fail CI
 * instead of shipping.
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

// A build's RELEASE LINE: the X.Y.Z it belongs to, with any semver pre-release
// (`-edge.1`, `-rc.2`) or build-metadata (`+20260811`) suffix removed.
//
// WHY the two sides of the comparison are not symmetric — read this before
// "simplifying" it:
//   * a metainfo <release version="…"> names a RELEASE. AppStream release notes
//     describe what changed in 2.4.1; they do not describe one build of it.
//   * package.json's version identifies a BUILD. Most of the time that build IS
//     the release, so the two strings are equal and this function is a no-op.
//     A pre-release build (2.4.1-edge.1) is a build WITHIN the 2.4.1 line, and
//     it does not change which release the metainfo documents.
// So the PACKAGE version is reduced to its release line and the METAINFO version
// is compared verbatim. Stripping the metainfo side too would be a real
// weakening: it would let the metainfo ship `<release version="2.4.1-edge.1">`
// in a stable 2.4.1 build. The "newest <release> is bare" test below pins that.
function releaseLine(version) {
  return version.split(/[-+]/)[0];
}

describe('metainfo drift guard — the two copies stay in sync', () => {
  it('build and snap metainfo files are byte-identical', () => {
    // If this fails: you edited one copy and not the other. Copy the intended
    // version over the other (they are meant to be a literal duplicate).
    expect(snap).toBe(build);
  });
});

describe('metainfo release-version guard — newest release matches the app version', () => {
  it('build metainfo newest <release> matches the package.json release line', () => {
    // If this fails: package.json was bumped without adding the matching
    // <release version="…"> block to the metainfo (a release-notes gap).
    expect(newestReleaseVersion(build)).toBe(releaseLine(pkgVersion));
  });

  it('snap metainfo newest <release> matches the package.json release line', () => {
    expect(newestReleaseVersion(snap)).toBe(releaseLine(pkgVersion));
  });

  it('the newest <release> is a bare release version, never a pre-release build stamp', () => {
    // This is the half that keeps the one-sided strip above honest. Without it,
    // `releaseLine(pkg)` on the left could be matched by a metainfo that had
    // itself grown a suffix, and a stable build could ship release notes headed
    // `2.4.1-edge.1`. Asserted on BOTH copies (they are byte-identical, but say
    // it of each so a future divergence can't hide behind the other).
    expect(newestReleaseVersion(build)).toMatch(/^\d+\.\d+\.\d+$/);
    expect(newestReleaseVersion(snap)).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('releaseLine — the package version reduced to the release it belongs to', () => {
  it('leaves a plain release version untouched', () => {
    // The committed state of this repo is always a bare X.Y.Z, so this is the
    // case that runs in CI, in release.yml, and on every dev machine — and it
    // is why the contract change is a no-op for the drift this guard exists for.
    expect(releaseLine('2.4.1')).toBe('2.4.1');
    expect(releaseLine('10.0.0')).toBe('10.0.0');
  });

  it('strips a pre-release suffix (the shape release-edge.yml stamps)', () => {
    expect(releaseLine('2.4.1-edge.1')).toBe('2.4.1');
    expect(releaseLine('2.4.1-edge.12')).toBe('2.4.1');
    expect(releaseLine('2.5.0-rc.1')).toBe('2.5.0');
    expect(releaseLine('1.0.0-alpha-3')).toBe('1.0.0');
  });

  it('strips semver build metadata too', () => {
    expect(releaseLine('2.4.1+20260811')).toBe('2.4.1');
    expect(releaseLine('2.4.1-edge.1+deadbee')).toBe('2.4.1');
  });

  it('does NOT change the minor or patch numbers — a real bump still differs', () => {
    // The property that makes the guard still bite: two different release lines
    // must stay different after reduction.
    expect(releaseLine('2.4.1-edge.1')).not.toBe(releaseLine('2.4.0'));
    expect(releaseLine('2.5.0-edge.1')).not.toBe(releaseLine('2.4.1'));
  });
});
