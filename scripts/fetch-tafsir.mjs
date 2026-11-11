/*
  fetch-tafsir.mjs: downloads, for each surah:
    - its introduction (name, period of revelation, theme, history) from
      Tafhim al-Qur'an by Sayyid Abul A'la Maududi (Quran.com "chapter info")
    - Tafsir Ibn Kathir (Abridged), which explains verses in groups
  and saves it as src/data/tafsir/100.json ... so the site never calls the API.

  Run:
    npm run fetch:tafsir                    surahs 100-114 (skips ones already saved)
    npm run fetch:tafsir -- --only=1,2      just these surahs
    npm run fetch:tafsir -- --force         download again even if saved
*/
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

try {
  process.loadEnvFile('.env');
} catch {
  console.log('No .env file: using the public API.');
}
const { apiGet, environmentName } = await import('./lib/qf-api.mjs');
const { writeJsonSafely } = await import('./lib/write-json.mjs');

const TAFSIR_DIR = 'src/data/tafsir';
const DEFAULT_SURAHS = range(100, 114);
const VERSES_PER_REQUEST = 50;

/*
  Published tafsirs, in order of preference (checked against /resources/tafsirs).
  The API's Ibn Kathir has gaps (e.g. Surah 105 is empty), so the next one is a
  backup. The saved file records which tafsir was used, and the page shows it.
*/
const TAFSIRS = [
  { id: 169, name: 'Ibn Kathir (Abridged)', author: 'Hafiz Ibn Kathir' },
  { id: 168, name: "Ma'arif al-Qur'an", author: 'Mufti Muhammad Shafi' },
];

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// ---------- Cleaning the API's HTML ----------
/*
  The API text is HTML. We keep only simple, safe tags and drop every attribute
  (classes, styles, links), so nothing unexpected can end up in our pages.
*/
const ALLOWED = new Set(['p', 'h2', 'h3', 'h4', 'em', 'strong', 'ul', 'ol', 'li', 'br', 'blockquote']);
const RENAME = { b: 'strong', i: 'em' };

function cleanHtml(html) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '') // never keep code
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '') // footnote numbers
    .replace(/<\/?([a-z0-9]+)[^>]*>/gi, (tag, rawName) => {
      const name = RENAME[rawName.toLowerCase()] ?? rawName.toLowerCase();
      if (!ALLOWED.has(name)) return ''; // drop the tag, keep its text
      if (name === 'br') return '<br>';
      return tag.startsWith('</') ? `</${name}>` : `<${name}>`;
    })
    .replace(/<p>\s*<\/p>/g, '') // empty paragraphs
    .replace(/\bHadrat\s+/g, '') // Omar's choice: no "Hadrat" title before names
    .replace(/\s+/g, ' ')
    .trim();
}

const plainText = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// Split the introduction at its <h2> headings: [{ title, html }]
function toSections(html) {
  const parts = cleanHtml(html).split(/<h2>(.*?)<\/h2>/);
  const sections = [];
  if (plainText(parts[0])) sections.push({ title: null, html: parts[0].trim() });
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ title: plainText(parts[i]), html: (parts[i + 1] ?? '').trim() });
  }
  return sections;
}

// ---------- Downloads ----------

async function fetchAbout(surahId) {
  const { chapter_info: info } = await apiGet(`/chapters/${surahId}/info`, { language: 'en' });
  if (!info?.text || !info?.source) throw new Error(`Surah ${surahId}: no introduction found.`);
  const sections = toSections(info.text);
  if (sections.length === 0) throw new Error(`Surah ${surahId}: introduction is empty.`);
  return { source: info.source, summary: plainText(info.short_text ?? ''), sections };
}

/*
  Ibn Kathir explains verses in groups: the explanation is stored on the first
  verse of the group, and the other verses are empty. We turn that into passages:
  [{ from: 1, to: 6, html }].
*/
// Returns the passages, or null if this tafsir has no text for the surah
async function fetchPassages(tafsirId, surahId, versesCount) {
  const entries = [];
  let page = 1;
  while (page) {
    const data = await apiGet(`/tafsirs/${tafsirId}/by_chapter/${surahId}`, {
      per_page: VERSES_PER_REQUEST,
      page,
    });
    entries.push(...data.tafsirs);
    page = data.pagination?.next_page ?? null;
  }

  const starts = entries
    .map((t) => ({
      verse: Number(t.verse_key.split(':')[1]),
      // inside the panel, the tafsir's own headings are sub-headings (h4)
      html: cleanHtml(t.text ?? '').replace(/<(\/?)h2>/g, '<$1h4>'),
    }))
    .filter((t) => plainText(t.html))
    .sort((a, b) => a.verse - b.verse);

  // Must cover the surah from verse 1, otherwise treat this tafsir as missing
  if (starts.length === 0 || starts[0].verse !== 1) return null;
  return starts.map((s, i) => ({
    from: s.verse,
    to: (starts[i + 1]?.verse ?? versesCount + 1) - 1,
    html: s.html,
  }));
}

async function fetchSurahTafsir(chapter, { force }) {
  const file = `${TAFSIR_DIR}/${String(chapter.id).padStart(3, '0')}.json`;
  if (!force && existsSync(file)) return 'skipped';

  const about = await fetchAbout(chapter.id);

  // Use the first tafsir in TAFSIRS that covers this surah
  for (const tafsir of TAFSIRS) {
    const passages = await fetchPassages(tafsir.id, chapter.id, chapter.versesCount);
    if (!passages) continue;

    await writeJsonSafely(file, {
      surah: chapter.id,
      about,
      tafsir: { ...tafsir, passages },
      source: 'Quran.com / Quran Foundation API v4',
    });
    return `saved (${about.sections.length} intro sections, ${passages.length} passages of ${tafsir.name})`;
  }
  throw new Error(`${chapter.nameSimple}: no tafsir covers it from verse 1. Nothing saved.`);
}

// ---------- Run ----------
function readOptions(args) {
  const only = args.find((a) => a.startsWith('--only='));
  return {
    force: args.includes('--force'),
    only: only ? only.slice('--only='.length).split(',').map(Number) : DEFAULT_SURAHS,
  };
}

try {
  const options = readOptions(process.argv.slice(2));
  console.log(`Source: ${environmentName} API`);
  const { chapters } = JSON.parse(await readFile('src/data/chapters.json', 'utf8'));

  for (const id of options.only) {
    const chapter = chapters.find((c) => c.id === id);
    if (!chapter) throw new Error(`No surah ${id}. Run npm run fetch:quran first.`);
    const result = await fetchSurahTafsir(chapter, options);
    console.log(`  ${String(id).padStart(3)} ${chapter.nameSimple}: ${result}`);
  }
  console.log('Done.');
} catch (err) {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
}
