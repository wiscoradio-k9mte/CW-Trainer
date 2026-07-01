#!/usr/bin/env node
/**
 * scripts/validate-words-en.mjs
 *
 * TIER 1 — thorough validation of data/generated/words_en.json.
 * Run after (re)generating the word list: npm run validate:words
 *
 * This is the CHANGE-TIME GATE: run it every time the artifact is regenerated.
 * It is deliberately NOT part of npm test (the normal CI build suite), which
 * would re-validate a large static artifact on every push.  The normal suite
 * has a cheap smoke test in src/test/words-en-smoke.test.js for CI regression.
 *
 * Checks performed:
 *   1.  Tier sizes match their names exactly (100 / 500 / 1k / 5k / 10k)
 *   2.  All tier arrays are present and are arrays
 *   3.  Every word in every tier matches /^[a-z]+$/  (no numbers, punctuation, caps)
 *   4.  No duplicates within any tier
 *   5.  Nesting: top100 ⊂ top500 ⊂ top1k ⊂ top5k ⊂ top10k (strict prefix check)
 *   6.  meta block present with required fields
 *   7.  meta.sources is a non-empty array with required per-source fields
 *   8.  Common sentinel words appear in top100 ("the", "and", "of")
 *   9.  Frequency ordering is consistent with nesting (first N of bigger tier = smaller tier)
 *  10.  Determinism documentation check (prints how to verify on re-run)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const DATA_PATH = join(ROOT, 'data', 'generated', 'words_en.json');

let artifact;
try {
  artifact = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
} catch (err) {
  console.error(`FATAL: could not read ${DATA_PATH}: ${err.message}`);
  console.error('Run "npm run build:words" to generate the artifact first.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Validation harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}${detail ? '  (' + detail + ')' : ''}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}${detail ? '  (' + detail + ')' : ''}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// 1. All tiers present and are arrays
// ---------------------------------------------------------------------------
console.log('\n--- 1. Tier presence ---');
const TIER_NAMES = ['top100', 'top500', 'top1k', 'top5k', 'top10k'];
for (const name of TIER_NAMES) {
  check(`${name} is an array`, Array.isArray(artifact[name]), `type: ${typeof artifact[name]}`);
}

// Guard: can't proceed with further checks if tiers are missing
if (failed > 0) {
  console.error('\nCannot continue — required tier arrays are missing.');
  process.exit(1);
}

const t100  = artifact.top100;
const t500  = artifact.top500;
const t1k   = artifact.top1k;
const t5k   = artifact.top5k;
const t10k  = artifact.top10k;

// ---------------------------------------------------------------------------
// 2. Tier sizes match their names exactly
// ---------------------------------------------------------------------------
console.log('\n--- 2. Tier sizes ---');
check('top100.length === 100',    t100.length  === 100,    `got ${t100.length}`);
check('top500.length === 500',    t500.length  === 500,    `got ${t500.length}`);
check('top1k.length === 1000',    t1k.length   === 1_000,  `got ${t1k.length}`);
check('top5k.length === 5000',    t5k.length   === 5_000,  `got ${t5k.length}`);
check('top10k.length === 10000',  t10k.length  === 10_000, `got ${t10k.length}`);

// ---------------------------------------------------------------------------
// 3. Every word matches /^[a-z]+$/ in every tier
//    We only need to check top10k — it is a superset of all other tiers.
// ---------------------------------------------------------------------------
console.log('\n--- 3. Word format ([a-z]+ only) ---');
const WORD_RE = /^[a-z]+$/;
const formatFails = t10k.filter(w => !WORD_RE.test(w));
check(
  'every word in top10k matches /^[a-z]+$/',
  formatFails.length === 0,
  formatFails.length ? `${formatFails.length} bad: ${formatFails.slice(0, 5).join(', ')}` : 'all pass',
);

// ---------------------------------------------------------------------------
// 4. No duplicates within any tier
//    Again, checking top10k covers all (if top10k has no dups, neither do its subsets).
// ---------------------------------------------------------------------------
console.log('\n--- 4. No duplicates ---');
const set10k = new Set(t10k);
check(
  'no duplicates in top10k',
  set10k.size === t10k.length,
  set10k.size === t10k.length ? 'none' : `${t10k.length - set10k.size} duplicate(s)`,
);

// ---------------------------------------------------------------------------
// 5. Nesting: top100 ⊂ top500 ⊂ top1k ⊂ top5k ⊂ top10k
//    Because the generator uses ranked.slice(0, N), each smaller tier is
//    exactly the first N elements of every larger tier.  We verify this:
//    for each pair (smaller, larger), smaller[i] === larger[i] for all i.
//    This is stronger than subset containment — it also verifies order.
// ---------------------------------------------------------------------------
console.log('\n--- 5. Tier nesting (strict prefix) ---');

function checkPrefix(smallerName, smaller, largerName, larger) {
  const mismatches = [];
  for (let i = 0; i < smaller.length; i++) {
    if (smaller[i] !== larger[i]) {
      mismatches.push(`[${i}]: ${smaller[i]} vs ${larger[i]}`);
    }
  }
  check(
    `${smallerName} is a strict prefix of ${largerName}`,
    mismatches.length === 0,
    mismatches.length ? `${mismatches.length} mismatch(es): ${mismatches.slice(0, 3).join('; ')}` : 'exact prefix',
  );
}

checkPrefix('top100', t100, 'top500',  t500);
checkPrefix('top500', t500, 'top1k',   t1k);
checkPrefix('top1k',  t1k,  'top5k',   t5k);
checkPrefix('top5k',  t5k,  'top10k',  t10k);

// ---------------------------------------------------------------------------
// 6. meta block — required fields
// ---------------------------------------------------------------------------
console.log('\n--- 6. meta block ---');
const { meta } = artifact;
check('meta is an object',             meta && typeof meta === 'object');
check('meta.generatedAt is a string',  typeof meta?.generatedAt === 'string');
check('meta.totalTokens is a number',  typeof meta?.totalTokens === 'number' && meta.totalTokens > 0,
  `got ${meta?.totalTokens}`);
check('meta.uniqueWords is a number',  typeof meta?.uniqueWords === 'number' && meta.uniqueWords >= 10_000,
  `got ${meta?.uniqueWords}`);
check('meta.uniqueWords >= 10000',     (meta?.uniqueWords ?? 0) >= 10_000,
  `got ${meta?.uniqueWords}`);

// ---------------------------------------------------------------------------
// 7. meta.sources — non-empty array with required per-source fields
// ---------------------------------------------------------------------------
console.log('\n--- 7. meta.sources ---');
const { sources } = meta ?? {};
check('meta.sources is a non-empty array',  Array.isArray(sources) && sources.length > 0,
  `length: ${sources?.length ?? 'N/A'}`);

if (Array.isArray(sources) && sources.length > 0) {
  const REQUIRED_SOURCE_FIELDS = ['pgId', 'title', 'author', 'year', 'url', 'inputSha256'];
  let sourceFails = [];
  for (const [i, s] of sources.entries()) {
    for (const field of REQUIRED_SOURCE_FIELDS) {
      if (!s[field] && s[field] !== 0) {
        sourceFails.push(`sources[${i}] missing "${field}"`);
      }
    }
  }
  check('all sources have required fields (pgId/title/author/year/url/inputSha256)',
    sourceFails.length === 0,
    sourceFails.length ? sourceFails.slice(0, 3).join('; ') : 'all present');

  // sha256 values look like hex strings of the right length
  const sha256Fails = sources.filter(s => !/^[0-9a-f]{64}$/.test(s.inputSha256 ?? ''));
  check('all source sha256 values are 64-char hex strings',
    sha256Fails.length === 0,
    sha256Fails.length ? `${sha256Fails.length} invalid` : 'all valid');

  check('at least 8 source texts (for vocabulary breadth)',
    sources.length >= 8, `got ${sources.length}`);
}

// ---------------------------------------------------------------------------
// 8. Common sentinel words in top100
//    These top-frequency words are corpus-invariant: they will appear in top100
//    in any sizable English corpus.  Their presence is a sanity check that the
//    tokeniser and frequency ranking ran correctly.
// ---------------------------------------------------------------------------
console.log('\n--- 8. Sentinel words in top100 ---');
const set100 = new Set(t100);
for (const word of ['the', 'and', 'of', 'to', 'a']) {
  check(`"${word}" is in top100`, set100.has(word));
}
// "you" should appear in top100 from dialogue-heavy fiction
check('"you" is in top100 (dialogue-heavy corpus expected)', set100.has('you'));

// ---------------------------------------------------------------------------
// 9. Additional corpus-quality checks
// ---------------------------------------------------------------------------
console.log('\n--- 9. Corpus quality ---');

// Ensure PG boilerplate words did NOT make it into top100.
// "gutenberg", "ebook", "trademark" would rank highly if stripping failed.
const pgNoise = ['gutenberg', 'ebook', 'trademark', 'electronically'].filter(w => set100.has(w));
check(
  'PG boilerplate words absent from top100 (stripping worked)',
  pgNoise.length === 0,
  pgNoise.length ? `found: ${pgNoise.join(', ')}` : 'none present',
);

// totalTokens sanity: 10 novels of average 80k words = ~800k tokens minimum.
check(
  'totalTokens >= 500000 (corpus large enough for stable ranking)',
  (meta?.totalTokens ?? 0) >= 500_000,
  `got ${meta?.totalTokens?.toLocaleString() ?? 'N/A'}`,
);

// uniqueWords should be well above 10k — any real English corpus has 30k+ unique [a-z] words.
check(
  'uniqueWords >= 20000 (healthy corpus vocabulary)',
  (meta?.uniqueWords ?? 0) >= 20_000,
  `got ${meta?.uniqueWords?.toLocaleString() ?? 'N/A'}`,
);

// ---------------------------------------------------------------------------
// 10. Determinism — wordListHash present and is a valid sha256
//
//     meta.wordListHash is sha256(JSON.stringify(tiers)) — it covers only the
//     word ranking data, not the timestamp, so it IS stable across re-runs as
//     long as the pinned source files are unchanged.  The full artifact sha256
//     varies on every re-run because meta.generatedAt changes.
//
//     To verify determinism after a re-run:
//       npm run build:words
//       node -e "const a=JSON.parse(require('fs').readFileSync('data/generated/words_en.json'));
//                console.log(a.meta.wordListHash);"
//     Compare the printed hash against the value in data/DATA_SOURCES.md.
//     A matching hash proves pinned inputs → same word ranking on re-run.
//     A mismatch means a PG source file changed upstream.
// ---------------------------------------------------------------------------
console.log('\n--- 10. Determinism ---');
const { wordListHash } = meta ?? {};
check(
  'meta.wordListHash is a 64-char hex sha256 string',
  typeof wordListHash === 'string' && /^[0-9a-f]{64}$/.test(wordListHash),
  wordListHash ? `${wordListHash.slice(0, 16)}…` : 'missing',
);
console.log('  INFO  To verify determinism after a re-run, compare meta.wordListHash');
console.log('        against the value in data/DATA_SOURCES.md.');
console.log('        (Full artifact sha256 varies due to meta.generatedAt timestamp.)');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n=== Validation complete: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  console.error(`${failed} check(s) failed — artifact is NOT ready to bundle.`);
  process.exit(1);
} else {
  console.log('All checks passed — artifact is ready to use.');
}
