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
  revelationPlace: 'makkah' | 'madinah';
  versesCount: number;
  bismillahPre: boolean;
}

// Languages on the site. Must match LANGUAGES in scripts/fetch-quran.mjs.
export type Lang = 'en' | 'id';
export const DEFAULT_LANG: Lang = 'en';
export const LANGUAGE_LABELS: Record<Lang, string> = { en: 'English', id: 'Indonesia' };

export interface Word {
  text: string;
  meanings: Record<Lang, string>; // { en: "the Most Gracious", id: "Maha Pengasih" }
  transliteration: string | null;
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

// "makkah" -> "Makkah"
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

// ---------- Mushaf display ----------

// What Mushaf mode needs to draw a verse: its number, words and mushaf page.
export type MushafVerse = Pick<Verse, 'number' | 'page' | 'words'>;

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
    { number: 6, page: last.page, words: last.words.slice(0, FATIHAH_SPLIT_AFTER_WORD) },
    { number: 7, page: last.page, words: last.words.slice(FATIHAH_SPLIT_AFTER_WORD) },
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
export function groupByMushafPage<T extends { page: number }>(verses: T[]): { page: number; verses: T[] }[] {
  const pages: { page: number; verses: T[] }[] = [];
  for (const verse of verses) {
    const current = pages.at(-1);
    if (current?.page === verse.page) current.verses.push(verse);
    else pages.push({ page: verse.page, verses: [verse] });
  }
  return pages;
}

// 255 -> "٢٥٥" (Arabic-Indic digits, as printed in a mushaf)
export const arabicNumber = (n: number) => n.toLocaleString('ar-EG');

// ---------- Links ----------
export const mushafUrl = (id: number) => `/quran/${id}`;
export const studyUrl = (id: number) => `/quran/${id}/study`;
