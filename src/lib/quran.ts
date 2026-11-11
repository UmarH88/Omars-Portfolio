/*
  quran.ts: the ONE place that knows how Quran data is stored.
  Pages import from here instead of reading JSON files themselves, so if the
  data format ever changes, only this file needs updating.
*/
import chaptersFile from '../data/chapters.json';

// ---------- Types (the shape of our JSON files) ----------
export interface Chapter {
  id: number;
  nameSimple: string; // "Al-Fatihah"
  nameArabic: string; // "الفاتحة"
  meaning: string; // "The Opener"
  translatedNames: { en: string; id: string }; // the meaning in each site language
  revelationPlace: 'makkah' | 'madinah';
  versesCount: number;
  bismillahPre: boolean;
  pages: [number, number]; // first page (with its title) and last page in the Madani mushaf
  titleAt: MushafSpot; // where the surah's title bar is printed
  bismillahAt: MushafSpot | null; // where its Bismillah line is (null: Al-Fatihah, At-Tawbah)
}

export interface MushafSpot {
  page: number;
  line: number;
}

// Languages on the site. Must match LANGUAGES in scripts/fetch-quran.mjs.
export type Lang = 'en' | 'id';
export const DEFAULT_LANG: Lang = 'en';
export const LANGUAGE_LABELS: Record<Lang, string> = { en: 'English', id: 'Indonesia' };

export interface Word {
  text: string;
  meanings: Record<Lang, string>; // { en: "the Most Gracious", id: "Maha Pengasih" }
  transliteration: string | null;
  page: number; // page in the 15-line Madani mushaf
  line: number; // line on that page (1-15)
}

export interface Verse {
  number: number;
  key: string; // "2:255"
  text: string;
  translations: Record<Lang, string>;
  page: number;
  juz: number;
  sajdah: boolean;
  words: Word[];
}

export interface Surah extends Chapter {
  languages: { lang: Lang; translationId: number; name: string }[];
  source: string;
  verses: Verse[];
}

// ---------- Chapters ----------
export const chapters = chaptersFile.chapters as Chapter[];

export function getChapter(id: number): Chapter | undefined {
  return chapters.find((c) => c.id === id);
}

// "makkah" -> "Makkah" (the same in English and Indonesian)
export function placeLabel(place: Chapter['revelationPlace']): string {
  return place === 'makkah' ? 'Makkah' : 'Madinah';
}

// ---------- Full surahs (verses + words) ----------
// import.meta.glob finds every surah file at build time. "eager: false" means
// each file is only loaded when a page actually asks for it.
const surahFiles = import.meta.glob<{ default: Surah }>('../data/surahs/*.json');

function surahFilePath(id: number): string {
  return `../data/surahs/${String(id).padStart(3, '0')}.json`; // 1 -> 001.json
}

// True if the verses for this surah have been downloaded
export function hasSurahData(id: number): boolean {
  return surahFilePath(id) in surahFiles;
}

export async function getSurah(id: number): Promise<Surah> {
  const load = surahFiles[surahFilePath(id)];
  if (!load) {
    throw new Error(`No data for surah ${id}. Run: npm run fetch:quran`);
  }
  return (await load()).default;
}

// ---------- Tafsir (surah introductions + verse explanations) ----------
// Saved by scripts/fetch-tafsir.mjs. HTML is already cleaned to simple safe tags.
export interface TafsirFile {
  surah: number;
  about: {
    source: string; // "Sayyid Abul Ala Maududi - Tafhim al-Qur'an ..."
    summary: string;
    sections: { title: string | null; html: string }[]; // "Name", "Period of Revelation", ...
  };
  tafsir: {
    id: number;
    name: string; // "Ibn Kathir (Abridged)"
    author: string;
    passages: { from: number; to: number; html: string }[]; // one passage can explain several verses
  };
  source: string;
}

const tafsirFiles = import.meta.glob<{ default: TafsirFile }>('../data/tafsir/*.json');
const tafsirPath = (id: number) => `../data/tafsir/${String(id).padStart(3, '0')}.json`;

export function hasTafsir(id: number): boolean {
  return tafsirPath(id) in tafsirFiles;
}

export async function getTafsir(id: number): Promise<TafsirFile | null> {
  const load = tafsirFiles[tafsirPath(id)];
  return load ? (await load()).default : null;
}

/*
  Easy tafsir: short, plain-language versions in English and Indonesian, written by
  simplifying ONLY the saved source texts above (Omar's decision, 2026-11-11).
  Plain text only (no HTML). The full original stays available on the page.
*/
export interface SimpleTafsirText {
  sections: { title: string; paragraphs: string[] }[];
  verses: { from: number; to: number; paragraphs: string[] }[];
}

export interface SimpleTafsirFile extends Record<Lang, SimpleTafsirText> {
  surah: number;
  basedOn: string[];
}

const simpleTafsirFiles = import.meta.glob<{ default: SimpleTafsirFile }>('../data/tafsir-simple/*.json');

export async function getSimpleTafsir(id: number): Promise<SimpleTafsirFile | null> {
  const load = simpleTafsirFiles[`../data/tafsir-simple/${String(id).padStart(3, '0')}.json`];
  return load ? (await load()).default : null;
}

// ---------- Mushaf display ----------

// What Mushaf mode needs to draw a verse: its number, words and mushaf page.
export type MushafVerse = Pick<Verse, 'number' | 'page' | 'juz' | 'words'>;

/*
  Al-Fatihah numbering (Omar's choice): the Bismillah is NOT counted as a verse.
  The API uses the Hafs/Kufan count (Bismillah = verse 1). Here we renumber for display:
    - API verse 1 (Bismillah) is returned separately, without a number
    - API verses 2-6 become verses 1-5
    - API verse 7 is split after its 4th word ("عَلَيْهِمْ"): first part = verse 6, rest = verse 7
  No text is typed by hand; only the API's own words are regrouped.
*/
const FATIHAH_SPLIT_AFTER_WORD = 4;

export function fatihahForMushaf(verses: Verse[]): { bismillah: Verse; verses: MushafVerse[] } {
  const [bismillah, ...rest] = verses;
  const last = rest.at(-1);

  // Safety check: stop the build rather than show a wrong split
  if (verses.length !== 7 || last?.words[FATIHAH_SPLIT_AFTER_WORD - 1]?.text !== 'عَلَيْهِمْ') {
    throw new Error('Al-Fatihah data is not in the expected shape; check fatihahForMushaf().');
  }

  const renumbered: MushafVerse[] = rest.slice(0, -1).map((v) => ({ ...v, number: v.number - 1 }));
  renumbered.push(
    { number: 6, page: last.page, juz: last.juz, words: last.words.slice(0, FATIHAH_SPLIT_AFTER_WORD) },
    { number: 7, page: last.page, juz: last.juz, words: last.words.slice(FATIHAH_SPLIT_AFTER_WORD) },
  );
  return { bismillah, verses: renumbered };
}

// ---------- Study display ----------

/*
  One row in Study mode: the Arabic (one or more numbered pieces) + its translation.
  Normally one row = one verse. Al-Fatihah is special (see fatihahForMushaf):
  the Bismillah row has no number, and verses 6 and 7 share one row, because the
  translation exists only for the API's whole last verse.
*/
export interface StudyRow {
  anchor: string; // id for links, e.g. "v-5"
  label: string | null; // "5", "6–7", or null for the Bismillah
  segments: { number: number | null; words: Word[] }[];
  translations: Record<Lang, string>;
}

export function studyRows(surah: Surah): StudyRow[] {
  if (surah.id !== 1) {
    return surah.verses.map((v) => ({
      anchor: `v-${v.number}`,
      label: String(v.number),
      segments: [{ number: v.number, words: v.words }],
      translations: v.translations,
    }));
  }

  const { bismillah, verses: shown } = fatihahForMushaf(surah.verses);
  const api = surah.verses; // API (Hafs) verses 1-7, for their translations
  const rows: StudyRow[] = [
    {
      anchor: 'bismillah',
      label: null,
      segments: [{ number: null, words: bismillah.words }],
      translations: bismillah.translations,
    },
  ];
  // Shown verses 1-5 = API verses 2-6
  for (const v of shown.slice(0, 5)) {
    rows.push({
      anchor: `v-${v.number}`,
      label: String(v.number),
      segments: [v],
      translations: api[v.number].translations,
    });
  }
  // Shown verses 6 and 7 = API verse 7
  rows.push({ anchor: 'v-6', label: '6–7', segments: shown.slice(5), translations: api[6].translations });
  return rows;
}

// ---------- Helpers ----------

// Group verses by their page in the printed (Madani) mushaf, in order.
// Each page also gets the juz (one of the Quran's 30 parts) of its first verse, as printed mushafs show.
export function groupByMushafPage<T extends { page: number; juz: number }>(
  verses: T[],
): { page: number; juz: number; verses: T[] }[] {
  const pages: { page: number; juz: number; verses: T[] }[] = [];
  for (const verse of verses) {
    const current = pages.at(-1);
    if (current?.page === verse.page) current.verses.push(verse);
    else pages.push({ page: verse.page, juz: verse.juz, verses: [verse] });
  }
  return pages;
}

// 255 -> "٢٥٥" (Arabic-Indic digits, as printed in a mushaf)
export const arabicNumber = (n: number) => n.toLocaleString('ar-EG');

// ---------- Mushaf pages (the whole Quran, page by page) ----------

export const MUSHAF_PAGES = 604;
export const LINES_PER_PAGE = 15;

/*
  One line of a mushaf page is one of:
    - words: Arabic words (and verse markers) printed on that line
    - title: the bar with a surah's name, where a new surah starts
    - bismillah: the Bismillah line under a surah title
    - empty: nothing printed (pages 1-2 have short, centred layouts)
*/
export type LineItem = { kind: 'word'; word: Word } | { kind: 'marker'; number: number };
// Every printed line belongs to one surah (`surah`), so Surah mode can show just that surah's lines
export type MushafLine =
  | { kind: 'words'; surah: number; items: LineItem[] }
  | { kind: 'title'; surah: number; chapter: Chapter }
  | { kind: 'bismillah'; surah: number; words: Word[] }
  | { kind: 'empty' };

export interface MushafPageData {
  page: number;
  juz: number;
  chapters: Chapter[]; // surahs that appear on this page
  lines: MushafLine[]; // always 15
}

/*
  Builds one page from the word positions in the data (each word knows its page and line).
  Lines with no words are where a surah title and Bismillah go, exactly like the printed mushaf.
*/
export async function getMushafPage(page: number): Promise<MushafPageData> {
  const onPage = chapters.filter((c) => c.pages[0] <= page && page <= c.pages[1]);
  const lines: MushafLine[] = Array.from({ length: LINES_PER_PAGE }, () => ({ kind: 'empty' }));
  const bismillahWords = (await getSurah(1)).verses[0].words; // the API's own words of 1:1
  let juz = 0;

  const addItem = (line: number, surah: number, item: LineItem) => {
    const slot = lines[line - 1];
    if (slot.kind === 'words') slot.items.push(item);
    else lines[line - 1] = { kind: 'words', surah, items: [item] };
  };

  for (const chapter of onPage) {
    const surah = await getSurah(chapter.id);
    // Al-Fatihah uses Omar's numbering (Bismillah not counted, see fatihahForMushaf)
    const fatihah = chapter.id === 1 ? fatihahForMushaf(surah.verses) : null;
    const segments: { number: number | null; words: Word[]; juz: number }[] = fatihah
      ? [{ number: null, words: fatihah.bismillah.words, juz: fatihah.bismillah.juz }, ...fatihah.verses]
      : surah.verses;

    for (const segment of segments) {
      const here = segment.words.filter((w) => w.page === page);
      if (here.length === 0) continue;
      juz ||= segment.juz;
      for (const word of here) addItem(word.line, chapter.id, { kind: 'word', word });
      // The verse marker goes after the verse's last word, if that word is on this page
      const last = segment.words.at(-1)!;
      if (segment.number !== null && last.page === page) {
        addItem(last.line, chapter.id, { kind: 'marker', number: segment.number });
      }
    }

    // Title and Bismillah: their exact spots were worked out by the fetch script
    // (they can be on the page BEFORE the surah's first words)
    if (chapter.titleAt.page === page) {
      lines[chapter.titleAt.line - 1] = { kind: 'title', surah: chapter.id, chapter };
    }
    if (chapter.bismillahAt?.page === page) {
      lines[chapter.bismillahAt.line - 1] = { kind: 'bismillah', surah: chapter.id, words: bismillahWords };
    }
  }

  return { page, juz, chapters: onPage, lines };
}

// ---------- Links ----------
// Mushaf, Page mode: the real pages, one at a time
export const mushafPageUrl = (page: number) => `/mushaf/${page}`;
// The page where a surah starts, scrolled to its title
export const surahPageUrl = (id: number) => {
  const chapter = getChapter(id);
  return chapter ? `${mushafPageUrl(chapter.pages[0])}#surah-${id}` : mushafPageUrl(1);
};
// Mushaf, Surah mode: one surah on its own (still on the real mushaf lines)
export const mushafUrl = (id: number) => `/quran/${id}`;
export const studyUrl = (id: number) => `/quran/${id}/study`;
