/**
 * words-en-smoke.test.js
 *
 * TIER 2 — cheap smoke tests, run as part of normal npm test.
 *
 * These run on every CI build and must stay fast.  They do NOT redo the full
 * artifact validation (that's npm run validate:words — the tier-1 gate run
 * after data (re)generation).
 *
 * What they guard:
 *   a) The committed words_en.json parses and has the right shape.
 *   b) Tier sizes are exact (100 / 500 / 1k / 5k / 10k).
 *   c) Nesting holds: top100 is a strict prefix of top1k.
 *   d) Sentinel common words are in top100 ("the", "and", "you").
 *   e) Every word in top100 matches [a-z]+ (format sanity).
 */

// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const dataPath  = join(__dirname, '../../data/generated/words_en.json');

let artifact;
try {
  artifact = JSON.parse(readFileSync(dataPath, 'utf8'));
} catch {
  artifact = null;
}

// ---------------------------------------------------------------------------
// a) Bundle shape — parses without error
// ---------------------------------------------------------------------------
describe('words_en bundle smoke — shape', () => {
  it('words_en.json parses without error', () => {
    expect(artifact).not.toBeNull();
  });

  it('meta block is present with generatedAt, totalTokens, and wordListHash', () => {
    expect(typeof artifact?.meta?.generatedAt).toBe('string');
    expect(typeof artifact?.meta?.totalTokens).toBe('number');
    // wordListHash is the stable determinism reference (sha256 of tier content only)
    expect(artifact?.meta?.wordListHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// b) Tier sizes
// ---------------------------------------------------------------------------
describe('words_en bundle smoke — tier sizes', () => {
  it('top100.length === 100', () => {
    expect(artifact?.top100?.length).toBe(100);
  });

  it('top500.length === 500', () => {
    expect(artifact?.top500?.length).toBe(500);
  });

  it('top1k.length === 1000', () => {
    expect(artifact?.top1k?.length).toBe(1000);
  });

  it('top5k.length === 5000', () => {
    expect(artifact?.top5k?.length).toBe(5000);
  });

  it('top10k.length === 10000', () => {
    expect(artifact?.top10k?.length).toBe(10000);
  });
});

// ---------------------------------------------------------------------------
// c) Nesting: top100 must be the exact first 100 words of top1k
//    (checks nesting by construction — the generator uses ranked.slice(0, N))
// ---------------------------------------------------------------------------
describe('words_en bundle smoke — tier nesting', () => {
  it('top100 is a strict prefix of top1k (first 100 entries match)', () => {
    const t100 = artifact?.top100 ?? [];
    const t1k  = artifact?.top1k  ?? [];
    // Check all 100 entries, not just a sample — this is a fast in-memory comparison.
    for (let i = 0; i < t100.length; i++) {
      expect(t1k[i]).toBe(t100[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// d) Sentinel words — corpus-invariant top-frequency English words
// ---------------------------------------------------------------------------
describe('words_en bundle smoke — sentinel words in top100', () => {
  it('"the" is in top100', () => {
    expect(artifact?.top100).toContain('the');
  });

  it('"and" is in top100', () => {
    expect(artifact?.top100).toContain('and');
  });

  it('"you" is in top100', () => {
    expect(artifact?.top100).toContain('you');
  });
});

// ---------------------------------------------------------------------------
// e) Word format — spot-check top100 all match [a-z]+
// ---------------------------------------------------------------------------
describe('words_en bundle smoke — word format', () => {
  it('all words in top100 match /^[a-z]+$/', () => {
    const WORD_RE = /^[a-z]+$/;
    const bad = (artifact?.top100 ?? []).filter(w => !WORD_RE.test(w));
    expect(bad).toHaveLength(0);
  });
});
