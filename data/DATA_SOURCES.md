# Data sources — CW Trainer `/data` layer

Provenance table for all committed data artifacts.  Every artifact has a row:
where it came from, how it was produced, its license, and how to verify it
hasn't changed.

---

## `data/generated/words_en.json`

**Pack:** `words_en` (frequency-ranked English word list)
**Route:** GENERATED from public-domain corpus
**Generator:** `scripts/generate/build-words-en.mjs`
**Artifact:** `data/generated/words_en.json`
**Regenerate:** `npm run build:words` (requires network; fetches pinned PG texts)
**Validate:** `npm run validate:words` (run after every regeneration)
**Smoke test:** included in `npm test` (`src/test/words-en-smoke.test.js`)

### Determinism reference

The full artifact sha256 changes on re-run because `meta.generatedAt` varies.
Use `meta.wordListHash` — sha256 of the tier arrays only — as the stable
content reference.

| Field | Value |
|---|---|
| `meta.wordListHash` | `341a65788264ea3ba27ca5ff711c0c5adede39467046623330dfb86d1acf0944` |
| `meta.totalTokens` | 1,272,917 |
| `meta.uniqueWords` | 30,643 |
| Last generated | 2026-07-01 |

**To verify on re-run:**
```sh
npm run build:words
node -e "const a=JSON.parse(require('fs').readFileSync('data/generated/words_en.json'));
         console.log(a.meta.wordListHash);"
```
A matching hash confirms pinned inputs → same word ranking.
A mismatch means a Project Gutenberg source file changed upstream.

### Corpus — pinned Project Gutenberg texts

All texts are firmly public domain in the United States (published before 1925,
therefore no US copyright protection regardless of publication country).
The PG trademark header/footer boilerplate is stripped before counting, so the
PG license terms do not attach to the word list derived from the underlying texts.

| PG ID | Title | Author | Published | Genre | Input sha256 (raw UTF-8 download) |
|---|---|---|---|---|---|
| 1342 | Pride and Prejudice | Jane Austen | 1813 | social/romance | `74f2665d6e6925fc2c17dec644bec9e87df478a0f1836822125e8acbb3777806` |
| 74 | Adventures of Tom Sawyer | Mark Twain | 1876 | adventure/humor | `74d77384b123a6360db9ab58463cff8b38df8525fbdc6000c81ee388e1f3cf10` |
| 2701 | Moby Dick; or, The Whale | Herman Melville | 1851 | maritime/literary | `9a6844ac0703853720010787c7b6c70b0020f1ab1862dcd74452fa46474d1215` |
| 1661 | The Adventures of Sherlock Holmes | Arthur Conan Doyle | 1892 | mystery/detective | `922e2a12ccb43a4c9544c260b2166c6ad2097aeb5957faeee113f173bb857cd0` |
| 98 | A Tale of Two Cities | Charles Dickens | 1859 | historical fiction | `d54c2b80d40a40b982cd88852c6180bb944d95acdb028af3d0e01a1750681784` |
| 36 | The War of the Worlds | H.G. Wells | 1898 | science fiction | `8417469e3ab664749f7b36ebb85799075818207b0380b54c27d07d592a44117d` |
| 84 | Frankenstein; or, The Modern Prometheus | Mary Wollstonecraft Shelley | 1818 | horror/gothic | `7810cd483cffcf2cc8a1d8f0d5807931e69d4f48cd14149b8c76f88af82fead3` |
| 345 | Dracula | Bram Stoker | 1897 | horror | `96cd16eacdbfebae8fdda5591f66e0cc8ee76be18e0cd1aca02bc00615782d28` |
| 76 | Adventures of Huckleberry Finn | Mark Twain | 1884 | adventure/satire | `d617a37aa7ae1e1a93dcde2634db2bccb86824e31e29a55230bdbf77d6872d59` |
| 1400 | Great Expectations | Charles Dickens | 1861 | literary fiction | `9a637118af8e953e9764ec603d9b0a032883384d465acac2e27966a80cf1c6f8` |

**Source URLs:** `https://www.gutenberg.org/cache/epub/{ID}/pg{ID}.txt`
(pinned to the UTF-8 plain-text cache artifacts)

**Author/genre spread:**
8 distinct authors across 6 genre categories.  Social fiction, adventure,
maritime, mystery, historical fiction, science fiction, horror, satire — chosen
to prevent single-author vocabulary skew in the mid-frequency band.  The top
tiers (top100, top500) are corpus-invariant: the most frequent English words
appear in every sizable English corpus regardless of genre.

### License

The source texts are **public domain in the United States** (pre-1925
publication date; no copyright protection under US law).

The derived word list (`words_en.json`) is an **original compilation** by Wisco
Radio Labs — frequency counts and tier rankings are our work product.  Licensed
under **GPL-3.0-or-later**, compatible with the CW Trainer app license.

The Project Gutenberg trademark header/footer boilerplate is **stripped before
counting**, so no PG license terms attach to this derived list.  We are not
redistributing the PG texts themselves — only a frequency-ranked compilation
derived from them.

### Tier structure

```
top100 ⊂ top500 ⊂ top1k ⊂ top5k ⊂ top10k
```
Each tier is a strict superset (the smaller tier's words appear at the same
indices in every larger tier).  Words are lowercase `[a-z]+` only (no numbers,
apostrophes, or hyphens by default).

---

*This file is updated by the maintainer after each regeneration.  The
`words_en` pack is expected to be stable (re-generated only when the selection
of source texts changes or a text is updated upstream).  Check `meta.wordListHash`
against the value above after every regeneration.*
