#!/usr/bin/env node
/**
 * scripts/generate/build-words-en.mjs
 *
 * MAINTAINER / CI ONLY — never imported at runtime.
 *
 * Fetches a pinned set of Project Gutenberg public-domain texts, strips the PG
 * license header/footer boilerplate, tokenises to clean [a-z] words, ranks by
 * descending frequency, and emits data/generated/words_en.json with nested
 * frequency tiers (top100 ⊂ top500 ⊂ top1k ⊂ top5k ⊂ top10k).
 *
 * Run: npm run build:words
 * Optional flag: --keep-apostrophes  (keeps contractions as single tokens)
 *
 * DETERMINISM
 *   Pinned source URLs produce the same word ranking on every re-run as long
 *   as upstream PG files are unchanged.  Equal-frequency words are sorted
 *   alphabetically for reproducibility across platforms and Node versions.
 *   meta.wordListHash (sha256 of the tier arrays) is the stable reference;
 *   compare it against the value in data/DATA_SOURCES.md after each re-run.
 *   The full artifact sha256 varies on re-run because meta.generatedAt changes.
 *
 * FAIL-CLOSED
 *   Exits 1 if any source is unreachable or fewer than 10 000 unique [a-z]
 *   words are produced.  Never writes partial output.
 */

import https from 'node:https';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT     = join(__dirname, '../..');
const OUT_DIR  = join(ROOT, 'data', 'generated');
const OUT_FILE = join(OUT_DIR, 'words_en.json');

// ---------------------------------------------------------------------------
// Pinned corpus — Project Gutenberg public-domain texts.
//
// Selection criteria:
//   - All published before 1925; firmly public domain in the United States.
//   - URLs pin the UTF-8 plain-text cache artifact at gutenberg.org.
//   - Genre spread (literary, adventure, mystery, horror, sci-fi, romance,
//     satire) and author spread (8 distinct authors) prevents single-author
//     vocabulary skew in the mid-frequency band.
//   - Total corpus is ~1 M tokens — enough for a stable 10k frequency ranking.
//     (Top-100 words are corpus-invariant; the interesting CW ramp is top-1k.)
// ---------------------------------------------------------------------------
const CORPUS_TEXTS = [
  {
    id: 1342, title: 'Pride and Prejudice',
    author: 'Jane Austen', year: 1813, genre: 'social/romance',
    url: 'https://www.gutenberg.org/cache/epub/1342/pg1342.txt',
  },
  {
    id: 74, title: 'Adventures of Tom Sawyer',
    author: 'Mark Twain', year: 1876, genre: 'adventure/humor',
    url: 'https://www.gutenberg.org/cache/epub/74/pg74.txt',
  },
  {
    id: 2701, title: 'Moby Dick; or, The Whale',
    author: 'Herman Melville', year: 1851, genre: 'maritime/literary',
    url: 'https://www.gutenberg.org/cache/epub/2701/pg2701.txt',
  },
  {
    id: 1661, title: 'The Adventures of Sherlock Holmes',
    author: 'Arthur Conan Doyle', year: 1892, genre: 'mystery/detective',
    url: 'https://www.gutenberg.org/cache/epub/1661/pg1661.txt',
  },
  {
    id: 98, title: 'A Tale of Two Cities',
    author: 'Charles Dickens', year: 1859, genre: 'historical fiction',
    url: 'https://www.gutenberg.org/cache/epub/98/pg98.txt',
  },
  {
    id: 36, title: 'The War of the Worlds',
    author: 'H.G. Wells', year: 1898, genre: 'science fiction',
    url: 'https://www.gutenberg.org/cache/epub/36/pg36.txt',
  },
  {
    id: 84, title: 'Frankenstein; or, The Modern Prometheus',
    author: 'Mary Wollstonecraft Shelley', year: 1818, genre: 'horror/gothic',
    url: 'https://www.gutenberg.org/cache/epub/84/pg84.txt',
  },
  {
    id: 345, title: 'Dracula',
    author: 'Bram Stoker', year: 1897, genre: 'horror',
    url: 'https://www.gutenberg.org/cache/epub/345/pg345.txt',
  },
  {
    id: 76, title: 'Adventures of Huckleberry Finn',
    author: 'Mark Twain', year: 1884, genre: 'adventure/satire',
    url: 'https://www.gutenberg.org/cache/epub/76/pg76.txt',
  },
  {
    id: 1400, title: 'Great Expectations',
    author: 'Charles Dickens', year: 1861, genre: 'literary fiction',
    url: 'https://www.gutenberg.org/cache/epub/1400/pg1400.txt',
  },
];

// --keep-apostrophes: contractions kept as single tokens ("don't", "it's").
// Default: clean [a-z] sequences only — best for CW drill targets.
const keepApostrophes = process.argv.includes('--keep-apostrophes');

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

/** Download a URL and resolve with the full response text. */
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Follow a single redirect (PG sometimes redirects cache URLs)
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        res.resume();
        if (!loc) { reject(new Error(`Redirect from ${url} had no Location header`)); return; }
        resolve(fetchText(loc));
        return;
      }
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

// ---------------------------------------------------------------------------
// PG boilerplate stripper
// ---------------------------------------------------------------------------

/**
 * Strip Project Gutenberg header and footer boilerplate from a raw PG text.
 *
 * Why this matters: without stripping, "gutenberg", "ebook", "trademark",
 * and other PG license words pollute the frequency rankings.  The stripped
 * body is the actual literary text we want to count.
 *
 * PG standardised its markers around 2010; virtually all cache/epub/ files
 * use them.  Older files may lack them — in that case we warn and use the
 * full text rather than hard-failing (the literary content is still valid,
 * just with some boilerplate noise at the boundary).
 */
function stripPGBoilerplate(text, label) {
  // These markers delimit the body text in every modern PG UTF-8 cache file.
  const startRe = /\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i;
  const endRe   = /\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i;

  const startMatch = startRe.exec(text);
  const endMatch   = endRe.exec(text);

  if (!startMatch) console.warn(`  WARNING: no START marker in "${label}" — using full text`);
  if (!endMatch)   console.warn(`  WARNING: no END marker in "${label}" — using full text`);

  const bodyStart = startMatch ? startMatch.index + startMatch[0].length : 0;
  const bodyEnd   = endMatch   ? endMatch.index                          : text.length;

  return text.slice(bodyStart, bodyEnd);
}

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

/**
 * Extract words from a corpus body (lowercased first).
 *
 * Default ([a-z]+ only):
 *   "don't" → ["don", "t"],  "self-made" → ["self", "made"]
 * With --keep-apostrophes:
 *   "don't" → ["don't"],  "it's" → ["it's"]
 */
function tokenise(text) {
  const pattern = keepApostrophes ? /[a-z]+(?:'[a-z]+)*/g : /[a-z]+/g;
  return text.toLowerCase().match(pattern) ?? [];
}

// ---------------------------------------------------------------------------
// Frequency ranking
// ---------------------------------------------------------------------------

/** Count occurrences of each word across the whole corpus. */
function countFrequencies(words) {
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return freq;
}

/**
 * Return all words sorted by descending frequency.
 * Alphabetical tiebreak ensures byte-identical output on every re-run —
 * equal-frequency words would otherwise land in insertion order, which
 * varies by corpus ordering across Node versions.
 */
function rankByFrequency(freq) {
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);
}

// ---------------------------------------------------------------------------
// sha256 helper
// ---------------------------------------------------------------------------

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Fetch all sources before touching the output — ensures we never write
  //    a partial result (fail-closed on any network error).
  console.log(`Fetching ${CORPUS_TEXTS.length} pinned Project Gutenberg texts…`);
  const fetched = [];
  for (const src of CORPUS_TEXTS) {
    console.log(`  PG #${src.id}: ${src.title} — ${src.url}`);
    let text;
    try {
      text = await fetchText(src.url);
    } catch (err) {
      console.error(`\nFATAL: could not fetch PG #${src.id} (${src.title}): ${err.message}`);
      console.error('Fail-closed: no output written. Resolve network access and re-run.');
      process.exit(1);
    }
    const inputSha256 = sha256(text);
    console.log(`    → ${text.length.toLocaleString()} bytes  sha256: ${inputSha256.slice(0, 16)}…`);
    fetched.push({ ...src, rawText: text, inputSha256 });
  }

  // 2. Strip boilerplate and tokenise
  console.log('\nStripping PG boilerplate and tokenising…');
  const allWords = [];
  for (const src of fetched) {
    const body  = stripPGBoilerplate(src.rawText, `PG #${src.id}`);
    const words = tokenise(body);
    // Avoid spread-into-push (stack overflow on 100k+ element arrays).
    for (const w of words) allWords.push(w);
    console.log(`  PG #${src.id}: ${body.length.toLocaleString()} body chars, ${words.length.toLocaleString()} tokens`);
  }
  console.log(`Total tokens: ${allWords.length.toLocaleString()}`);

  // 3. Count and rank
  const freq    = countFrequencies(allWords);
  const ranked  = rankByFrequency(freq);
  const unique  = ranked.length;
  console.log(`Unique words: ${unique.toLocaleString()}`);

  if (unique < 10_000) {
    console.error(`\nFATAL: only ${unique} unique words — not enough to fill the top10k tier.`);
    console.error('Check that source texts fetched correctly and boilerplate was stripped.');
    process.exit(1);
  }

  // 4. Build nested frequency tiers.
  //    Each tier is ranked.slice(0, N) so the nesting property holds by construction:
  //    top100[0..99] === top500[0..99] === top1k[0..99] etc.
  const tiers = {
    top100: ranked.slice(0,     100),
    top500: ranked.slice(0,     500),
    top1k:  ranked.slice(0,   1_000),
    top5k:  ranked.slice(0,   5_000),
    top10k: ranked.slice(0,  10_000),
  };

  // 5. Assemble output
  //
  // wordListHash: sha256 of the serialised word tiers (no timestamps, no per-run
  // metadata).  This IS deterministic — pinned inputs → same frequencies → same
  // ranked order → same hash.  Use it to verify determinism on re-run:
  //   npm run build:words && node -e "
  //     const a = JSON.parse(require('fs').readFileSync('data/generated/words_en.json'));
  //     console.log(a.meta.wordListHash);
  //   "
  // Compare against the value recorded in data/DATA_SOURCES.md.
  // (The full artifact sha256 varies on re-run because meta.generatedAt changes.)
  const wordListHash = sha256(JSON.stringify({ ...tiers }));

  const meta = {
    generatedAt:    new Date().toISOString(),
    wordListHash,
    totalTokens:    allWords.length,
    uniqueWords:    unique,
    keepApostrophes,
    // Per-source sha256 of the raw fetched text; used to detect upstream drift on re-run.
    sources: fetched.map(s => ({
      pgId:        s.id,
      title:       s.title,
      author:      s.author,
      year:        s.year,
      url:         s.url,
      inputSha256: s.inputSha256,
    })),
  };

  const output = { meta, ...tiers };

  // 6. Write output (only here, after all processing succeeds)
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(output, null, 2) + '\n';
  writeFileSync(OUT_FILE, json, 'utf8');

  console.log(`\nWrote: ${OUT_FILE}`);
  console.log(`Word list hash (deterministic): ${wordListHash}`);
  console.log('Record meta.wordListHash in data/DATA_SOURCES.md if it changed.');
  console.log('(Full artifact sha256 varies on re-run due to generatedAt timestamp.)');
  console.log('\nRun "npm run validate:words" to verify the generated artifact.');
}

main().catch(err => { console.error(err); process.exit(1); });
