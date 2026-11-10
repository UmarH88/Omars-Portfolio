/*
  fetch-quran.mjs: downloads Quran data from the Quran Foundation API
  and saves it as JSON in src/data, so the site never calls the API.

  Run:
    npm run fetch:quran                    all surahs (skips ones already saved)
    npm run fetch:quran -- --only=1,2      just these surahs
    npm run fetch:quran -- --force         download again even if saved
  Source: QF_ENV in .env = "public" (default, Quran.com open API, no keys),
          "prelive" or "production" (keyed API: QF_CLIENT_ID, QF_CLIENT_SECRET)

  Saves:
    src/data/chapters.json          the list of surahs
    src/data/surahs/001.json ...    verses, words, meanings, translation
*/
import { existsSync } from 'node:fs';

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

// Translation shown on the site. Name and id checked against /resources/translations.
const TRANSLATION = { id: 20, name: 'Saheeh International' };

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
  };

  const problems = [];
  if (!Number.isInteger(chapter.id)) problems.push('id');
  for (const key of ['nameSimple', 'nameArabic', 'meaning', 'revelationPlace']) {
    if (typeof chapter[key] !== 'string' || chapter[key] === '') problems.push(key);
  }
  if (!Number.isInteger(chapter.versesCount) || chapter.versesCount < 1) problems.push('versesCount');
  if (typeof chapter.bismillahPre !== 'boolean') problems.push('bismillahPre');

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

// One word: its Arabic, English meaning and transliteration (how it sounds).
function toWord(raw, verseKey) {
  const word = {
    text: raw.text_uthmani,
    meaning: raw.translation?.text,
    transliteration: raw.transliteration?.text ?? null,
  };
  if (!word.text || !word.meaning) {
    throw new Error(`Word ${raw.position} in ${verseKey} is missing its text or meaning.`);
  }
  return word;
}

function toVerse(raw) {
  const translation = raw.translations?.find((t) => t.resource_id === TRANSLATION.id);
  if (!raw.text_uthmani || !translation?.text) {
    throw new Error(`Verse ${raw.verse_key} is missing its Arabic or translation.`);
  }

  // "end" items are the verse-number sign; we draw our own markers instead
  const words = raw.words.filter((w) => w.char_type_name === 'word').map((w) => toWord(w, raw.verse_key));
  if (words.length === 0) throw new Error(`Verse ${raw.verse_key} has no words.`);

  return {
    number: raw.verse_number,
    key: raw.verse_key, // "2:255"
    text: raw.text_uthmani,
    translation: cleanTranslation(translation.text),
    page: raw.page_number, // page in the standard Madani mushaf
    juz: raw.juz_number,
    sajdah: raw.sajdah_number !== null, // verse of prostration
    words,
  };
}

// Download every verse of one surah, 50 at a time, following the API's pages.
async function fetchVerses(chapterId) {
  const verses = [];
  let page = 1;
  while (page) {
    const data = await apiGet(`/verses/by_chapter/${chapterId}`, {
      language: 'en',
      words: 'true',
      word_fields: 'text_uthmani',
      fields: 'text_uthmani',
      translations: TRANSLATION.id,
      per_page: VERSES_PER_REQUEST,
      page,
    });
    verses.push(...data.verses.map(toVerse));
    page = data.pagination?.next_page ?? null; // null = that was the last page
  }
  return verses;
}

async function fetchSurah(chapter, { force }) {
  const file = `${SURAHS_DIR}/${String(chapter.id).padStart(3, '0')}.json`; // 1 -> 001.json
  if (!force && existsSync(file)) return 'skipped';

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
    translation: TRANSLATION,
    source: 'Quran.com / Quran Foundation API v4',
    verses,
  });
  return 'saved';
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
  console.log('Done.');
} catch (err) {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1); // non-zero = "this failed", so other tools notice
}
