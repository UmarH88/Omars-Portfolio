/*
  fetch-quran.mjs: downloads Quran data from the Quran Foundation API
  and saves it as JSON in src/data, so the site never calls the API.

  Run:
    npm run fetch:quran                    all surahs (skips ones already saved in the current format)
    npm run fetch:quran -- --only=1,2      just these surahs
    npm run fetch:quran -- --force         download again even if saved
  Source: QF_ENV in .env = "public" (default, Quran.com open API, no keys),
          "prelive" or "production" (keyed API: QF_CLIENT_ID, QF_CLIENT_SECRET)

  Saves:
    src/data/chapters.json          the list of surahs
    src/data/surahs/001.json ...    verses, words, meanings, translation
*/
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// Load .env BEFORE importing the API module, because it reads the settings on load.
// The public API needs no keys, so a missing .env is fine.
try {
  process.loadEnvFile('.env');
} catch {
  console.log('No .env file: using the public API.');
}
const { apiGet, environmentName } = await import('./lib/qf-api.mjs');
const { writeJsonSafely } = await import('./lib/write-json.mjs');

const CHAPTERS_FILE = 'src/data/chapters.json';
const SURAHS_DIR = 'src/data/surahs';
const SURAH_COUNT = 114;
const VERSES_PER_REQUEST = 50; // the API's maximum

// Bump this when the saved format changes, so old files get downloaded again.
// 2 = words have their mushaf page and line
// 3 = page/line from mushaf layout 1 (the API's default layout puts a few verses one page too late, e.g. 80:41)
// 4 = positions from a separate request without word_fields (see addPositions)
const FORMAT_VERSION = 4;
const MUSHAF_LAYOUT = 1; // the 15-line Madani mushaf, 604 pages

/*
  Languages on the site: a translation + word-by-word meanings for each.
  Ids and names checked against /resources/translations.
  To add a language: add one line here, then run with --force.
*/
const LANGUAGES = [
  { lang: 'en', translationId: 20, name: 'Saheeh International' },
  { lang: 'id', translationId: 33, name: 'Kementerian Agama RI (Indonesian Ministry of Religious Affairs)' },
];
const [MAIN_LANGUAGE, ...OTHER_LANGUAGES] = LANGUAGES;

// ---------- Chapters ----------

/*
  Keep only the fields the site uses, with clear camelCase names.
  Checks every field: if the API ever changes shape, we stop with a clear
  error instead of saving broken data.
*/
function toChapter(raw) {
  const chapter = {
    id: raw.id,
    nameSimple: raw.name_simple, // "Al-Fatihah"
    nameArabic: raw.name_arabic, // "الفاتحة"
    meaning: raw.translated_name?.name, // "The Opener"
    revelationPlace: raw.revelation_place, // "makkah" | "madinah"
    versesCount: raw.verses_count,
    bismillahPre: raw.bismillah_pre, // does the surah start with the Bismillah?
    pages: raw.pages, // [first, last] page in the Madani mushaf, e.g. [2, 49]
  };

  const problems = [];
  if (!Number.isInteger(chapter.id)) problems.push('id');
  for (const key of ['nameSimple', 'nameArabic', 'meaning', 'revelationPlace']) {
    if (typeof chapter[key] !== 'string' || chapter[key] === '') problems.push(key);
  }
  if (!Number.isInteger(chapter.versesCount) || chapter.versesCount < 1) problems.push('versesCount');
  if (typeof chapter.bismillahPre !== 'boolean') problems.push('bismillahPre');
  const [first, last] = chapter.pages ?? [];
  if (!(Number.isInteger(first) && Number.isInteger(last) && first >= 1 && last >= first && last <= 604)) {
    problems.push('pages');
  }

  if (problems.length) {
    throw new Error(`Chapter ${raw.id ?? '?'} has missing/invalid: ${problems.join(', ')}`);
  }
  return chapter;
}

async function fetchChapters() {
  console.log('Fetching surah list...');
  const data = await apiGet('/chapters', { language: 'en' });

  if (!Array.isArray(data.chapters)) {
    throw new Error('Unexpected response: no "chapters" list.');
  }
  const chapters = data.chapters.map(toChapter).sort((a, b) => a.id - b.id);

  // The meaning of each surah's name in every site language: { en: "The Cow", id: "Sapi Betina" }
  for (const chapter of chapters) chapter.translatedNames = { [MAIN_LANGUAGE.lang]: chapter.meaning };
  for (const { lang } of OTHER_LANGUAGES) {
    const other = await apiGet('/chapters', { language: lang });
    for (const raw of other.chapters ?? []) {
      const chapter = chapters.find((c) => c.id === raw.id);
      const name = raw.translated_name?.name;
      if (chapter && name) chapter.translatedNames[lang] = name;
    }
    const missing = chapters.filter((c) => !c.translatedNames[lang]).map((c) => c.id);
    if (missing.length) throw new Error(`No "${lang}" surah meaning for: ${missing.join(', ')}. Nothing saved.`);
  }

  // Every id must be a real surah number (1-114) and appear only once
  const ids = chapters.map((c) => c.id);
  const validIds = ids.every((id) => id >= 1 && id <= SURAH_COUNT) && new Set(ids).size === ids.length;
  if (!validIds) {
    throw new Error(`Invalid or duplicate surah numbers: ${ids.join(', ')}. Nothing saved.`);
  }

  // Public and production must have all 114. Pre-live (test keys) only has a few.
  if (environmentName !== 'prelive' && chapters.length !== SURAH_COUNT) {
    throw new Error(`Expected ${SURAH_COUNT} surahs, got ${chapters.length}. Nothing saved.`);
  }
  if (chapters.length !== SURAH_COUNT) {
    console.warn(`  Note: ${environmentName} only has ${chapters.length} surahs (${ids.join(', ')}).`);
  }

  await writeJsonSafely(CHAPTERS_FILE, {
    source: 'Quran.com / Quran Foundation API v4',
    chapters,
  });
  console.log(`  Saved ${chapters.length} surahs to ${CHAPTERS_FILE}`);
  return chapters;
}

// ---------- Verses ----------

// The translation contains footnote markers like "Meem.<sup foot_note=195935>1</sup>".
// We don't show footnotes, so remove them (and any other tag) to get plain text.
function cleanTranslation(html) {
  return html
    .replace(/<sup[^>]*>.*?<\/sup>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// "end" items are the verse-number sign; we draw our own markers instead
const onlyWords = (rawVerse) => rawVerse.words.filter((w) => w.char_type_name === 'word');

// One word: its Arabic, meaning (main language for now) and transliteration (how it sounds).
function toWord(raw, verseKey) {
  const word = {
    text: raw.text_uthmani,
    meanings: { [MAIN_LANGUAGE.lang]: raw.translation?.text },
    transliteration: raw.transliteration?.text ?? null,
    // Mushaf page and line (1-15). Replaced by addPositions() with the reliable values.
    page: raw.page_number,
    line: raw.line_number,
  };
  if (!Number.isInteger(word.page) || !Number.isInteger(word.line) || word.line < 1 || word.line > 15) {
    throw new Error(`Word ${raw.position} in ${verseKey} has no valid mushaf page/line.`);
  }
  if (!word.text || !word.meanings[MAIN_LANGUAGE.lang]) {
    throw new Error(`Word ${raw.position} in ${verseKey} is missing its text or meaning.`);
  }
  return word;
}

function toVerse(raw) {
  const translations = {};
  for (const { lang, translationId } of LANGUAGES) {
    const found = raw.translations?.find((t) => t.resource_id === translationId);
    if (!found?.text) throw new Error(`Verse ${raw.verse_key} is missing its "${lang}" translation.`);
    translations[lang] = cleanTranslation(found.text);
  }
  if (!raw.text_uthmani) throw new Error(`Verse ${raw.verse_key} is missing its Arabic.`);

  const words = onlyWords(raw).map((w) => toWord(w, raw.verse_key));
  if (words.length === 0) throw new Error(`Verse ${raw.verse_key} has no words.`);

  return {
    number: raw.verse_number,
    key: raw.verse_key, // "2:255"
    text: raw.text_uthmani,
    translations,
    page: raw.page_number, // page in the standard Madani mushaf
    juz: raw.juz_number,
    sajdah: raw.sajdah_number !== null, // verse of prostration
    words,
  };
}

// Download every verse of one surah, 50 at a time, following the API's pages.
async function fetchAllPages(chapterId, params) {
  const verses = [];
  let page = 1;
  while (page) {
    const data = await apiGet(`/verses/by_chapter/${chapterId}`, {
      ...params,
      per_page: VERSES_PER_REQUEST,
      page,
    });
    verses.push(...data.verses);
    page = data.pagination?.next_page ?? null; // null = that was the last page
  }
  return verses;
}

/*
  1. Main request: Arabic, all translations, and word meanings in the main language.
  2. One extra request per other language: the API gives word meanings in the
     language we ask for, so we fetch the words again and add those meanings.
*/
async function fetchVerses(chapterId) {
  const raw = await fetchAllPages(chapterId, {
    language: MAIN_LANGUAGE.lang,
    words: 'true',
    word_fields: 'text_uthmani',
    fields: 'text_uthmani',
    translations: LANGUAGES.map((l) => l.translationId).join(','),
    mushaf: MUSHAF_LAYOUT, // which printed layout the word page/line numbers refer to
  });
  const verses = raw.map(toVerse);

  for (const { lang } of OTHER_LANGUAGES) {
    const other = await fetchAllPages(chapterId, { language: lang, words: 'true', word_fields: 'text_uthmani' });
    if (other.length !== verses.length) throw new Error(`"${lang}" word meanings: verse count differs.`);

    other.forEach((rawVerse, i) => {
      const words = onlyWords(rawVerse);
      const target = verses[i].words;
      // Same words in the same order, or we refuse to mix them
      if (words.length !== target.length || words.some((w, j) => w.text_uthmani !== target[j].text)) {
        throw new Error(`"${lang}" word meanings don't line up in ${verses[i].key}.`);
      }
      words.forEach((w, j) => {
        if (!w.translation?.text) throw new Error(`Word ${j + 1} in ${verses[i].key} has no "${lang}" meaning.`);
        target[j].meanings[lang] = w.translation.text;
      });
    });
  }

  await addPositions(chapterId, verses);
  return verses;
}

/*
  Word positions (page + line) come from their OWN request, with no word_fields.
  Why: asking for word_fields=text_uthmani makes the API report some words one page off
  (e.g. 68:16 shows as 564:1 instead of 565:1). Without word_fields the positions are right.
*/
async function addPositions(chapterId, verses) {
  const raw = await fetchAllPages(chapterId, { words: 'true', mushaf: MUSHAF_LAYOUT });
  if (raw.length !== verses.length) throw new Error(`Positions: verse count differs in surah ${chapterId}.`);
  raw.forEach((rawVerse, i) => setPositions(verses[i], onlyWords(rawVerse)));
}

// Copy page/line onto a saved verse's words (same number of words, same order)
function setPositions(verse, rawWords) {
  if (rawWords.length !== verse.words.length) {
    throw new Error(`Positions for ${verse.key}: ${rawWords.length} words, expected ${verse.words.length}.`);
  }
  rawWords.forEach((w, i) => {
    if (!Number.isInteger(w.page_number) || !Number.isInteger(w.line_number)) {
      throw new Error(`Word ${i + 1} in ${verse.key} has no page/line.`);
    }
    verse.words[i].page = w.page_number;
    verse.words[i].line = w.line_number;
  });
}

// A saved file only counts if it has exactly the current languages (an old format gets refetched)
async function isUpToDate(file) {
  if (!existsSync(file)) return false;
  try {
    const saved = JSON.parse(await readFile(file, 'utf8'));
    return saved.formatVersion === FORMAT_VERSION && JSON.stringify(saved.languages) === JSON.stringify(LANGUAGES);
  } catch {
    return false; // unreadable = fetch again
  }
}

async function fetchSurah(chapter, { force }) {
  const file = `${SURAHS_DIR}/${String(chapter.id).padStart(3, '0')}.json`; // 1 -> 001.json
  if (!force && (await isUpToDate(file))) return 'skipped';

  const verses = await fetchVerses(chapter.id);

  // Must be exactly verses 1..versesCount, in order. Otherwise save nothing.
  const complete =
    verses.length === chapter.versesCount && verses.every((v, i) => v.number === i + 1);
  if (!complete) {
    throw new Error(
      `${chapter.nameSimple}: expected ${chapter.versesCount} verses, got ${verses.length}. Nothing saved.`,
    );
  }

  await writeJsonSafely(file, {
    ...chapter,
    formatVersion: FORMAT_VERSION,
    languages: LANGUAGES,
    source: 'Quran.com / Quran Foundation API v4',
    verses,
  });
  return 'saved';
}

// ---------- Mushaf layout of each surah ----------

const LINES_PER_PAGE = 15;

// The line just above (page, line); line 1 wraps to line 15 of the previous page
const lineAbove = ({ page, line }) => (line > 1 ? { page, line: line - 1 } : { page: page - 1, line: LINES_PER_PAGE });

/*
  Works out, from the saved word positions, where each surah sits in the mushaf:
    titleAt / bismillahAt: the empty lines above the first word (they can be on the
    PREVIOUS page, e.g. An-Nisa's title is on line 15 of page 76)
    pages: [page of the title, page of the last word]
  We don't use the API's own chapter page ranges: a few are wrong (e.g. 'Abasa ends on 586, not 585).
*/
/*
  Works out the layout, checks it, and repairs what the API got wrong:
  the whole-surah request sometimes reports a word one page off (e.g. 68:16, 80:41),
  while asking for that single verse gives the right position. So we re-download
  just the suspicious verses one by one and check again (up to 3 rounds).
*/
async function addMushafLayout(chapters) {
  const MAX_ROUNDS = 3;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const allWords = await computeLayout(chapters);
    const problems = findLayoutProblems(chapters, allWords);
    if (problems.length === 0) {
      await writeJsonSafely(CHAPTERS_FILE, { source: 'Quran.com / Quran Foundation API v4', chapters });
      return;
    }
    const messages = [...new Set(problems.map((p) => p.message))];
    if (round === MAX_ROUNDS) {
      throw new Error(`Mushaf layout problems remain:\n  ${messages.slice(0, 10).join('\n  ')}`);
    }
    const keys = [...new Set(problems.flatMap((p) => p.keys))];
    console.log(`  Layout check found ${messages.length} problem(s); re-checking ${keys.length} verse(s) one by one...`);
    await repairVersePositions(keys);
  }
}

// Fills in titleAt / bismillahAt / pages; returns every word of the Quran in reading order
async function computeLayout(chapters) {
  const allWords = [];
  for (const chapter of chapters) {
    const file = `${SURAHS_DIR}/${String(chapter.id).padStart(3, '0')}.json`;
    if (!existsSync(file)) continue;
    const { verses } = JSON.parse(await readFile(file, 'utf8'));
    const first = verses[0].words[0];
    const last = verses.at(-1).words.at(-1);

    // Al-Fatihah's Bismillah is verse 1 (in the text), At-Tawbah has none: both only need a title line
    const bismillahAt = chapter.bismillahPre ? lineAbove(first) : null;
    const titleAt = lineAbove(bismillahAt ?? first);

    chapter.titleAt = titleAt;
    chapter.bismillahAt = bismillahAt;
    chapter.pages = [titleAt.page, last.page];
    for (const v of verses) for (const w of v.words) allWords.push({ key: v.key, page: w.page, line: w.line });
  }
  return allWords;
}

/*
  Safety checks on the layout:
    1. Reading order: each word is on the same line as the previous one, or later.
    2. No word on a line reserved for a surah title or Bismillah.
  Returns [{ message, keys }]: keys = the verses to re-check.
*/
function findLayoutProblems(chapters, allWords) {
  const problems = [];
  const position = (w) => w.page * 100 + w.line; // page 586 line 15 -> 58615
  allWords.forEach((w, i) => {
    const before = allWords[i - 1];
    if (before && position(w) < position(before)) {
      problems.push({ message: `${w.key} (${w.page}:${w.line}) comes before ${before.key}`, keys: [w.key, before.key] });
    }
  });

  const reserved = new Map();
  for (const c of chapters) {
    if (c.titleAt) reserved.set(position(c.titleAt), c);
    if (c.bismillahAt) reserved.set(position(c.bismillahAt), c);
  }
  for (const w of allWords) {
    const owner = reserved.get(position(w));
    if (owner) {
      // either this word is misplaced, or the next surah's first verse is (which decides the title spot)
      problems.push({ message: `${w.key} sits on surah ${owner.id}'s title/Bismillah line (${w.page}:${w.line})`, keys: [w.key, `${owner.id}:1`] });
    }
  }
  return problems;
}

// Re-download single verses (reliable positions) and correct their words' page/line in the saved files
async function repairVersePositions(keys) {
  const bySurah = new Map();
  for (const key of keys) {
    const surah = Number(key.split(':')[0]);
    bySurah.set(surah, [...(bySurah.get(surah) ?? []), key]);
  }

  for (const [surahId, surahKeys] of bySurah) {
    const file = `${SURAHS_DIR}/${String(surahId).padStart(3, '0')}.json`;
    const saved = JSON.parse(await readFile(file, 'utf8'));
    for (const key of surahKeys) {
      // No word_fields here, on purpose: see addPositions()
      const { verse } = await apiGet(`/verses/by_key/${key}`, { words: 'true', mushaf: MUSHAF_LAYOUT });
      const target = saved.verses.find((v) => v.key === key);
      if (!target) throw new Error(`Couldn't re-check ${key}: not in the saved surah.`);
      setPositions(target, onlyWords(verse));
    }
    await writeJsonSafely(file, saved);
  }
}

// ---------- Run ----------

// Read --only=1,2 and --force from the command line
function readOptions(args) {
  const only = args.find((a) => a.startsWith('--only='));
  return {
    force: args.includes('--force'),
    only: only ? only.slice('--only='.length).split(',').map(Number) : null,
  };
}

try {
  const options = readOptions(process.argv.slice(2));
  console.log(`Source: ${environmentName} API`);

  const chapters = await fetchChapters();
  const wanted = options.only ? chapters.filter((c) => options.only.includes(c.id)) : chapters;

  console.log(`Fetching verses for ${wanted.length} surah(s)...`);
  for (const chapter of wanted) {
    const result = await fetchSurah(chapter, options);
    console.log(`  ${String(chapter.id).padStart(3)} ${chapter.nameSimple}: ${result}`);
  }

  await addMushafLayout(chapters);
  console.log(`  Saved mushaf layout (title lines, page ranges) to ${CHAPTERS_FILE}`);
  console.log('Done.');
} catch (err) {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1); // non-zero = "this failed", so other tools notice
}
