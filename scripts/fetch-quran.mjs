/*
  fetch-quran.mjs: downloads Quran data from the Quran Foundation API
  and saves it as JSON in src/data, so the site never calls the API.

  Run:  npm run fetch:quran
  Source: QF_ENV in .env = "public" (default, Quran.com open API, no keys),
          "prelive" or "production" (keyed API: QF_CLIENT_ID, QF_CLIENT_SECRET)

  Part 1 (now):  the list of all 114 surahs -> src/data/chapters.json
  Part 2 (next): verses, words and translation -> src/data/surahs/001.json ...
*/

// Load .env BEFORE importing the API module, because it reads the keys on load.
try {
  process.loadEnvFile('.env');
} catch {
  console.error('No .env file found. Run this from the project root.');
  process.exit(1);
}
const { apiGet, environmentName } = await import('./lib/qf-api.mjs');
const { writeJsonSafely } = await import('./lib/write-json.mjs');

const CHAPTERS_FILE = 'src/data/chapters.json';
const SURAH_COUNT = 114;

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
}

// ---------- Run ----------
try {
  console.log(`Source: ${environmentName} API`);
  await fetchChapters();
  console.log('Done.');
} catch (err) {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1); // non-zero = "this failed", so other tools notice
}
